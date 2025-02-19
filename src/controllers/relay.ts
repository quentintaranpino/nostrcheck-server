import WebSocket from "ws";
import { Event, Filter, matchFilter } from "nostr-tools";
import { Request, Response } from "express";

import { subscriptions, addSubscription, removeAllSubscriptions, removeSubscription } from "../lib/relay/core.js";
import { compressEvent, parseRelayMessage } from "../lib/relay/utils.js";
import { binarySearchCreatedAt, getEvents, initEvents } from "../lib/relay/database.js";

import app from "../app.js";
import { isEventValid } from "../lib/nostr/core.js";
import { isModuleEnabled } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { isIpAllowed } from "../lib/security/ips.js";
import { isEntityBanned } from "../lib/security/banned.js";
import { isEphemeral, isReplaceable } from "../lib/nostr/NIP01.js";
import { executePlugins } from "../lib/plugins/core.js";
import { ipInfo } from "../interfaces/security.js";
import { validatePow } from "../lib/nostr/NIP13.js";
import { allowedTags, ExtendedWebSocket, RelayStatusMessage } from "../interfaces/relay.js";
import { isBase64 } from "../lib/utils.js";
import { AuthEvent } from "../interfaces/nostr.js";
import { dbMultiSelect, dbUpdate } from "../lib/database.js";
import { enqueueRelayTask, getRelayQueueLength, relayWorkers } from "../lib/relay/worker.js";
import { parseAuthHeader } from "../lib/authorization.js";

await initEvents(app);
const events = app.get("relayEvents");
const authSessions: Map<WebSocket, string> = new Map(); 

