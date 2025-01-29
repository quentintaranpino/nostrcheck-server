import WebSocket from "ws";
import { parseRelayMessage, subscriptions, addSubscription, removeAllSubscriptions, removeSubscription } from "../lib/relay/core.js";
import { Event, Filter, matchFilter, verifyEvent } from "nostr-tools";
import { isEventValid } from "../lib/nostr/core.js";
import { isModuleEnabled } from "../lib/config.js";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { Request } from "express";
import { isIpAllowed } from "../lib/ips.js";
import { isEntityBanned } from "../lib/banned.js";
import { isEphemeral, isReplaceable } from "../lib/nostr/NIP01.js";
import { getEventsDB, initEventsDB, storeEvent } from "../lib/relay/database.js";
import { executePlugins } from "../lib/plugins/core.js";
import { ipInfo } from "../interfaces/ips.js";
import { validatePow } from "../lib/nostr/NIP13.js";
import { allowedTags, AuthEvent, ExtendedWebSocket } from "../interfaces/relay.js";

const events = initEventsDB(app);
const authSessions: Map<WebSocket, string> = new Map(); 

const handleWebSocketMessage = async (socket: ExtendedWebSocket, data: WebSocket.RawData, req: Request) => {

  // Check if the request IP is allowed
  const reqInfo = await isIpAllowed(req);
  if (reqInfo.banned == true) {
    logger.warn(`Attempt to access relay with unauthorized IP: ${reqInfo.ip} | Reason: ${reqInfo.comments}`);
    socket.send(JSON.stringify(["NOTICE", `${reqInfo.comments}`]));
    removeAllSubscriptions(socket);
    return;
  }

  // Check if current module is enabled
  if (!isModuleEnabled("relay", app)) {
    logger.warn("Attempt to access a non-active module:", "relay", "|", "IP:", reqInfo.ip);
    socket.send(JSON.stringify(["NOTICE", "blocked: relay module is not active"]));
    removeAllSubscriptions(socket);
    return;
  }

  try {

    const max_message_length = app.get("config.relay")["limitation"]["max_message_length"];
    if (Buffer.byteLength(data.toString()) > max_message_length) {
      socket.send(JSON.stringify(["NOTICE", "error: message too large"]));
      socket.close(1009, "message too large");

      return;
    }

    const message = parseRelayMessage(data);

    if (!message) {
      socket.send(JSON.stringify(["NOTICE", "invalid: malformed note"]));
      socket.close(1003, "invalid: malformed note");
      return;
    }

    const [type, ...args] = message;

    switch (type) {
      case "EVENT":
        if (typeof args[0] !== 'string') {
          handleEvent(socket, args[0] as Event, reqInfo);
        } else {
          socket.send(JSON.stringify(["NOTICE", "invalid: event data is not an object"]));
          socket.close(1003, "invalid: event data is not an object");
        }
        break;

      case "REQ": {
        const filters: Filter[] = args.slice(1) as Filter[];
        if (typeof args[0] === 'string') {
          await handleReq(socket, args[0], filters);
        } else {
          socket.send(JSON.stringify(["NOTICE", "invalid: subscription id is not a string"]));
          socket.close(1003, "invalid: subscription id is not a string");
        }
        break;
      }

      case "CLOSE": {
        handleClose(socket, typeof args[0] === 'string' ? args[0] : undefined);
        break;
      }

      case "AUTH":
        await handleAuthMessage(socket, message);
        break;

      default:
        socket.send(JSON.stringify(["NOTICE", "error: unknown command"]));
        socket.close(1003, "error: unknown command");
    }
  } catch (error) {
    logger.error("Error handling WebSocket message:", error);
    socket.send(JSON.stringify(["NOTICE", "error: internal server error"]));
    socket.close(1011, "error: internal server error"); 
  }
};

