import WebSocket, { WebSocketServer } from "ws";
import { Event, Filter, matchFilter } from "nostr-tools";
import { Request, Response } from "express";

import { subscriptions, addSubscription, removeAllSubscriptions, removeSubscription, socketSafeSend, checkWSConnectionRate } from "../lib/relay/core.js";
import { compressEvent, fillEventMetadata, getEventById, getEventsByTimerange, validateFilter, parseRelayMessage, getChunkSize, filterEarlyDiscard } from "../lib/relay/utils.js";
import { initEvents } from "../lib/relay/database.js";

import { isEventValid } from "../lib/nostr/core.js";
import { logger } from "../lib/logger.js";
import { getClientInfo, isIpAllowed } from "../lib/security/ips.js";
import { isEntityBanned } from "../lib/security/banned.js";
import { isEphemeral, isReplaceable } from "../lib/nostr/NIP01.js";
import { executePlugins } from "../lib/plugins/core.js";
import { validatePow } from "../lib/nostr/NIP13.js";
import { allowedTags, eventStore, ExtendedWebSocket, MetadataEvent, RelayStatusMessage } from "../interfaces/relay.js";
import { isBase64 } from "../lib/utils.js";
import { AuthEvent } from "../interfaces/nostr.js";
import { dbMultiSelect, dbUpdate } from "../lib/database/core.js";
import { enqueueRelayTask, getEvents, getPendingHeavyTasks, getPendingLightTasks, getRelayHeavyWorkerLength, getRelayLightWorkerLength, getRelayQueueLength, relayWorkers } from "../lib/relay/workers.js";
import { parseAuthHeader } from "../lib/authorization.js";
import { getConfig, isModuleEnabled } from "../lib/config/core.js";
import { IncomingMessage } from "http";
import crypto from "crypto";

await initEvents();
const authSessions: Map<WebSocket, string> = new Map(); 

