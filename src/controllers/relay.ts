import WebSocket, { WebSocketServer } from "ws";
import { Event, Filter, matchFilter } from "nostr-tools";
import { Request, Response } from "express";

import { subscriptions, addSubscription, removeAllSubscriptions, removeSubscription, socketSafeSend, checkWSConnectionRate } from "../lib/relay/core.js";
import { compressEvent, fillEventMetadata, getEventById, getEventsByTimerange, validateFilter, parseRelayMessage, getChunkSize, filterEarlyDiscard } from "../lib/relay/utils.js";
import { getDTag, deactivateSupersededDB, getArchivedEventsDB, getEventsByIdDB, getNewestReplaceableDB, getReplaceableIds, indexReplaceable, initEvents, isEventStoredDB, vanishPubkeyDB } from "../lib/relay/database.js";

import { isEventValid } from "../lib/nostr/core.js";
import { logger } from "../lib/logger.js";
import { getClientInfo, isIpAllowed } from "../lib/security/ips.js";
import { isEntityBanned } from "../lib/security/banned.js";
import { isAddressable, isEphemeral, isReplaceable } from "../lib/nostr/NIP01.js";
import { executePlugins } from "../lib/plugins/core.js";
import { checkPow } from "../lib/nostr/NIP13.js";
import { hasCommentRootScope } from "../lib/nostr/NIP22.js";
import { allowedTags, EventIndex, eventStore, ExtendedWebSocket, MetadataEvent, RelayStatusMessage } from "../interfaces/relay.js";
import { isBase64 } from "../lib/utils.js";
import { isRelayHidden } from "../lib/relay/bans.js";
import { handleNegClose, handleNegMsg, handleNegOpen } from "./nip77.js";
import { handleCount } from "./nip45.js";
import { MEMBERSHIP_LIST_KIND, getMembershipList, isRegisteredPubkey, isRelayMember, redeemClaim, setRelayMember } from "../lib/relay/members.js";
import { AuthEvent } from "../interfaces/nostr.js";
import { dbUpdate } from "../lib/database/core.js";
import { enqueueRelayTask, getEvents, getPendingHeavyTasks, getPendingLightTasks, getRelayHeavyWorkerLength, getRelayLightWorkerLength, getRelayQueueLength, relayWorkers } from "../lib/relay/workers.js";
import { parseAuthHeader } from "../lib/authorization.js";
import { getConfig, isModuleEnabled } from "../lib/config/core.js";
import { IncomingMessage } from "http";
import crypto from "crypto";

await initEvents();
const authSessions: WeakMap<WebSocket, string> = new WeakMap();

// NIP-04 / NIP-17: direct messages and gift wraps are only served to the parties of the
// message, once they have authenticated (NIP-42). Anyone can still publish them.
const PRIVATE_KINDS = new Set([4, 14, 1059]);
const canReadEvent = (socket: ExtendedWebSocket, event: Event): boolean => {
  if (isRelayHidden(event)) return false;
  if (!PRIVATE_KINDS.has(event.kind)) return true;
  const authed = authSessions.get(socket);
  if (!authed) return false;
  if (event.kind == 4 && event.pubkey == authed) return true;
  return event.tags.some(tag => tag[0] == "p" && tag[1] == authed);
};

// NIP-43: join (28934) and leave (28936) requests carry their own signature, so they get past
// auth_required; so do REQs that only ask for the membership list or roles, so a client can see
// whether it is a member before it authenticates.
const MEMBERSHIP_REQUEST_KINDS = new Set([28934, 28936]);
const MEMBERSHIP_INFO_KINDS = new Set([MEMBERSHIP_LIST_KIND, 33534]);
const MEMBERSHIP_REQUEST_WINDOW = 300;
const isMembershipMessage = (type: unknown, args: unknown[]): boolean => {
  if (type === "EVENT") return MEMBERSHIP_REQUEST_KINDS.has((args[0] as Event)?.kind);
  if (type === "REQ" || type === "COUNT") {
    const filters = args.slice(1) as Filter[];
    return filters.length > 0 && filters.every(f => Array.isArray(f?.kinds) && f.kinds.length > 0 && f.kinds.every(kind => MEMBERSHIP_INFO_KINDS.has(kind)));
  }
  return false;
};