const handleWebSocketMessage = async (socket: ExtendedWebSocket, data: WebSocket.RawData, req: Request) => {

  // Check if the request IP is allowed
  const reqInfo = await isIpAllowed(req, app.get("config.security")["maxMessageMinute"]);
  if (reqInfo.banned == true) {
    logger.debug(`handleWebSocketMessage - Attempt to access relay with unauthorized IP: ${reqInfo.ip} | Reason: ${reqInfo.comments}`);
    socket.send(JSON.stringify(["NOTICE", `${reqInfo.comments}`]));
    removeAllSubscriptions(socket, 1008);
    return;
  }

  // Check if current module is enabled
  if (!isModuleEnabled("relay", app)) {
    logger.debug(`handleWebSocketMessage - Attempt to access a non-active module: relay | IP: ${reqInfo.ip}`);
    socket.send(JSON.stringify(["NOTICE", "blocked: relay module is not active"]));
    removeAllSubscriptions(socket, 1003);
    return;
  }

  try {

    const max_message_length = app.get("config.relay")["limitation"]["max_message_length"];
    if (Buffer.byteLength(data.toString()) > max_message_length) {
      socket.send(JSON.stringify(["NOTICE", "error: message too large"]));
      logger.debug(`handleWebSocketMessage - Message too large: ${Buffer.byteLength(data.toString())} bytes`);
      socket.close(1009, "message too large");

      return;
    }

    const message = parseRelayMessage(data);
    if (!message) {
      socket.send(JSON.stringify(["NOTICE", "invalid: malformed note"]));
      logger.debug(`handleWebSocketMessage - Invalid message: malformed note: ${data.toString()}`);
      socket.close(1003, "invalid: malformed note");
      return;
    }

    const [type, ...args] = message;

    switch (type) {
      case "EVENT" : {
        if (typeof args[0] !== 'string') {
          // handleEvent(socket, args[0] as Event, reqInfo);
          const task = enqueueRelayTask({fn: handleEvent, args: [socket, args[0] as Event, reqInfo]});
          if (!task) {
            logger.debug(`handleWebSocketMessage - Relay queue limit reached: ${getRelayQueueLength()}`);
            socket.send(JSON.stringify(["NOTICE", "error: relay queue limit reached"]));
            socket.close(1009, "error: relay queue limit reached");
          }
        } else {
          logger.debug(`handleWebSocketMessage - Invalid event data: ${args[0]}`);
          socket.send(JSON.stringify(["NOTICE", "invalid: event data is not an object"]));
          socket.close(1003, "invalid: event data is not an object");
        }
        break;
      }

      case "REQ":
      case "COUNT": {
        const filters: Filter[] = args.slice(1) as Filter[];
        if (typeof args[0] === 'string') {
          // await handleReqOrCount(socket, args[0], filters, type, reqInfo);
          const task = enqueueRelayTask({fn: handleReqOrCount, args: [socket, args[0], filters, type, reqInfo]});
          if (!task) {
            logger.debug(`handleWebSocketMessage - Relay queue limit reached: ${getRelayQueueLength()}`);
            socket.send(JSON.stringify(["NOTICE", "error: relay queue limit reached"]));
            socket.close(1009, "error: relay queue limit reached");
          }
        } else {
          logger.debug(`handleWebSocketMessage - Invalid subscription id: ${args[0]}`);
          socket.send(JSON.stringify(["NOTICE", "invalid: subscription id is not a string"]));
          socket.close(1003, "invalid: subscription id is not a string");
        }
        break;
      }

      case "CLOSE": {
        const task = enqueueRelayTask({fn: handleClose, args: [socket, typeof args[0] === 'string' ? args[0] : undefined]});
        if (!task) {
          logger.debug(`handleWebSocketMessage - Relay queue limit reached: ${getRelayQueueLength()}`);
          socket.send(JSON.stringify(["NOTICE", "error: relay queue limit reached"]));
          socket.close(1009, "error: relay queue limit reached");
        }
        // handleClose(socket, typeof args[0] === 'string' ? args[0] : undefined);
        break;
      }

      case "AUTH" : {
        if (typeof args[0] !== 'string') {
          const task = enqueueRelayTask({fn: handleAuthMessage, args: [socket, ["AUTH", args[0] as AuthEvent]]});
          if (!task) {
            logger.debug(`handleWebSocketMessage - Relay queue limit reached: ${getRelayQueueLength()}`);
            socket.send(JSON.stringify(["NOTICE", "error: relay queue limit reached"]));
            socket.close(1009, "error: relay queue limit reached");
          }
          // await handleAuthMessage(socket, ["AUTH", args[0] as AuthEvent]);
        } else {
          logger.debug(`handleWebSocketMessage - Invalid auth data: ${args[0]}`);
          socket.send(JSON.stringify(["NOTICE", "invalid: auth data is not an object"]));
          socket.close(1003, "invalid: auth data is not an object");
        }
        break;
      }   
      default:
        logger.debug(`handleWebSocketMessage - Unknown command: ${type}`);
        socket.send(JSON.stringify(["NOTICE", "error: unknown command"]));
        socket.close(1003, "error: unknown command");
    }
  } catch (error) {
    logger.error(`handleWebSocketMessage - Internal server error: ${error}`);
    socket.send(JSON.stringify(["NOTICE", "error: internal server error"]));
    socket.close(1011, "error: internal server error"); 
  }
};
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle EVENT
const handleEvent = async (socket: WebSocket, event: Event, reqInfo : ipInfo) => {

  await delay(300);

  // Check if the event pubkey is banned
  if (await isEntityBanned(event.pubkey, "registered")) {
    logger.debug(`handleEvent - Blocked banned pubkey: ${event.pubkey}`);
    socket.send(JSON.stringify(["NOTICE", "blocked: banned pubkey"]));
    socket.send(JSON.stringify(["OK", event.id, false, "blocked: banned pubkey"]));
    removeAllSubscriptions(socket, 1008);
    return;
  }

  // Check if the event is banned
  if (await isEntityBanned(event.id, "events")) {
    logger.debug(`handleEvent - Blocked banned event: ${event.id}`);
    socket.send(JSON.stringify(["NOTICE", "blocked: banned event"]));
    socket.send(JSON.stringify(["OK", event.id, false, "blocked: banned event"]));
    removeAllSubscriptions(socket, 1008);
    return;
  }

  // Check if the event is valid
  const validEvent = await isEventValid(event, app.get("config.relay")["limitation"]["created_at_lower_limit"], app.get("config.relay")["limitation"]["created_at_upper_limit"]);
  if (validEvent.status !== "success") {
    logger.debug(`handleEvent - Invalid event: ${event.id}, ${validEvent.message}`);
    socket.send(JSON.stringify(["NOTICE", `invalid: ${validEvent.message}`]));
    socket.send(JSON.stringify(["OK", event.id, false, `invalid: ${validEvent.message}`]));
    return;
  }

  // Check if the event has a valid AUTH session
  if (app.get("config.relay")["limitation"]["auth_required"] == true && !authSessions.has(socket)) {
    logger.debug(`handleEvent - Blocked event without authentication: ${event.id}`);
    socket.send(JSON.stringify(["NOTICE", "auth-required: you must authenticate first"]));
    socket.send(JSON.stringify(["OK", event.id, false, "auth-required: you must authenticate first"]));
    return;
}

  // Check if the event has more tags than allowed
  if (event.tags.length > app.get("config.relay")["limitation"]["max_event_tags"]) {
    logger.debug(`handleEvent - Blocked event with too many tags: ${event.id}`);
    socket.send(JSON.stringify(["NOTICE", "blocked: too many tags"]));
    socket.send(JSON.stringify(["OK", event.id, false, "blocked: too many tags"]));
    return;
  }

  // Check if the event content is too large
  if (event.content.length > app.get("config.relay")["limitation"]["max_content_length"]) {
    logger.debug(`handleEvent - Blocked event with too large content: ${event.id}`);
    socket.send(JSON.stringify(["NOTICE", "blocked: event content too large"]));
    socket.send(JSON.stringify(["OK", event.id, false, "blocked: event content too large"]));
    return;
  }

  // NIP-40 Event expiration
  const expirationTag = event.tags.find(tag => tag[0] === "expiration");
  if (expirationTag && expirationTag.length >= 2) {
    const expirationTimestamp = parseInt(expirationTag[1], 10);
    if (isNaN(expirationTimestamp)) {
      logger.debug(`handleEvent - Blocked event with invalid expiration timestamp: ${event.id}`);
      socket.send(JSON.stringify(["NOTICE", "error: invalid expiration timestamp"]));
      socket.send(JSON.stringify(["OK", event.id, false, "invalid expiration value"]));
      return;
    }
    if ( Math.floor(Date.now() / 1000) > expirationTimestamp) {
      logger.debug(`handleEvent - Blocked expired event: ${event.id}, expiration: ${expirationTimestamp}`);
      socket.send(JSON.stringify(["NOTICE", "error: event expired"]));
      socket.send(JSON.stringify(["OK", event.id, false, "expired event"]));
      return;
    }
  }

  // Valid proof of work (NIP-13) if required
  if (app.get("config.relay")["limitation"]["min_pow_difficulty"] > 0) {

    const nonceTag = event.tags.find(tag => tag[0] === 'nonce');
    if (!nonceTag || nonceTag.length < 3) {
      logger.debug(`handleEvent - Blocked event with missing or malformed nonce tag: ${event.id}`);
      socket.send(JSON.stringify(["NOTICE", "error: missing or malformed nonce tag"]));
      socket.send(JSON.stringify(["OK", event.id, false, "error: missing or malformed nonce tag"]));
      return;
    }

    const targetDifficulty  = parseInt(nonceTag[2], 10);
    if (isNaN(targetDifficulty)) {
      logger.debug(`handleEvent - Blocked event with invalid target difficulty in nonce tag: ${event.id}`);
      socket.send(JSON.stringify(["NOTICE", "error: invalid target difficulty in nonce tag"]));
      socket.send(JSON.stringify(["OK", event.id, false, "error: invalid target difficulty in nonce tag"]));
      return;
    }

    const resultPow = await validatePow(event.id, targetDifficulty);
    if (!resultPow) {
      logger.debug(`handleEvent - Blocked event with invalid proof of work: ${event.id}`);
      socket.send(JSON.stringify(["NOTICE", "error: invalid proof of work"]));
      socket.send(JSON.stringify(["OK", event.id, false, "error: invalid proof of work"]));
      return;
    }
  }

  // Check if the event has invalid tags that are not whitelisted (if whitelist is enabled)
  if (app.get("config.relay")["tags"].length > 0) {
    const tags = event.tags.map(tag => tag[0]);
    const invalidTags = tags.filter(tag => !app.get("config.relay")["tags"].includes(tag) && allowedTags.includes(tag) == false);
    if (invalidTags.length > 0) {
      logger.debug(`handleEvent - Blocked event with invalid tags: ${event.id}, ${invalidTags.join(", ")}`);
      socket.send(JSON.stringify(["NOTICE", `blocked: invalid tags: ${invalidTags.join(", ")}`]));
      socket.send(JSON.stringify(["OK", event.id, false, `blocked: invalid tags: ${invalidTags.join(", ")}`]));
      return;
    }
  }

  // NIP-70 Check if the event has a ["-"] tag and "auth_required" is enabled
  if (app.get("config.relay")["limitation"]["auth_required"] == true && event.tags.some(tag => tag[0] === "-") && authSessions.get(socket) !== event.pubkey) {
      logger.debug(`handleEvent - Blocked private message without authentication: ${event.id}`);
      socket.send(JSON.stringify(["NOTICE", "error: unauthorized to post private messages"]));
      socket.send(JSON.stringify(["OK", event.id, false, "error: unauthorized to post private messages"]));
      return;
  }

  // Plugins engine execution
  if (await executePlugins({pubkey: event.pubkey, ip: reqInfo.ip, event: event}, app, "relay") == false) {
    logger.debug(`handleEvent - Blocked event by plugins engine: ${event.id}`);
    socket.send(JSON.stringify(["NOTICE", "blocked: can't accept event"]));
    socket.send(JSON.stringify(["OK", event.id, false, "blocked: can't accept event"]));
    return;
  }

  if (events.memoryDB.has(event.id)) {
    logger.debug(`handleEvent - Duplicate event: ${event.id}`);
    socket.send(JSON.stringify(["OK", event.id, false, "duplicate: already have this event"]));
    return;
  }

  logger.debug(`handleEvent - Received event: ${event.id}, kind: ${event.kind} |`, reqInfo.ip);

  if (isEphemeral(event.kind)) {
    subscriptions.forEach((clientSubscriptions) => {
      clientSubscriptions.forEach((listener) => listener(event));
    });
    logger.debug(`handleEvent - Accepted ephemeral event successfully: ${event.id}`);
    socket.send(JSON.stringify(["OK", event.id, true, "ephemeral: accepted but not stored"]));
    return;
  }

  if (isReplaceable(event.kind)) {
    for (const [key, memEv] of events.memoryDB.entries()) {
      if (memEv.event.kind === event.kind && memEv.event.pubkey === event.pubkey) {
          if (event.created_at > memEv.event.created_at ||(event.created_at === memEv.event.created_at && event.id < memEv.event.id)) {
            const deleteResult = await dbUpdate("events", {"active": "0"}, ["event_id"], [memEv.event.id]);
            if (!deleteResult) {
              logger.error(`handleEvent - Failed to delete replaceable event: ${memEv.event.id}`);
              socket.send(JSON.stringify(["NOTICE", "error: failed to delete replaceable event"]));
              socket.send(JSON.stringify(["OK", event.id, false, "error: failed to delete replaceable event"]));
              return;
            }
            logger.debug(`handleEvent - Deleted replaceable event successfully: ${memEv.event.id}`);
            events.memoryDB.delete(key); 
            break;
          } else {
              logger.debug(`handleEvent - Duplicate event: ${event.id}`);
              socket.send(JSON.stringify(["OK", event.id, false, "duplicate: older or same version"]));
              return;
          }
      }
    }
  }

  // Event kind 1040 (NIP-03)
  if (event.kind === 1040) {
    const hasEtag = event.tags.some(tag => tag[0] === "e");
    const hasAltTag = event.tags.some(tag => tag[0] === "alt" && tag[1].toLocaleLowerCase() === "opentimestamps attestation");

    if (!hasEtag || !hasAltTag) {
      logger.debug(`handleEvent - Rejected kind:1040 event ${event.id} due to missing required tags.`);
      socket.send(JSON.stringify(["NOTICE", "invalid: missing required OpenTimestamps tags"]));
      socket.send(JSON.stringify(["OK", event.id, false, "invalid: missing required OpenTimestamps tags"]));
      return;
    }

    if(!isBase64(event.content)) {
      logger.debug(`handleEvent - Rejected kind:1040 event ${event.id} due to invalid encoding.`);
      socket.send(JSON.stringify(["NOTICE", "invalid: OpenTimestamps proof must be Base64 encoded"]));
      socket.send(JSON.stringify(["OK", event.id, false, "invalid: OpenTimestamps proof must be Base64 encoded"]));
      return;
    }
  }

  // Event kind 5 (NIP-09) Event deletion
  if (event.kind === 5) {

    const eventsToDelete = event.tags.filter(tag => tag[0] === "e" || tag[0] === "a").map(tag => tag[1].trim());
    if (eventsToDelete.length === 0) {
      logger.error(`handleEvent - Rejected kind:5 event ${event.id} due to missing required tags.`);
      socket.send(JSON.stringify(["NOTICE", "invalid: missing required tags"]));
      socket.send(JSON.stringify(["OK", event.id, false, "invalid: missing required tags"]));
      return;
    }

    const pendingEvents = eventsToDelete.map(id => events.pending.get(id)).filter(e => e !== undefined).filter(e => e.kind !== 5);
    if (pendingEvents.length > 0) {

      pendingEvents.forEach(e => {
        events.pending.delete(e.id);
        events.memoryDB.delete(e.id);
        const index = events.sortedArray.findIndex((event: Event) => event.id === e.id);
        if (index !== -1)  events.sortedArray.splice(index, 1);
      });

      logger.debug(`handleEvent - Accepted kind:5 event ${event.id} and deleted events: ${pendingEvents.map(e => e.id).join(", ")}`);
      socket.send(JSON.stringify(["NOTICE", "deleted: events successfully deleted"]));
      socket.send(JSON.stringify(["OK", event.id, true, "deleted: events successfully deleted"]));
      return;

    }

    const storedEvents = eventsToDelete.map(id => events.memoryDB.get(id)).filter(e => e !== undefined).filter(e => e.event.kind !== 5);
    if (storedEvents.length === 0) {
      logger.debug(`handleEvent - Rejected kind:5 event ${event.id} due to no events found for deletion.`);
      socket.send(JSON.stringify(["NOTICE", "invalid: no events found for deletion"]));
      socket.send(JSON.stringify(["OK", event.id, false, "invalid: no events found for deletion"]));
      return;
    }

    const unauthorizedEvents = storedEvents.filter(e => e.event.pubkey !== event.pubkey);
    if (unauthorizedEvents.length > 0) {
      logger.debug(`handleEvent - Rejected kind:5 event ${event.id} due to unauthorized to delete events. |`, reqInfo.ip);
      socket.send(JSON.stringify(["NOTICE", "error: unauthorized to delete events"]));
      socket.send(JSON.stringify(["OK", event.id, false, "error: unauthorized to delete events"]));
      return;
    }

    let ownedEvents = storedEvents.filter(e => e.event.pubkey === event.pubkey);
    if (ownedEvents.length === 0) {
      logger.debug(`handleEvent - Rejected kind:5 event ${event.id} due to no events found for deletion.`);
      socket.send(JSON.stringify(["NOTICE", "invalid: no events found for deletion"]));
      socket.send(JSON.stringify(["OK", event.id, false, "invalid: no events found for deletion"]));
      return;
    }

    // Filter out "a" events that are newer than the kind:5 deletion request
    ownedEvents = ownedEvents.filter(e => {
      if (e.event.tags.some((tag: [string, string]) => tag[0] === "a")) return e.event.created_at < event.created_at; 
      return true;
    });
    if (ownedEvents.length === 0) {
      logger.debug(`handleEvent - Rejected kind:5 event ${event.id} due due to no events found for deletion.`);
      socket.send(JSON.stringify(["NOTICE", "invalid: no valid events remain for deletion"]));
      socket.send(JSON.stringify(["OK", event.id, false, "invalid: no events found for deletion"]));
      return;
    }

    const deleteResults = await Promise.all(ownedEvents.map(e => dbUpdate("events", {"active": "0"}, ["event_id"], [e.event.id])));
    if (!deleteResults.every(result => result)) {
      logger.error(`handleEvent - Failed to delete events: ${ownedEvents.map(e => e.event.id).join(", ")}`);
      socket.send(JSON.stringify(["NOTICE", "error: failed to delete events"]));
      socket.send(JSON.stringify(["OK", event.id, false, "error: failed to delete events"]));
      return;
    } else {
      // Remove events from memory
      ownedEvents.forEach(e => {
        events.memoryDB.delete(e.event.id);
        const index = events.sortedArray.findIndex((event: Event) => event.id === e.event.id);
        if (index !== -1)  events.sortedArray.splice(index, 1);
      });
      logger.debug(`handleEvent - Accepted kind:5 event ${event.id} and deleted events: ${ownedEvents.map(e => e.event.id).join(", ")}`);
      socket.send(JSON.stringify(["OK", event.id, true, "deleted: events successfully deleted"]));
    }

  }

  // Save the event to memory
  const insertionIndex = binarySearchCreatedAt(events.sortedArray, event.created_at);
  events.sortedArray.splice(insertionIndex, 0, event);
  event = await compressEvent(event);
  events.memoryDB.set(event.id, { event: event, processed: false });
  events.pending.set(event.id, event);

  // Notify all clients about the new event
  subscriptions.forEach((clientSubscriptions) => {
    clientSubscriptions.forEach((listener) => {listener(event)} );
  });

  // Send confirmation to the client
  logger.debug(`handleEvent - Accepted event: ${event.id}`);
  socket.send(JSON.stringify(["OK", event.id, true, ""]));
  return;
};