// Handle EVENT
const handleEvent = async (socket: WebSocket, event: Event, reqInfo : ipInfo) => {

  // Check if the event pubkey is banned
  if (await isEntityBanned(event.pubkey, "registered")) {
    socket.send(JSON.stringify(["NOTICE", "blocked: banned pubkey"]));
    socket.send(JSON.stringify(["OK", event.id, false, "blocked: banned pubkey"]));
    removeAllSubscriptions(socket);
    return;
  }

  // Check if the event is banned
  if (await isEntityBanned(event.id, "events")) {
    socket.send(JSON.stringify(["NOTICE", "blocked: banned event"]));
    socket.send(JSON.stringify(["OK", event.id, false, "blocked: banned event"]));
    removeAllSubscriptions(socket);
    return;
  }

  // Check if the event is valid
  const validEvent = await isEventValid(event, app.get("config.relay")["limitation"]["created_at_lower_limit"], app.get("config.relay")["limitation"]["created_at_upper_limit"]);
  if (validEvent.status !== "success") {
    socket.send(JSON.stringify(["NOTICE", `invalid: ${validEvent.message}`]));
    socket.send(JSON.stringify(["OK", event.id, false, `invalid: ${validEvent.message}`]));
    return;
  }

  // Check if the event has a valid AUTH session
  if (app.get("config.relay")["limitation"]["auth_required"] == true && !authSessions.has(socket)) {
    socket.send(JSON.stringify(["NOTICE", "auth-required: you must authenticate first"]));
    socket.send(JSON.stringify(["OK", event.id, false, "auth-required: you must authenticate first"]));
    return;
}

  // Check if the event has more tags than allowed
  if (event.tags.length > app.get("config.relay")["limitation"]["max_event_tags"]) {
    socket.send(JSON.stringify(["NOTICE", "blocked: too many tags"]));
    socket.send(JSON.stringify(["OK", event.id, false, "blocked: too many tags"]));
    return;
  }

  // Check if the event content is too large
  if (event.content.length > app.get("config.relay")["limitation"]["max_content_length"]) {
    socket.send(JSON.stringify(["NOTICE", "blocked: event content too large"]));
    socket.send(JSON.stringify(["OK", event.id, false, "blocked: event content too large"]));
    return;
  }

  // Check if the event has a valid proof of work (NIP-13) if required
  if (app.get("config.relay")["limitation"]["min_pow_difficulty"] > 0) {

    const nonceTag = event.tags.find(tag => tag[0] === 'nonce');
    if (!nonceTag || nonceTag.length < 3) {
      socket.send(JSON.stringify(["NOTICE", "error: missing or malformed nonce tag"]));
      socket.send(JSON.stringify(["OK", event.id, false, "error: missing or malformed nonce tag"]));
      return;
    }

    const targetDifficulty  = parseInt(nonceTag[2], 10);
    if (isNaN(targetDifficulty)) {
      socket.send(JSON.stringify(["NOTICE", "error: invalid target difficulty in nonce tag"]));
      socket.send(JSON.stringify(["OK", event.id, false, "error: invalid target difficulty in nonce tag"]));
      return;
    }

    const resultPow = await validatePow(event.id, targetDifficulty);
    if (!resultPow) {
      socket.send(JSON.stringify(["NOTICE", "error: invalid proof of work"]));
      socket.send(JSON.stringify(["OK", event.id, false, "error: invalid proof of work"]));
      return;
    }
  }

  // Check if the event has invalid tags if required
  if (app.get("config.relay")["tags"].length > 0) {
    const tags = event.tags.map(tag => tag[0]);
    const invalidTags = tags.filter(tag => !allowedTags.includes(tag) && !app.get("config.relay")["tags"].includes(tag));
    if (invalidTags.length > 0) {
      socket.send(JSON.stringify(["NOTICE", `blocked: invalid tags: ${invalidTags.join(", ")}`]));
      socket.send(JSON.stringify(["OK", event.id, false, `blocked: invalid tags: ${invalidTags.join(", ")}`]));
      return;
    }
  }
  
  // Plugins engine execution
  if (await executePlugins({pubkey: event.pubkey, filename: "", ip: reqInfo.ip}, app) == false) {
    socket.send(JSON.stringify(["NOTICE", "blocked: can't accept event"]));
    socket.send(JSON.stringify(["OK", event.id, false, "blocked: can't accept event"]));
    return;
  }

  logger.info("Received EVENT:", event.id);

  // Check if the event is already in memory
  if (events.has(event.id)) {
    socket.send(JSON.stringify(["OK", event.id, false, "duplicate: already have this event"]));
    return;
  }

  if (isEphemeral(event.kind)) {
    subscriptions.forEach((clientSubscriptions) => {
      clientSubscriptions.forEach((listener) => listener(event));
    });
    socket.send(JSON.stringify(["OK", event.id, true, "ephemeral: accepted but not stored"]));
    // Not saved in memory, but notify subscribers
    return;
  }

  if (isReplaceable(event.kind)) {
    for (const [key, memEv] of events.entries()) {
        if (memEv.event.kind === event.kind && memEv.event.pubkey === event.pubkey) {
            if (
                event.created_at > memEv.event.created_at ||
                (event.created_at === memEv.event.created_at && event.id < memEv.event.id)
            ) {
              events.delete(key); 
              events.set(event.id, { event, processed: false }); 
                break;
            } else {
                socket.send(JSON.stringify(["OK", event.id, false, "duplicate: older or same version"]));
                return;
            }
        }
    }
  } else {
    events.set(event.id, { event, processed: false });
  }

  if (events.size > 100000) {
    const firstKey = events.keys().next().value;
    if (firstKey !== undefined) {
      events.delete(firstKey);
    }
  }

  subscriptions.forEach((clientSubscriptions) => {
    clientSubscriptions.forEach((listener) => {
        listener(event);
    });

  });

  socket.send(JSON.stringify(["OK", event.id, true, ""]));
};