const handleWebSocketMessage = async (socket: ExtendedWebSocket, data: WebSocket.RawData, req: IncomingMessage) => {

  

  // Check if the WS connection is rate limited
  if (!socket.reqInfo) socket.reqInfo = await isIpAllowed(req, getConfig(getClientInfo(req).host, ["security","relay","maxMessageMinute"]));
  const maxMessageMinute = getConfig(socket.reqInfo.domain, ["security","relay", "maxMessageMinute"]) || 150;
  const ratePerSec = Math.max(1, Math.floor(maxMessageMinute / 60));
  const burst = Math.max(20, ratePerSec * 2);
  const { ok, overflows } = checkWSConnectionRate(`${socket.reqInfo.domain}:${socket.reqInfo.ip}`, ratePerSec, burst);
  if (!ok) {
    await socketSafeSend(socket, ["NOTICE", "rate-limited: too many messages"]);
    if (overflows === 1 || overflows % 5 === 0) {
      socket.reqInfo = await isIpAllowed(req, maxMessageMinute); 
      if (socket.reqInfo.banned) {
        await socketSafeSend(socket, ["NOTICE", socket.reqInfo?.comments || "forbidden"]);
        removeAllSubscriptions(socket, 1008);
        return;
      }
    }
    return;
  }

  // Check if current module is enabled
  if (!isModuleEnabled("relay", socket.reqInfo.domain)) {
    logger.debug(`handleWebSocketMessage - Attempt to access a non-active module: relay | IP: ${socket.reqInfo.ip}`);
    await socketSafeSend(socket, ["NOTICE", "blocked: relay module is not active"]);
    removeAllSubscriptions(socket, 1003);
    return;
  }

  try {

    // Check max message length
    const max_message_length = Number(getConfig(socket.reqInfo.domain, ["relay", "limitation", "max_message_length"])) || 256000;
    const chunkLen = (b: unknown) => Buffer.isBuffer(b) ? b.length : b instanceof ArrayBuffer ? b.byteLength : 0;
    const messageSize =
      Buffer.isBuffer(data)       ? data.length :
      Array.isArray(data)         ? data.reduce((n, b) => n + chunkLen(b), 0) :
      data instanceof ArrayBuffer ? data.byteLength :
      typeof data === "string"    ? Buffer.byteLength(data, "utf8") :
      null;

    if (messageSize === null) {
      await socketSafeSend(socket, ["NOTICE", "error: unsupported data"]);
      logger.debug(`handleWebSocketMessage - Unsupported data: ${typeof data}`);
      socket.close(1003, "error: unsupported data");
      return; 
    }

    if (messageSize > max_message_length) {
      await socketSafeSend(socket, ["NOTICE", "error: message too large"]);
      logger.debug(`handleWebSocketMessage - Message too large: ${messageSize}B (limit ${max_message_length}B)`);
      socket.close(1009, "message too large");
      return;
    }

    // Parse message
    const message = parseRelayMessage(data);
    if (!message) {
      await socketSafeSend(socket, ["NOTICE", "invalid: malformed note"]);
      logger.debug(`handleWebSocketMessage - Invalid message: malformed note`);
      socket.close(1003, "invalid: malformed note");
      return;
    }

    const [type, ...args] = message;

    // Auth required (NIP-42)
    if (type === "AUTH") {
      await handleAuthMessage(socket, ["AUTH", args[0] as AuthEvent]);
      return;
    }
    const authRequired = getConfig(socket.reqInfo.domain, ["relay","limitation","auth_required"]);
    if (authRequired === true && !authSessions.has(socket)) {
      if (!socket.challenge) {
        socket.challenge = crypto.randomBytes(32).toString("hex");
        await socketSafeSend(socket, ["AUTH", socket.challenge]);
      }
      return;
    }

    switch (type) {
      case "EVENT" : {
          const task = await enqueueRelayTask({fn: handleEvent, args: [socket, args[0] as Event]});
          if (!task.enqueued) {
            logger.debug(`handleWebSocketMessage - Relay queue limit reached: ${getRelayQueueLength()}`);
            await socketSafeSend(socket, ["NOTICE", "error: relay queue limit reached"]);
            socket.close(1009, "error: relay queue limit reached");
          }
        break;
      }

      case "REQ":
      case "COUNT": {
        const filters: Filter[] = args.slice(1) as Filter[];
        try {
          if (typeof args[0] === "string") {
              await handleReqOrCount(socket, args[0], filters, type);
          } else {
              logger.debug(`handleWebSocketMessage - Invalid subscription ID: ${args[0]}`);
              await socketSafeSend(socket, ["NOTICE", "error: invalid subscription ID"]);
              socket.close(1003, "error: invalid subscription ID");
          }
        } catch (error) {
          logger.error(`handleWebSocketMessage - Failed to handle REQ/COUNT: ${error}`);
          await socketSafeSend(socket, ["NOTICE", "error: internal server error"]);
          socket.close(1011, "error: internal server error");
        }
      
        break;
      }

      case "CLOSE": {
        const task = await enqueueRelayTask({fn: handleClose, args: [socket, typeof args[0] === 'string' ? args[0] : undefined]});
        if (!task.enqueued) {
          logger.debug(`handleWebSocketMessage - Relay queue limit reached: ${getRelayQueueLength()}`);
          await socketSafeSend(socket, ["NOTICE", "error: relay queue limit reached"]);
          socket.close(1009, "error: relay queue limit reached");
        }
        break;
      }

      default: {
        logger.debug(`handleWebSocketMessage - Unknown command: ${type}`);
        await socketSafeSend(socket, ["NOTICE", "error: unknown command"]);
        socket.close(1003, "error: unknown command");
        break;
      }
    }
  } catch (error) {
    logger.error(`handleWebSocketMessage - Internal server error: ${error}`);
    await socketSafeSend(socket, ["NOTICE", "error: internal server error"]);
    socket.close(1011, "error: internal server error");
  }
};