// Handle REQ or COUNT
const handleReqOrCount = async (socket: WebSocket, subId: string, filters: Filter[], type: string, reqInfo: ipInfo) => {
  
  logger.debug(`handleReqOrCount - Received ${type} message:`, subId);
  logger.debug(`handleReqOrCount - Filters:`, filters);

  if (!filters || !Array.isArray(filters) || filters.length === 0) {
    logger.debug(`handleReqOrCount - No filters provided: ${subId}`);
    socket.send(JSON.stringify(["CLOSED", subId, "unsupported: no filters provided"]));
    socket.close(1003, "unsupported: no filters provided");
    return;
  }

  if (app.get("config.relay")["limitation"]["auth_required"] == true && !authSessions.has(socket)) {
    const requestedKinds = filters.flatMap(f => f.kinds || []);

    if (requestedKinds.some(kind => [4, 14, 1059].includes(kind))) {
      logger.debug(`handleReqOrCount - Blocked REQ for private messages without authentication: ${subId} |`, reqInfo.ip);
      socket.send(JSON.stringify(["NOTICE", "auth-required: must authenticate to request private messages"]));
      socket.send(JSON.stringify(["CLOSED", subId, "auth-required: must authenticate to request private messages"]));
      socket.close(1003, "auth-required: must authenticate to request private messages");
      return;
    }
  }

  if (filters.length > app.get("config.relay")["limitation"]["max_filters"]) {
    logger.debug(`handleReqOrCount - Too many filters: ${subId}`);
    socket.send(JSON.stringify(["CLOSED", subId, "unsupported: too many filters"]));
    socket.close(1003, "unsupported: too many filters");
    return;
  }

  if (subId.length > app.get("config.relay")["limitation"]["max_subid_length"]) {
    logger.debug(`handleReqOrCount - Subscription id too long: ${subId}`);
    socket.send(JSON.stringify(["CLOSED", subId, "unsupported: subscription id too long"]));
    socket.close(1003, "unsupported: subscription id too long");
    return;
  }

  try {
    const eventsList = await getEvents(filters, events);
    let count = 0;
    for (const event of eventsList) {
      if (socket.readyState !== WebSocket.OPEN) break;
      count++;
      if (type === "REQ") {
        logger.debug(`handleReqOrCount - Sent event: ${event.id}`);
        socket.send(JSON.stringify(["EVENT", subId, event]));
        if (count >= app.get("config.relay")["limitation"]["max_limit"]) break;
      }
    }

    if (type === "REQ"){
      
      if (socket.readyState === WebSocket.OPEN) {
        logger.debug(`handleReqOrCount - EOSE - Sent ${count} events to subscription: ${subId}`);
        socket.send(JSON.stringify(["EOSE", subId])); 
      }

      const listener = async (event: Event): Promise<void> => {
        if (filters.some((f) => matchFilter(f, event)) && socket.readyState === WebSocket.OPEN) {
          logger.debug(`handleReqOrCount - Sent live event: ${event.id}`);
          socket.send(JSON.stringify(["EVENT", subId, event]));
        }
      };
      addSubscription(subId, socket, listener);
    }

    if (type === "COUNT") {
      logger.debug(`handleReqOrCount - Sent count: ${count} to subscription: ${subId}`);
      socket.send(JSON.stringify(["COUNT", subId, { count }]));
    }

  } catch (error) {
    logger.error(`handleReqOrCount - Failed to process subscription: ${subId}, error: ${error}`);
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(["CLOSED", subId, "error: failed to process subscription"]));
      socket.close(1003, "error: failed to process subscription");
    }
  }
};