const sendAuthChallenge = async (socket: ExtendedWebSocket): Promise<void> => {
  if (!socket.challenge) socket.challenge = crypto.randomBytes(32).toString("hex");
  await socketSafeSend(socket, ["AUTH", socket.challenge]);
};

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
    if (authRequired === true && !authSessions.has(socket) && !isMembershipMessage(type, args)) {
      if (!socket.challenge) await sendAuthChallenge(socket);
      const reason = "auth-required: this relay requires authentication";
      if (type === "EVENT" && typeof (args[0] as Event)?.id === "string") await socketSafeSend(socket, ["OK", (args[0] as Event).id, false, reason]);
      if ((type === "REQ" || type === "COUNT") && typeof args[0] === "string") await socketSafeSend(socket, ["CLOSED", args[0], reason]);
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

      // NIP-77 negentropy syncing
      case "NEG-OPEN": {
        try {
          await handleNegOpen(socket, args);
        } catch (error) {
          logger.error(`handleWebSocketMessage - Failed to handle NEG-OPEN: ${error}`);
          if (typeof args[0] === "string") await socketSafeSend(socket, ["NEG-ERR", args[0], "error: internal server error"]);
        }
        break;
      }
      case "NEG-MSG": {
        try {
          await handleNegMsg(socket, args);
        } catch (error) {
          logger.error(`handleWebSocketMessage - Failed to handle NEG-MSG: ${error}`);
          if (typeof args[0] === "string") await socketSafeSend(socket, ["NEG-ERR", args[0], "error: internal server error"]);
        }
        break;
      }
      case "NEG-CLOSE": {
        handleNegClose(socket, args);
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

  // NIP-43 join and leave requests: answered here, never stored or broadcast (the claim is secret).
  if (MEMBERSHIP_REQUEST_KINDS.has(event.kind)) {
    await handleMembershipRequest(socket, event);
    return;
  }

  // Restricted writes (#59): AUTH proves who is connected, not who signed the event, so a
  // member could otherwise upload anyone's events. Here the author has to be a member too.
  if (getConfig(socket.reqInfo.domain, ["relay", "limitation", "restricted_writes"]) === true && !await isRelayMember(event.pubkey)) {
    logger.debug(`handleEvent - Blocked event from a non-member author: ${event.id}`);
    await socketSafeSend(socket, ["OK", event.id, false, "restricted: the author of this event is not a member of this relay"]);
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

  // Proof of work (NIP-13): measured on the id against the relay minimum, not against the
  // target the event declares for itself.
  const powError = checkPow(event.id, event.tags, Number(getConfig(socket.reqInfo.domain, ["relay", "limitation", "min_pow_difficulty"])) || 0);
  if (powError !== "") {
    logger.debug(`handleEvent - Blocked event without enough proof of work: ${event.id}, ${powError}`);
    await socketSafeSend(socket, ["OK", event.id, false, powError]);
    return;
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

  // NIP-70: protected events are only accepted from their authenticated author
  if (event.tags.some(tag => tag[0] === "-") && authSessions.get(socket) !== event.pubkey) {
      logger.debug(`handleEvent - Blocked protected event without author authentication: ${event.id}`);
      await sendAuthChallenge(socket);
      await socketSafeSend(socket, ["OK", event.id, false, "auth-required: this event may only be published by its author"]);
      return;
  }

  // Plugins engine execution
  if (await executePlugins({module: "relay", pubkey: event.pubkey, ip: socket.reqInfo.ip, event: event}, socket.reqInfo.domain) == false) {
    logger.debug(`handleEvent - Blocked event by plugins engine: ${event.id}`);
    await socketSafeSend(socket, ["NOTICE", "blocked: can't accept event"]);
    await socketSafeSend(socket, ["OK", event.id, false, "blocked: can't accept event"]);
    return;
  }

  // Check if the event is duplicated. In isolated mode the check is scoped to
  // the current tenant; otherwise any matching id is a duplicate.
  const existing = eventStore.eventIndex.get(event.id);
  if (existing && (!isIsolated || existing.tenantid === event.tenantid)) {
    logger.debug(`handleEvent - Duplicate event in tenant ${event.tenantid}: ${event.id}`);
    await socketSafeSend(socket, ["OK", event.id, false, "duplicate: already have this event"]);
    return;
  }

  // Events older than the memory horizon live only in the DB.
  const isArchived = eventStore.memoryHorizon > 0 && event.created_at < eventStore.memoryHorizon && !isEphemeral(event.kind);
  if (!existing && isArchived && (eventStore.pendingArchive.has(event.id) || await isEventStoredDB(event.id))) {
    logger.debug(`handleEvent - Duplicate archived event: ${event.id}`);
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

  // Replaceable and addressable events. Addressables (30000-39999) are keyed by their d tag
  // too; they used to be stored side by side, so every version stayed active.
  const dTag = isAddressable(event.kind) ? getDTag(event.tags) : "";
  if (isReplaceable(event.kind) || isAddressable(event.kind)) {
    // Newest stored version in memory. Outside isolated mode any tenant's version counts;
    // the old condition only matched in isolated mode, so nothing was ever replaced.
    let oldEventEntry: [string, EventIndex] | null = null;
    for (const id of getReplaceableIds(event.pubkey, event.kind, dTag)) {
      const entry = eventStore.eventIndex.get(id);
      if (!entry) continue;
      if (isIsolated && entry.tenantid !== event.tenantid) continue;
      if (!oldEventEntry || entry.created_at > oldEventEntry[1].created_at) oldEventEntry = [id, entry];
    }

    // Not in memory: an older-than-horizon version may still be the current one in the DB.
    // Addressables skip this: matching their d tag in the DB costs a scan per event, and
    // archived duplicates are collapsed when served anyway.
    if (!oldEventEntry && eventStore.memoryHorizon > 0 && isReplaceable(event.kind)) {
      const newestStored = await getNewestReplaceableDB(event.pubkey, event.kind, isIsolated ? event.tenantid : undefined);
      if (newestStored !== null && newestStored >= event.created_at) {
        logger.debug(`handleEvent - Rejected replaceable event older than the stored one: ${event.id}`);
        await socketSafeSend(socket, ["OK", event.id, false, "rejected: replaceable event is older or equal to existing event"]);
        return;
      }
    }

    if (oldEventEntry) {
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

    // Events past the memory horizon are looked up in the DB.
    const notInMemory = receivedEventsToDelete.filter(id => !eventStore.pending.has(id) && !eventStore.pendingArchive.has(id) && !eventStore.eventIndex.has(id));
    const archivedToDelete = eventStore.memoryHorizon > 0 && notInMemory.length > 0
      ? await getEventsByIdDB(notInMemory, isIsolated ? event.tenantid : undefined)
      : [];

    const eventsToDelete = (
      await Promise.all(
        receivedEventsToDelete.map(async id => {
          const candidate =
            eventStore.pending.get(id) ??
            eventStore.pendingArchive.get(id) ??
            (eventStore.eventIndex.has(id) ? await getEventById(id, eventStore) : null) ??
            archivedToDelete.find(e => e.id === id) ??
            null;
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

    // Older events are not in memory; remove them straight from the DB. Runs in the
    // background and in batches: a big account would otherwise hold an event queue slot.
    if (eventStore.memoryHorizon > 0) {
      for (const [id, e] of eventStore.pendingArchive) {
        if (e.pubkey === event.pubkey && e.created_at < event.created_at && (!isIsolated || e.tenantid === event.tenantid)) eventStore.pendingArchive.delete(id);
      }
      vanishPubkeyDB(event.pubkey, event.created_at, isIsolated ? event.tenantid : undefined).catch(() => {});
    }

    returnMessage = "deleted: events successfully deleted (kind 62)";

    // Add events to pendingDelete
    eventsToDelete.forEach(e => {
      eventStore.pendingDelete.set(e.id, e);
    });

  }

  // NIP-22 comments need a root scope (K plus E, A or I); the root can be an article, a URL
  // or a file, not only a NIP-7D thread. Kind 11 has no required tags: its title is a SHOULD.
  if (event.kind === 1111 && !hasCommentRootScope(event.tags)) {
    logger.debug(`handleEvent - Rejected kind:1111 event ${event.id} due to missing root scope tags.`);
    await socketSafeSend(socket, ["NOTICE", "invalid: missing root scope tags (K and E, A or I)"]);
    await socketSafeSend(socket, ["OK", event.id, false, "invalid: missing root scope tags (K and E, A or I)"]);
    return;
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

  // Replaced versions past the memory horizon are only in the DB.
  if (isReplaceable(event.kind) && eventStore.memoryHorizon > 0) {
    await deactivateSupersededDB(event, isIsolated ? event.tenantid : undefined);
  }

  event = await fillEventMetadata(event);

  // Old events stay out of memory; persistArchivedEvents writes them to the DB in batches.
  if (isArchived) {
    if (eventStore.pendingArchive.size >= MAX_PENDING_ARCHIVE) {
      logger.debug(`handleEvent - Too many old events waiting to be stored: ${event.id}`);
      await socketSafeSend(socket, ["OK", event.id, false, "rate-limited: too many old events, try again later"]);
      return;
    }
    eventStore.pendingArchive.set(event.id, event);
    await socketSafeSend(socket, ["OK", event.id, true, returnMessage]);
    return;
  }

  // Save the event to memory
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
  indexReplaceable(event.id, event.pubkey, event.kind, dTag);
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

const handleMembershipRequest = async (socket: ExtendedWebSocket, event: Event): Promise<void> => {
  const reply = (accepted: boolean, message: string) => socketSafeSend(socket, ["OK", event.id, accepted, message]);

  if (Math.abs(Math.floor(Date.now() / 1000) - event.created_at) > MEMBERSHIP_REQUEST_WINDOW) {
    await reply(false, "invalid: created_at must be within a few minutes of now");
    return;
  }
  if (getConfig(socket.reqInfo.domain, ["relay", "limitation", "auth_required"]) !== true) {
    await reply(false, "unsupported: this relay is open to everyone, there is no membership");
    return;
  }

  try {
    const member = await isRelayMember(event.pubkey);

    if (event.kind === 28936) {
      if (!member) {
        await reply(true, "duplicate: you are not a member of this relay.");
        return;
      }
      if (!await setRelayMember(event.pubkey, false, "nip43 leave")) {
        await reply(false, "error: could not update the membership");
        return;
      }
      if (authSessions.get(socket) === event.pubkey) authSessions.delete(socket);
      logger.info(`handleMembershipRequest - ${event.pubkey} left the relay | IP:`, socket.reqInfo.ip);
      await reply(true, "info: you are no longer a member of this relay.");
      return;
    }

    if (member) {
      await reply(true, "duplicate: you are already a member of this relay.");
      return;
    }

    // Registered users are members by default; one who left comes back without a code.
    const joined = await isRegisteredPubkey(event.pubkey)
      ? await setRelayMember(event.pubkey, true, "nip43 rejoin")
      : await redeemClaim(String(event.tags.find(tag => tag[0] === "claim")?.[1] ?? "").trim(), event.pubkey);
    if (!joined) {
      logger.debug(`handleMembershipRequest - Invalid claim from ${event.pubkey} | IP:`, socket.reqInfo.ip);
      await reply(false, "restricted: that is an invalid invite code.");
      return;
    }
    logger.info(`handleMembershipRequest - ${event.pubkey} joined the relay | IP:`, socket.reqInfo.ip);
    await reply(true, "info: welcome to the relay!");
  } catch (error) {
    logger.error(`handleMembershipRequest - Error handling kind ${event.kind} from ${event.pubkey}: ${error}`);
    await reply(false, "error: could not process the request");
  }
};

// Old events accepted but not yet written to the DB (flushed every minute).
const MAX_PENDING_ARCHIVE = 20000;

// Time a REQ may spend waiting for and reading archived events.
const ARCHIVE_REQ_BUDGET_MS = 4000;

// Same default as workers/getEvents.ts when a filter has no since.
const DEFAULT_SINCE_SECONDS = 86400 * 90;


const isExpiredEvent = (event: Event, now: number): boolean => {
  const tag = event.tags.find(t => t[0] === "expiration");
  if (!tag || tag.length < 2) return false;
  const expiration = Number(tag[1]);
  return Number.isFinite(expiration) && expiration < now;
};

// Keeps only the newest version of each replaceable / addressable event.
const collapseReplaceable = (events: Event[]): Event[] => {
  const keyOf = (e: Event): string | null => {
    if (isReplaceable(e.kind)) return `${e.pubkey}:${e.kind}`;
    if (isAddressable(e.kind)) return `${e.pubkey}:${e.kind}:${e.tags.find(t => t[0] === "d")?.[1] ?? ""}`;
    return null;
  };
  const newest = new Map<string, Event>();
  for (const e of events) {
    const key = keyOf(e);
    if (!key) continue;
    const current = newest.get(key);
    if (!current || e.created_at > current.created_at || (e.created_at === current.created_at && e.id < current.id)) {
      newest.set(key, e);
    }
  }
  return events.filter(e => {
    const key = keyOf(e);
    return !key || newest.get(key) === e;
  });
};

/**
 * Completes the in-memory results with events older than the memory horizon, read from the DB.
 * The worker scans memory from max(since, now - 90 days); everything older than that and
 * the horizon comes from the DB, as long as the filter is selective and still wants events.
 */
const addArchivedEvents = async (filters: Filter[], memoryEvents: Event[], maxLimit: number, tenantid: number | undefined, client: string): Promise<Event[]> => {

  const horizon = eventStore.memoryHorizon;
  if (!horizon) return memoryEvents;

  const now = Math.floor(Date.now() / 1000);
  const seen = new Set(memoryEvents.map(e => e.id));
  const archived: Event[] = [];
  // One budget for the whole REQ: up to max_filters filters would otherwise add up.
  const deadline = Date.now() + ARCHIVE_REQ_BUDGET_MS;

  for (const filter of filters) {
    const scannedFrom = filter.since !== undefined ? filter.since : now - DEFAULT_SINCE_SECONDS;
    const createdBefore = Math.max(scannedFrom, horizon);
    if (filter.since !== undefined && filter.since >= createdBefore) continue;

    const filterLimit = Math.min(filter.limit !== undefined ? filter.limit : maxLimit, maxLimit);
    let wanted = filterLimit - memoryEvents.filter(e => matchFilter(filter, e)).length;
    if (filter.ids && filter.ids.length > 0) {
      wanted = Math.min(wanted, filter.ids.filter(id => !seen.has(id)).length);
    }
    if (wanted <= 0) continue;

    const waitMs = deadline - Date.now();
    if (waitMs <= 0) {
      logger.debug(`addArchivedEvents - REQ time budget spent, skipping the remaining filters | ${client}`);
      break;
    }
    const rows = await getArchivedEventsDB(filter, createdBefore, wanted, tenantid, client, waitMs);
    if (rows === null) continue;
    for (const row of rows) {
      if (seen.has(row.id) || isExpiredEvent(row, now)) continue;
      seen.add(row.id);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { metadata, tenantid: _tenantid, ...event } = row;
      archived.push(event);
    }
  }

  if (archived.length === 0) return memoryEvents;
  return collapseReplaceable([...memoryEvents, ...archived]).slice(0, maxLimit);
};

// Accepted events wait in `pending` until the next flush (every minute, or until the store has
// loaded after a restart), and the workers don't scan it. Selective filters look there too, so
// a client can read what was just published.
const PENDING_SCAN_MAX = 20000;
const addPendingEvents = (filters: Filter[], events: Event[], maxLimit: number, tenantid: number | undefined): Event[] => {
  const pending = eventStore.pending;
  if (!pending || pending.size === 0) return events;

  const now = Math.floor(Date.now() / 1000);
  const seen = new Set(events.map(e => e.id));
  const extra: Event[] = [];
  const take = (e: MetadataEvent | undefined, filter: Filter) => {
    if (!e || seen.has(e.id) || !matchFilter(filter, e) || isExpiredEvent(e, now)) return;
    if (tenantid !== undefined && e.tenantid !== tenantid) return;
    seen.add(e.id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { metadata, tenantid: _tenantid, ...event } = e;
    extra.push(event);
  };

  for (const filter of filters) {
    if (filter.ids && filter.ids.length > 0) {
      for (const id of filter.ids) take(pending.get(id), filter);
      continue;
    }
    const selective = (filter.authors && filter.authors.length > 0) || Object.keys(filter).some(k => k.startsWith("#"));
    if (!selective || pending.size > PENDING_SCAN_MAX) continue;
    for (const e of pending.values()) take(e, filter);
  }

  if (extra.length === 0) return events;
  return collapseReplaceable([...extra, ...events].sort((a, b) => b.created_at - a.created_at)).slice(0, maxLimit);
};

// Handle REQ or COUNT
const handleReqOrCount = async (socket: ExtendedWebSocket, subId: string, filters: Filter[], type: string) => {

  if (!filters || !Array.isArray(filters) || filters.length === 0) {
    logger.debug(`handleReqOrCount - No filters provided: ${subId}`);
    await socketSafeSend(socket, ["CLOSED", subId, "unsupported: no filters provided"]);
    return;
  }

  // Private kinds need AUTH. Ask for it instead of dropping the connection (NIP-42).
  if (!authSessions.has(socket)) {
    const requestedKinds = filters.flatMap(f => Array.isArray(f?.kinds) ? f.kinds : []);
    if (requestedKinds.some(kind => PRIVATE_KINDS.has(kind))) {
      logger.debug(`handleReqOrCount - Private kinds requested without authentication: ${subId} |`, socket.reqInfo.ip);
      await sendAuthChallenge(socket);
      await socketSafeSend(socket, ["CLOSED", subId, "auth-required: direct messages are only served to their recipients"]);
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

  // Early discard filters that not match the event store (pubkey or id). With a memory
  // horizon the ids/authors may still be in the DB, so only the memory lookup is skipped.
  const memoryDiscard = type === "REQ" && filterEarlyDiscard(filters, eventStore);
  if (memoryDiscard && !eventStore.memoryHorizon) {
    logger.debug(`handleReqOrCount - Filter early discard: ${subId}`);
    await socketSafeSend(socket, ["EOSE", subId]);
    return;
  }

  const maxLimit = Math.min(Number(getConfig(socket.reqInfo.domain, ["relay", "limitation", "max_limit"])) || 5000, 5000);

  const isIsolated = getConfig(socket.reqInfo.domain, ["relay","isolated"]) === true;
  const clientFilters = [...filters];
  if (isIsolated) {
    filters.push({tenantid: socket.reqInfo.domainId } as any);
  }

  // NIP-45: exact counts (and HLL) for selective filters; the rest use the in-memory count.
  if (type === "COUNT" && await handleCount(socket, subId, clientFilters)) return;

  try {
   const memoryEvents = memoryDiscard ? [] : await getEvents(filters, maxLimit, eventStore.sharedDBChunks);
   const tenantFilter = isIsolated ? socket.reqInfo.domainId : undefined;
   const withArchive = await addArchivedEvents(clientFilters, memoryEvents, maxLimit, tenantFilter, socket.reqInfo.ip);
   const eventsList = addPendingEvents(clientFilters, withArchive, maxLimit, tenantFilter).filter(event => canReadEvent(socket, event));

   // NIP-43 membership list: generated and signed on request, only on relays that need membership.
   if (clientFilters.some(f => Array.isArray(f.kinds) && f.kinds.includes(MEMBERSHIP_LIST_KIND)) &&
       getConfig(socket.reqInfo.domain, ["relay", "limitation", "auth_required"]) === true) {
     const membershipList = await getMembershipList(socket.reqInfo.domain);
     if (membershipList && clientFilters.some(f => matchFilter(f, membershipList))) eventsList.unshift(membershipList);
   }

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
      if (!canReadEvent(socket, event)) return;
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

  const authFail = (reason: string) => socketSafeSend(socket, typeof authData.id === "string" ? ["OK", authData.id, false, reason] : ["NOTICE", reason]);

  if (authData.kind !== 22242) {
    logger.debug(`handleAuthMessage - Invalid AUTH event kind: ${authData.kind}`);
    await authFail("invalid: AUTH event must be kind 22242");
    return;
  }

  const relayTag = authData.tags.find(tag => tag[0] === "relay");
  const challengeTag = authData.tags.find(tag => tag[0] === "challenge");

  if (!relayTag || !challengeTag) {
    logger.debug(`handleAuthMessage - Missing relay or challenge tag: ${authData.tags}`);
    await authFail("invalid: missing relay or challenge tag");
    return;
  }

  const challenge = challengeTag[1];
  if (!socket.challenge || socket.challenge !== challenge) {
    logger.debug(`handleAuthMessage - Invalid challenge: ${challenge}`);
    await authFail("invalid: unknown challenge");
    return;
  }

  const validEvent = await isEventValid(authData, 60, 10);
  if (validEvent.status !== "success") {
    logger.debug(`handleAuthMessage - Invalid AUTH event: ${validEvent.message}`);
    await authFail(`invalid: ${validEvent.message}`);
    return;
  }

  // A relay that requires auth is for members only (NIP-43: registered users, allowed pubkeys
  // and those who joined with an invite code). Otherwise AUTH just proves the pubkey, which is
  // enough to read its own direct messages.
  if (getConfig(socket.reqInfo.domain, ["relay", "limitation", "auth_required"]) == true) {
    if (!await isRelayMember(authData.pubkey)) {
      logger.debug("AUTH failed: pubkey is not a member:", authData.id);
      await authFail("restricted: you are not a member of this relay, join with an invite code (NIP-43)");
      return;
    }
  }

  authSessions.set(socket, authData.pubkey);
  delete socket.challenge;
  socket.reqInfo.pubkey = authData.pubkey;

  await socketSafeSend(socket, ["OK", authData.id, true, ""]);
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