// Handle EVENT
const handleEvent = async (socket: ExtendedWebSocket, event: MetadataEvent) => {

  // Check if the event pubkey is banned
  if (await isEntityBanned(event.pubkey, "registered")) {
    logger.debug(`handleEvent - Blocked banned pubkey: ${event.pubkey}`);
    await socketSafeSend(socket, ["NOTICE", "blocked: banned pubkey"]);
    await socketSafeSend(socket, ["OK", event.id, false, "blocked: banned pubkey"]);
    removeAllSubscriptions(socket, 1008);
    return;
  }

  // Check if the event is banned
  if (await isEntityBanned(event.id, "events")) {
    logger.debug(`handleEvent - Blocked banned event: ${event.id}`);
    await socketSafeSend(socket, ["NOTICE", "blocked: banned event"]);
    await socketSafeSend(socket, ["OK", event.id, false, "blocked: banned event"]);
    removeAllSubscriptions(socket, 1008);
    return;
  }

  // Check if the event is valid
  const validEvent = await isEventValid(event, getConfig(socket.reqInfo.domain, ["relay", "limitation", "created_at_lower_limit"]),
  getConfig(socket.reqInfo.domain, ["relay", "limitation", "created_at_upper_limit"]));

  if (validEvent.status !== "success") {
    logger.debug(`handleEvent - Invalid event: ${event.id}, ${validEvent.message}`);
    await socketSafeSend(socket, ["NOTICE", `invalid: ${validEvent.message}`]);
    await socketSafeSend(socket, ["OK", event.id, false, `invalid: ${validEvent.message}`]);
    return;
  }

  // Check if the event has more tags than allowed
  if (event.tags.length > getConfig(socket.reqInfo.domain, ["relay", "limitation", "max_event_tags"])) {
    logger.debug(`handleEvent - Blocked event with too many tags: ${event.id}`);
    await socketSafeSend(socket, ["NOTICE", "blocked: too many tags"]);
    await socketSafeSend(socket, ["OK", event.id, false, "blocked: too many tags"]);
    return;
  }

  // Check if the event content is too large
  if (event.content.length > getConfig(socket.reqInfo.domain, ["relay", "limitation", "max_content_length"])) {
    logger.debug(`handleEvent - Blocked event with too large content: ${event.id}`);
    await socketSafeSend(socket, ["NOTICE", "blocked: event content too large"]);
    await socketSafeSend(socket, ["OK", event.id, false, "blocked: event content too large"]);
    return;
  }

  // set the tenant id for the event
  event.tenantid = socket.reqInfo.domainId;

  const isIsolated = getConfig(socket.reqInfo.domain, ["relay","isolated"]) === true;

  // NIP-40 Event expiration
  const expirationTag = event.tags.find(tag => tag[0] === "expiration");
  if (expirationTag && expirationTag.length >= 2) {
    const expirationTimestamp = parseInt(expirationTag[1], 10);
    if (isNaN(expirationTimestamp)) {
      logger.debug(`handleEvent - Blocked event with invalid expiration timestamp: ${event.id}`);
      await socketSafeSend(socket, ["NOTICE", "error: invalid expiration timestamp"]);
      await socketSafeSend(socket, ["OK", event.id, false, "invalid expiration value"]);
      return;
    }
    if ( Math.floor(Date.now() / 1000) > expirationTimestamp) {
      logger.debug(`handleEvent - Blocked expired event: ${event.id}, expiration: ${expirationTimestamp}`);
      await socketSafeSend(socket, ["NOTICE", "error: event expired"]);
      await socketSafeSend(socket, ["OK", event.id, false, "expired event"]);
      return;
    }
  }

  // Valid proof of work (NIP-13) if required
  if (getConfig(socket.reqInfo.domain, ["relay", "limitation", "min_pow_difficulty"]) > 0) {
    const nonceTag = event.tags.find(tag => tag[0] === 'nonce');
    if (!nonceTag || nonceTag.length < 3) {
      logger.debug(`handleEvent - Blocked event with missing or malformed nonce tag: ${event.id}`);
      await socketSafeSend(socket, ["NOTICE", "error: missing or malformed nonce tag"]);
      await socketSafeSend(socket, ["OK", event.id, false, "error: missing or malformed nonce tag"]);
      return;
    }

    const targetDifficulty  = parseInt(nonceTag[2], 10);
    if (isNaN(targetDifficulty)) {
      logger.debug(`handleEvent - Blocked event with invalid target difficulty in nonce tag: ${event.id}`);
      await socketSafeSend(socket, ["NOTICE", "error: invalid target difficulty in nonce tag"]);
      await socketSafeSend(socket, ["OK", event.id, false, "error: invalid target difficulty in nonce tag"]);
      return;
    }

    const resultPow = await validatePow(event.id, targetDifficulty);
    if (!resultPow) {
      logger.debug(`handleEvent - Blocked event with invalid proof of work: ${event.id}`);
      await socketSafeSend(socket, ["NOTICE", "error: invalid proof of work"]);
      await socketSafeSend(socket, ["OK", event.id, false, "error: invalid proof of work"]);
      return;
    }
  }

  // Check if the event has invalid tags that are not whitelisted (if whitelist is enabled)
  if (getConfig(socket.reqInfo.domain, ["relay", "tags"]).length > 0) {
    const tags = event.tags.map(tag => tag[0]);
    const invalidTags = tags.filter(tag => !getConfig(socket.reqInfo.domain, ["relay", "tags"]).includes(tag) && allowedTags.includes(tag) == false);
    if (invalidTags.length > 0) {
      logger.debug(`handleEvent - Blocked event with invalid tags: ${event.id}, ${invalidTags.join(", ")}`);
      await socketSafeSend(socket, ["NOTICE", `blocked: invalid tags: ${invalidTags.join(", ")}`]);
      await socketSafeSend(socket, ["OK", event.id, false, `blocked: invalid tags: ${invalidTags.join(", ")}`]);
      return;
    }
  }

  // NIP-70 Check if the event has a ["-"] tag and "auth_required" is enabled
  if (getConfig(socket.reqInfo.domain, ["relay", "limitation", "auth_required"]) == true && event.tags.some(tag => tag[0] === "-") && authSessions.get(socket) !== event.pubkey) {
      logger.debug(`handleEvent - Blocked private message without authentication: ${event.id}`);
      await socketSafeSend(socket, ["NOTICE", "error: unauthorized to post private messages"]);
      await socketSafeSend(socket, ["OK", event.id, false, "error: unauthorized to post private messages"]);
      return;
  }

  // Plugins engine execution
  if (await executePlugins({module: "relay", pubkey: event.pubkey, ip: socket.reqInfo.ip, event: event}, socket.reqInfo.domain) == false) {
    logger.debug(`handleEvent - Blocked event by plugins engine: ${event.id}`);
    await socketSafeSend(socket, ["NOTICE", "blocked: can't accept event"]);
    await socketSafeSend(socket, ["OK", event.id, false, "blocked: can't accept event"]);
    return;
  }

  // Check if the event is duplicated
  const existing = eventStore.eventIndex.get(event.id);
  if (existing && isIsolated && existing.tenantid === event.tenantid) {
    logger.debug(`handleEvent - Duplicate event in tenant ${event.tenantid}: ${event.id}`);
    await socketSafeSend(socket, ["OK", event.id, false, "duplicate: already have this event"]);
    return;
  }

  // Ephemeral events
  if (isEphemeral(event.kind)) {
    subscriptions.forEach((clientSubscriptions) => {
      clientSubscriptions.forEach((listener) => listener(event));
    });
    await socketSafeSend(socket, ["OK", event.id, true, "ephemeral: accepted but not stored"]);
    return;
  }

  // Replaceable events
  if (isReplaceable(event.kind)) {
    const replacementCandidates = Array.from(eventStore.eventIndex.entries())
    .filter(([_id, entry]) =>
      entry.kind === event.kind &&
      entry.pubkey === event.pubkey &&
      (isIsolated && entry.tenantid === event.tenantid)
    );

    if (replacementCandidates.length > 0) {
      const oldEventEntry = replacementCandidates[0];
      const oldEvent = await getEventById(oldEventEntry[0], eventStore);

      // If the event is not processed yet, we delete it and accept the new one
      if (!oldEvent && !oldEventEntry[1].processed) {
        eventStore.eventIndex.delete(oldEventEntry[0]);
        eventStore.pending.delete(oldEventEntry[0]);
      } 
      else if (oldEvent) {
        if (event.created_at > oldEvent.created_at || 
            (event.created_at === oldEvent.created_at && event.id < oldEvent.id)) {
          const deleteResult = await dbUpdate("events", {"active": "0"}, ["event_id"], [oldEvent.id]);
          if (!deleteResult) {
            logger.debug(`handleEvent - Failed to delete replaceable event: ${oldEvent.id}`);
            await socketSafeSend(socket, ["NOTICE", "error: failed to delete replaceable event"]);
            await socketSafeSend(socket, ["OK", event.id, false, "error: failed to delete replaceable event"]);
            return;
          }
          eventStore.pendingDelete.set(oldEvent.id, oldEvent);
          eventStore.eventIndex.delete(oldEvent.id);
        } else {
          logger.debug(`handleEvent - Rejected replaceable event: ${event.id}`);
          await socketSafeSend(socket, ["OK", event.id, false, "rejected: replaceable event is older or equal to existing event"]);
          return;
        }
      }
    }
  }

  // Event kind 1040 (NIP-03)
  if (event.kind === 1040) {
    const validEtag = event.tags.some(tag => tag[0] === "e" &&  typeof tag[1] === "string" &&  /^[a-f0-9]{64}$/i.test(tag[1]));
    const validKtag = event.tags.some(tag => tag[0] === "k" &&  typeof tag[1] === "string" &&  /^\d+$/.test(tag[1]) && Number(tag[1]) >= 0 && Number(tag[1]) <= 65535);

    if (!validEtag || !validKtag) {
      logger.debug(`handleEvent - Rejected kind:1040 event ${event.id} due to missing required tags.`);
      await socketSafeSend(socket, ["NOTICE", "invalid: missing required OpenTimestamps tags"]);
      await socketSafeSend(socket, ["OK", event.id, false, "invalid: missing required OpenTimestamps tags (e,k)"]);
      return;
    }

    if(!isBase64(event.content)) {
      logger.debug(`handleEvent - Rejected kind:1040 event ${event.id} due to invalid encoding.`);
      await socketSafeSend(socket, ["NOTICE", "invalid: OpenTimestamps proof must be Base64 encoded"]);
      await socketSafeSend(socket, ["OK", event.id, false, "invalid: OpenTimestamps proof must be Base64 encoded"]);
      return;
    }
  }

  let returnMessage = "";

  // Event kind 5 (NIP-09) Event deletion
  if (event.kind === 5) {

    const receivedEventsToDelete = event.tags.filter(tag => tag[0] === "e" || tag[0] === "a").map(tag => tag[1].trim());
    if (receivedEventsToDelete.length === 0) {
      logger.debug(`handleEvent - Rejected kind:5 event ${event.id} due to missing required tags.`);
      await socketSafeSend(socket, ["NOTICE", "invalid: missing required tags"]);
      await socketSafeSend(socket, ["OK", event.id, false, "invalid: missing required tags"]);
      return;
    }

    const eventsToDelete = (
      await Promise.all(
        receivedEventsToDelete.map(async id => {
          const candidate =
            eventStore.pending.get(id) ??
            (eventStore.eventIndex.has(id) ? await getEventById(id, eventStore) : null);
          if (!candidate) return null;
    
          if (isIsolated && candidate.tenantid !== event.tenantid) return null;
    
          return candidate;
        })
    )).filter(
      (e): e is MetadataEvent =>
        e !== null && e.kind !== 5 && e.pubkey === event.pubkey
    );
  
    if (eventsToDelete.length === 0) {
      logger.debug(`handleEvent - Rejected kind:5 event ${event.id} due to no events found for deletion.`);
      await socketSafeSend(socket, ["NOTICE", "invalid: no events found for deletion"]);
      await socketSafeSend(socket, ["OK", event.id, false, "invalid: no events found for deletion"]);
      return;
    }

    returnMessage = "deleted: events successfully deleted (kind 5)";

    // Add events to pendingDelete
    eventsToDelete.forEach(e => {
      eventStore.pendingDelete.set(e.id, e);
    });

  }

  // Event kind 62 (NIP-62) Request to Vanish
  if (event.kind === 62) {
    
    const relayTags = event.tags.filter(tag => tag[0] === "relay");
    if (relayTags.length === 0) {
      logger.debug(`handleEvent - Rejected kind:62 event ${event.id} due to missing required tags.`);
      await socketSafeSend(socket, ["NOTICE", "invalid: missing required tags"]);
      await socketSafeSend(socket, ["OK", event.id, false, "invalid: missing required tags"]);
      return;
    }

    const relayUrl = getConfig(socket.reqInfo.domain, ["server", "host"]) + "/relay";
    const eventUrl = relayTags.some(tag => tag[1].toUpperCase() === "ALL_RELAYS" || tag[1] === relayUrl);
    if (!eventUrl) {
      logger.debug(`handleEvent - Rejected kind:62 event ${event.id} due to invalid relay tag.`);
      await socketSafeSend(socket, ["NOTICE", "invalid: invalid relay tag"]);
      await socketSafeSend(socket, ["OK", event.id, false, "invalid: invalid relay tag"]);
      return;
    }

    let pendingEvents = Array.from(eventStore.pending.values());
    if (isIsolated) {
      pendingEvents = pendingEvents.filter(e => e.tenantid === event.tenantid);
    }

    const storedEvents = await getEventsByTimerange(
      0,                    
      event.created_at - 1, 
      eventStore,
      entry => {
        if (!isIsolated) {
          return entry.pubkey === event.pubkey;
        }
        return entry.pubkey === event.pubkey && entry.tenantid === event.tenantid;
      }
    );

    const eventsToDelete: MetadataEvent[] = [
      ...pendingEvents,
      ...storedEvents
    ].filter(e =>
      (e.pubkey === event.pubkey ||
       e.tags.some(tag => tag[0] === "p" && tag[1] === event.pubkey)) &&
      e.kind !== 5 &&
      e.kind !== 62
    );

    returnMessage = "deleted: events successfully deleted (kind 62)";

    // Add events to pendingDelete
    eventsToDelete.forEach(e => {
      eventStore.pendingDelete.set(e.id, e);
    });

  }

  // NIP-7D (Threads)
  if (event.kind === 11 || event.kind === 1111) {
    const hasTitleTag = event.tags.some(tag => tag[0] === "title" && typeof tag[1] === "string" && tag[1].trim().length > 0);
    const hasK11Tag = event.tags.some(tag => tag[0] === "K" && tag[1] === "11");
    const hasEtag = event.tags.some(tag => tag[0] === "E" && tag[1] !== "");
    if ((!hasTitleTag && event.kind === 11) || ((!hasK11Tag || !hasEtag) && event.kind === 1111)) {
      logger.debug(`handleEvent - Rejected kind:${event.kind} event ${event.id} due to missing required tags.`);
      await socketSafeSend(socket, ["NOTICE", "invalid: missing required tags"]);
      await socketSafeSend(socket, ["OK", event.id, false, "invalid: missing required tags"]);
      return;
    }
  }

  // NIP-B0 (Bookmarks)
  if (event.kind === 39701) {
    const d = event.tags.find(t => t[0] === "d")?.[1] ?? "";
    const hasD = typeof d === "string" && d.trim().length > 0;
    const hasScheme = /^https?:\/\//i.test(d);
    if (!hasD || hasScheme) {
      logger.debug(`Rejected kind:39701 ${event.id} (missing d or d has scheme)`);
      await socketSafeSend(socket, ["NOTICE", "invalid: d tag required without scheme"]);
      await socketSafeSend(socket, ["OK", event.id, false, "invalid: d tag required without scheme"]);
      return;
    }
  }

  // NIP-A0 (Voice Messages)
  if (event.kind === 1222 || event.kind === 1244) {
    const isHttpUrl = typeof event.content === "string" && /^(https?:)\/\/\S+$/i.test(event.content);
    if (!isHttpUrl) {
      await socketSafeSend(socket, ["NOTICE", "invalid: content must be a direct http(s) URL"]);
      await socketSafeSend(socket, ["OK", event.id, false, "invalid: content must be a direct http(s) URL"]);
      return;
    }

    if (event.kind === 1244) {
      const hasParentRef = event.tags.some(t =>
        (t[0] === "E" || t[0] === "e" || t[0] === "a") &&
        typeof t[1] === "string" && t[1].trim().length > 0
      );
      if (!hasParentRef) {
        await socketSafeSend(socket, ["NOTICE", "invalid: reply must reference a parent (E/e or a)"]);
        await socketSafeSend(socket, ["OK", event.id, false, "invalid: missing parent reference"]);
        return;
      }
    }
  }

  // Notify all clients about the new event
  subscriptions.forEach((clientSubs, ws) => {
    if (isIsolated && ws.reqInfo.domainId !== event.tenantid) return;
    clientSubs.forEach(listener => listener(event));
  });

  // Save the event to memory
  event = await fillEventMetadata(event);
  event = await compressEvent(event);
  const expiration = expirationTag ? Number(expirationTag[1]) : undefined;
  eventStore.eventIndex.set(event.id, {
    id: event.id,
    chunkIndex: -1, 
    position: -1, 
    processed: false,
    created_at: event.created_at,
    kind: event.kind,
    pubkey: event.pubkey,
    expiration: expiration,
    tenantid: socket.reqInfo.domainId,
  });
  eventStore.pending.set(event.id, event);
  eventStore.globalIds.add(event.id);
  if (event.pubkey) {
    eventStore.globalPubkeys.add(event.pubkey);
  }

  if (expiration !== undefined) {
    eventStore.globalExpirable.add(event.id);
  }

  // Send confirmation to the client
  await socketSafeSend(socket, ["OK", event.id, true, returnMessage]);

  return;
  
};