// Handle CLOSE
const handleClose = (socket: WebSocket, subId?: string) => {
  removeSubscription(subId, socket);
};

// Handle AUTH
const handleAuthMessage = async (socket: ExtendedWebSocket, message: ["AUTH", AuthEvent]): Promise<void> => {

  if (!Array.isArray(message) || message.length !== 2) {
    logger.debug(`handleAuthMessage - Malformed AUTH message: ${message}`);
    socket.send(JSON.stringify(["NOTICE", "error: malformed AUTH message"]));
    return;
  }

  const [, authData] = message;

  if (typeof authData !== "object" || authData === null) {
    logger.debug(`handleAuthMessage - Invalid AUTH payload: ${authData}`);
    socket.send(JSON.stringify(["NOTICE", "error: AUTH payload must be an object"]));
    return;
  }

  if (authData.kind !== 22242) {
    logger.debug(`handleAuthMessage - Invalid AUTH event kind: ${authData.kind}`);
    socket.send(JSON.stringify(["NOTICE", "error: invalid AUTH event kind"]));
    return;
  }

  const relayTag = authData.tags.find(tag => tag[0] === "relay");
  const challengeTag = authData.tags.find(tag => tag[0] === "challenge");

  if (!relayTag || !challengeTag) {
    logger.debug(`handleAuthMessage - Missing relay or challenge tag: ${authData.tags}`);
    socket.send(JSON.stringify(["NOTICE", "error: missing relay or challenge tag"]));
    return;
  }

  const challenge = challengeTag[1];
  if (!socket.challenge || socket.challenge !== challenge) {
    logger.debug(`handleAuthMessage - Invalid challenge: ${challenge}`);
    socket.send(JSON.stringify(["NOTICE", "error: invalid challenge"]));
    return;
  }

  const validEvent = await isEventValid(authData, 60, 10);
  if (validEvent.status !== "success") {
    logger.debug(`handleAuthMessage - Invalid AUTH event: ${validEvent.message}`);
    socket.send(JSON.stringify(["NOTICE", `error: ${validEvent.message}`]));
    return;
  }

  logger.debug(`handleAuthMessage - AUTH event received: ${authData.id}`);

  authSessions.set(socket, authData.pubkey);
  delete socket.challenge;

  const registeredData = await dbMultiSelect(["id", "username"],"registered","hex = ?", [authData.pubkey], true);
  if (registeredData.length === 0) {
    logger.debug("AUTH failed: pubkey not registered:", authData.id);
    socket.send(JSON.stringify(["NOTICE", "error: pubkey not registered"]));
    return;
  }

  logger.debug(`handleAuthMessage - AUTH successful: ${authData.id}, ${registeredData[0].username}`);
  socket.send(JSON.stringify(["OK", authData.id, true, "AUTH successful"]));
};

const getRelayStatus = async (req: Request, res: Response): Promise<Response> => {

  // Check if the request IP is allowed
  const reqInfo = await isIpAllowed(req);
  if (reqInfo.banned == true) {
      logger.warn(`ServerStatus - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
      return res.status(403).send({"status": "error", "message": reqInfo.comments});
  }

  // Check if current module is enabled
  if (!isModuleEnabled("relay", app)) {
      logger.warn("ServerStatus - Attempt to access a non-active module:","relay","|","IP:", reqInfo.ip);
      return res.status(403).send({"status": "error", "message": "Module is not enabled"});
  }

  // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req,"getRelayQueue", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}

  const result : RelayStatusMessage = {
    status: "success",
    message: "Relay status retrieved successfully",
    websocketConnections: app.get("wss").clients.size || 0,
    queueLength: getRelayQueueLength() || 0,
    workerCount: relayWorkers,
  }

  return res.status(200).send(result);
};

export { handleWebSocketMessage, getRelayStatus };