// Handle REQ
const handleReq = async (socket: WebSocket, subId: string, filters: Filter[]) => {

  logger.info("Received REQ:", subId, filters);

  if (!filters || !Array.isArray(filters) || filters.length === 0) {
    socket.send(JSON.stringify(["CLOSED", subId, "unsupported: no filters provided"]));
    socket.close(1003, "unsupported: no filters provided");
    return;
  }

  if (filters.length > app.get("config.relay")["limitation"]["max_filters"]) {
    socket.send(JSON.stringify(["CLOSED", subId, "unsupported: too many filters"]));
    socket.close(1003, "unsupported: too many filters");
    return;
  }

  for (const f of filters) {
    if (!f || typeof f !== "object") {
      socket.send(JSON.stringify(["CLOSED", subId, "unsupported: invalid filter"]));
      socket.close(1003, "unsupported: invalid filter");
      return;
    }
  }

  if (subId.length > app.get("config.relay")["limitation"]["max_subid_length"]) {
    socket.send(JSON.stringify(["CLOSED", subId, "unsupported: subscription id too long"]));
    socket.close(1003, "unsupported: subscription id too long");
    return;
  }

  try {

    const dbEvents = await getEventsDB(filters, events);
    const matchedEvents = dbEvents.filter((e) => filters.some((f) => matchFilter(f, e)));

    matchedEvents.sort((a, b) => {
      if (b.created_at !== a.created_at) {
        return b.created_at - a.created_at;
      }
      return a.id.localeCompare(b.id);
    });

    let received_limit = 0;
    for (const f of filters) {
      if (f.limit && f.limit > received_limit) {
        received_limit = f.limit;
      }
    }
    if (received_limit === 0) {
      received_limit = app.get("config.relay")["limitation"]["max_limit"];
    }
    if (received_limit > app.get("config.relay")["limitation"]["max_limit"]) {
      socket.send(JSON.stringify(["NOTICE", `warning: limit too high, using max limit of ${app.get("config.relay")["limitation"]["max_limit"]}`]));
    }
    
    const max_limit = app.get("config.relay")["limitation"]["max_limit"];
    const limitResult = Math.min(received_limit, max_limit);
    
    const limitedEvents = matchedEvents.slice(0, limitResult);

    limitedEvents.forEach((ev) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(["EVENT", subId, ev]));
      }
    });

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(["EOSE", subId]));
    }

    const listener = async (event: Event): Promise<void> => {
      if (filters.some((f) => matchFilter(f, event)) && socket.readyState === WebSocket.OPEN) {
        if (await isEventValid(event)){
          socket.send(JSON.stringify(["EVENT", subId, event]));
        }
      }
    };

    addSubscription(subId, socket, listener);

  } catch (error) {
    logger.error("Error processing REQ:", error);
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(["CLOSED", subId, "error: failed to process subscription"]));
    }
  }
};

// Handle CLOSE
const handleClose = (socket: WebSocket, subId?: string) => {
  removeSubscription(subId, socket);
};

setInterval(async () => {
  const eventsToPersist = [];
  for (const [, memEv] of events.entries()) {
      if (!memEv.processed) {
          eventsToPersist.push(memEv.event);
      }
  }

  if (eventsToPersist.length > 0) {
      const insertResults = await Promise.all(eventsToPersist.map(e => storeEvent(e)));
      eventsToPersist.forEach((event, index) => {
          if (insertResults[index] > 0) {
              const eventEntry = events.get(event.id);
              if (eventEntry)  eventEntry.processed = true;
          } else {
              logger.error(`Failed to store event ${event.id}`);
          }
      });
  }
}, 1000);

const handleAuthMessage = async (socket: ExtendedWebSocket, message: ["AUTH", string | AuthEvent]): Promise<void> => {
  if (!Array.isArray(message) || message.length !== 2) {
      socket.send(JSON.stringify(["NOTICE", "error: malformed AUTH message"]));
      return;
  }

  const [_, authData] = message;

  if (typeof authData === "string") {
      socket.challenge = authData;
      socket.send(JSON.stringify(["AUTH", authData]));
      return;
  }

  if (typeof authData === "object" && authData !== null) {
      if (authData.kind !== 22242) {
          socket.send(JSON.stringify(["NOTICE", "error: invalid AUTH event kind"]));
          return;
      }

      const relayTag = authData.tags.find(tag => tag[0] === "relay");
      const challengeTag = authData.tags.find(tag => tag[0] === "challenge");

      if (!relayTag || !challengeTag) {
          socket.send(JSON.stringify(["NOTICE", "error: missing relay or challenge tag"]));
          return;
      }

      const challenge = challengeTag[1];

      if (!socket.challenge || socket.challenge !== challenge) {
          socket.send(JSON.stringify(["NOTICE", "error: invalid challenge"]));
          return;
      }

      if (!verifyEvent(authData)) {
          socket.send(JSON.stringify(["NOTICE", "error: invalid signature"]));
          return;
      }

      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - authData.created_at) > 600) {
          socket.send(JSON.stringify(["NOTICE", "error: AUTH event expired"]));
          return;
      }

      authSessions.set(socket, authData.pubkey);
      socket.send(JSON.stringify(["OK", authData.id, true, "AUTH successful"]));
  }
};

export { handleWebSocketMessage };