// Handle REQ or COUNT
const handleReqOrCount = async (socket: ExtendedWebSocket, subId: string, filters: Filter[], type: string) => {

  if (!filters || !Array.isArray(filters) || filters.length === 0) {
    logger.debug(`handleReqOrCount - No filters provided: ${subId}`);
    await socketSafeSend(socket, ["CLOSED", subId, "unsupported: no filters provided"]);
    return;
  }

  if (getConfig(socket.reqInfo.domain, ["relay", "limitation", "auth_required"]) == true && !authSessions.has(socket)) {
    const requestedKinds = filters.flatMap(f => f.kinds || []);

    if (requestedKinds.some(kind => [4, 14, 1059].includes(kind))) {
      logger.debug(`handleReqOrCount - Blocked REQ for private messages without authentication: ${subId} |`, socket.reqInfo.ip);
      await socketSafeSend(socket, ["NOTICE", "auth-required: must authenticate to request private messages"]);
      await socketSafeSend(socket, ["CLOSED", subId, "auth-required: must authenticate to request private messages"]);
      socket.close(1003, "auth-required: must authenticate to request private messages");
      return;
    }
  }

  const validFilters = filters.every(filter => validateFilter(filter));
  if (!validFilters) {
    logger.debug(`handleReqOrCount - Invalid filters: ${subId}`);
    await socketSafeSend(socket, ["CLOSED", subId, "unsupported: invalid filters"]);
    return;
  }

  if (filters.length > getConfig(socket.reqInfo.domain, ["relay", "limitation", "max_filters"])) {
    logger.debug(`handleReqOrCount - Too many filters: ${subId}`);
    await socketSafeSend(socket, ["CLOSED", subId, "unsupported: too many filters"]);
    return;
  }

  if (subId.length > getConfig(socket.reqInfo.domain, ["relay", "limitation", "max_subid_length"])) {
    logger.debug(`handleReqOrCount - Subscription id too long: ${subId}`);
    await socketSafeSend(socket, ["CLOSED", subId, "unsupported: subscription id too long"]);
    return;
  }

  // If sharedDBChunks is not initialized, send EOSE (or 0 for COUNT)
  if (!eventStore.sharedDBChunks) {
    logger.debug(`handleReqOrCount - SharedDB not initialized: ${subId}`);
    if (type === "COUNT") {
      await socketSafeSend(socket, ["COUNT", subId, { count: 0 }]);
    } else {
      await socketSafeSend(socket, ["EOSE", subId]);
    }
    return;
  }

  // Early discard filters that not match the event store (pubkey or id)
  if (type === "REQ" && filterEarlyDiscard(filters, eventStore)) {
    logger.debug(`handleReqOrCount - Filter early discard: ${subId}`);
    await socketSafeSend(socket, ["EOSE", subId]);
    return;
  }

  const maxLimit = Math.min(Number(getConfig(socket.reqInfo.domain, ["relay", "limitation", "max_limit"])) || 5000, 5000);

  const isIsolated = getConfig(socket.reqInfo.domain, ["relay","isolated"]) === true;
  if (isIsolated) {
    filters.push({tenantid: socket.reqInfo.domainId } as any);
  }

  try {
   const eventsList = await getEvents(filters, maxLimit, eventStore.sharedDBChunks);

    if (type === "COUNT") {
      await socketSafeSend(socket, ["COUNT", subId, { count: eventsList.length }]);
      return;
    }

    let sent = 0;
    let aborted = false;
    const batchSize = 100;
    for (let i = 0; i < eventsList.length && !aborted; i += batchSize) {
      const batch = eventsList.slice(i, i + batchSize);
      for (const event of batch) {
        if (socket.readyState !== WebSocket.OPEN) { aborted = true; break; }
        if (type === "REQ") {
          sent++;
          const sentOK = await socketSafeSend(socket, ["EVENT", subId, event]);
          if (!sentOK) { aborted = true; break; }
          if (sent >= maxLimit) break;
        }
      }
      if (sent >= maxLimit) break;
      await new Promise(resolve => setImmediate(resolve));
    }

    if (type === "REQ" && !aborted && socket.readyState === WebSocket.OPEN) {
      await socketSafeSend(socket, ["EOSE", subId]);
    }

    if (type === "REQ") {
      const listener = async (event: MetadataEvent): Promise<void> => {
      if (isIsolated && event.tenantid !== socket.reqInfo.domainId) return;
      if (filters.some((f) => matchFilter(f, event)) && socket.readyState === WebSocket.OPEN) {
        await socketSafeSend(socket, ["EVENT", subId, event]);
      }
      };
      addSubscription(subId, socket, listener);
    }

  } catch (error) {
    logger.error(`handleReqOrCount - Failed to process subscription: ${subId}, error: ${error}`);
    if (socket.readyState === WebSocket.OPEN) {
      await socketSafeSend(socket, ["NOTICE", "error: failed to process subscription"]);
      socket.close(1003, "error: failed to process subscription");
    }
  }
};

// Handle CLOSE
const handleClose = (socket: ExtendedWebSocket, subId?: string) => {
  removeSubscription(subId, socket);
};

// Handle AUTH
const handleAuthMessage = async (socket: ExtendedWebSocket, message: ["AUTH", AuthEvent]): Promise<void> => {

  if (!Array.isArray(message) || message.length !== 2) {
    logger.debug(`handleAuthMessage - Malformed AUTH message: ${message}`);
    await socketSafeSend(socket, ["NOTICE", "error: malformed AUTH message"]);
    return;
  }

  const [, authData] = message;

  if (typeof authData !== "object" || authData === null) {
    logger.debug(`handleAuthMessage - Invalid AUTH payload: ${authData}`);
    await socketSafeSend(socket, ["NOTICE", "error: AUTH payload must be an object"]);
    return;
  }

  if (authData.kind !== 22242) {
    logger.debug(`handleAuthMessage - Invalid AUTH event kind: ${authData.kind}`);
    await socketSafeSend(socket, ["NOTICE", "error: invalid AUTH event kind"]);
    return;
  }

  const relayTag = authData.tags.find(tag => tag[0] === "relay");
  const challengeTag = authData.tags.find(tag => tag[0] === "challenge");

  if (!relayTag || !challengeTag) {
    logger.debug(`handleAuthMessage - Missing relay or challenge tag: ${authData.tags}`);
    await socketSafeSend(socket, ["NOTICE", "error: missing relay or challenge tag"]);
    return;
  }

  const challenge = challengeTag[1];
  if (!socket.challenge || socket.challenge !== challenge) {
    logger.debug(`handleAuthMessage - Invalid challenge: ${challenge}`);
    await socketSafeSend(socket, ["NOTICE", "error: invalid challenge"]);
    return;
  }

  const validEvent = await isEventValid(authData, 60, 10);
  if (validEvent.status !== "success") {
    logger.debug(`handleAuthMessage - Invalid AUTH event: ${validEvent.message}`);
    await socketSafeSend(socket, ["NOTICE", `error: ${validEvent.message}`]);
    return;
  }

  authSessions.set(socket, authData.pubkey);
  delete socket.challenge;
  socket.reqInfo.pubkey = authData.pubkey;

  const registeredData = await dbMultiSelect(["id", "username"],"registered","hex = ?", [authData.pubkey], true);
  if (registeredData.length === 0) {
    logger.debug("AUTH failed: pubkey not registered:", authData.id);
    await socketSafeSend(socket, ["NOTICE", "error: pubkey not registered"]);
    return;
  }

  await socketSafeSend(socket, ["OK", authData.id, true, "AUTH successful"]);
};

const getRelayStatus = async (req: Request, res: Response, wss: WebSocketServer): Promise<Response> => {

  // Check if the request IP is allowed
  const reqInfo = await isIpAllowed(req);
  if (reqInfo.banned == true) {
      logger.warn(`ServerStatus - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
      return res.status(403).send({"status": "error", "message": reqInfo.comments});
  }

  // Check if current module is enabled
  if (!isModuleEnabled("relay", req.hostname)) {
      logger.warn("ServerStatus - Attempt to access a non-active module:","relay","|","IP:", reqInfo.ip);
      return res.status(403).send({"status": "error", "message": "Module is not enabled"});
  }

  // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req,"getRelayQueue", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}

  const result : RelayStatusMessage = {
    status: "success",
    message: "Relay status retrieved successfully",
    websocketConnections: wss?.clients.size || 0,
    usedMemory: eventStore.sharedDBChunks.reduce((sum, chunk) => sum + getChunkSize(chunk).totalMB, 0),
    queueLength: getRelayQueueLength() || 0,
    workerCount: relayWorkers,
    heavyTasksLength: getRelayHeavyWorkerLength() || 0,
    lightTasksLength: getRelayLightWorkerLength() || 0,
    heavyTasks: getPendingHeavyTasks() || [],
    lightTasks: getPendingLightTasks() || [],
    pendingEvents: eventStore.pending.size || 0,
    pendingDeleteEvents: eventStore.pendingDelete.size || 0

  }

  return res.status(200).send(result);
};

export { handleWebSocketMessage, getRelayStatus };