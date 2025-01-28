import WebSocket from "ws";
import { parseRelayMessage, subscriptions, addSubscription, removeAllSubscriptions, removeSubscription } from "../lib/relay/core.js";
import { Event, Filter, matchFilter } from "nostr-tools";
import { isEventValid } from "../lib/nostr/core.js";
import { isModuleEnabled } from "../lib/config.js";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { Request } from "express";
import { isIpAllowed } from "../lib/ips.js";
import { isEntityBanned } from "../lib/banned.js";
import { isEphemeral, isReplaceable } from "../lib/nostr/NIP01.js";
import { getEventsDB, initEventsDB, storeEvent } from "../lib/relay/database.js";

const events = initEventsDB(app);

const handleWebSocketMessage = async (socket: WebSocket, data: WebSocket.RawData, req: Request) => {

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
    const message = parseRelayMessage(data);

    if (!message) {
      socket.send(JSON.stringify(["NOTICE", "invalid: malformed note"]));
      return;
    }

    const [type, ...args] = message;

    switch (type) {
      case "EVENT":
        if (typeof args[0] !== 'string') {
          handleEvent(socket, args[0] as Event);
        } else {
          socket.send(JSON.stringify(["NOTICE", "invalid: event data is not an object"]));
        }
        break;

      case "REQ": {
        const filters: Filter[] = args.slice(1) as Filter[];
        if (typeof args[0] === 'string') {
          await handleReq(socket, args[0], filters);
        } else {
          socket.send(JSON.stringify(["NOTICE", "invalid: subscription id is not a string"]));
        }
        break;
      }

      case "CLOSE":
        handleClose(socket, typeof args[0] === 'string' ? args[0] : undefined);
        break;

      default:
        socket.send(JSON.stringify(["NOTICE", "error: unknown command"]));
    }
  } catch (error) {
    logger.error("Error handling WebSocket message:", error);
    socket.send(JSON.stringify(["NOTICE", "error: internal server error"]));
    socket.close(1011, "error: internal server error"); 
  }
};

// Handle EVENT
const handleEvent = async (socket: WebSocket, event: Event) => {

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

  const validEvent = await isEventValid(event);
  if (validEvent.status !== "success") {
    socket.send(JSON.stringify(["OK", event.id, false, `invalid: ${validEvent.message}`]));
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
    return;
  }

  for (const f of filters) {
    if (!f || typeof f !== "object") {
      socket.send(JSON.stringify(["CLOSED", subId, "unsupported: invalid filter"]));
      return;
    }
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

    let requestedLimit = 0;
    for (const f of filters) {
      if (f.limit && f.limit > requestedLimit) {
        requestedLimit = f.limit;
      }
    }
    if (requestedLimit === 0) {
      requestedLimit = app.get("config.security")["relay"]["maxRequestFilterLimit"];
    }
    
    const maxConfigured = app.get("config.security")["relay"]["maxRequestFilterLimit"];
    const finalLimit = Math.min(requestedLimit, maxConfigured);
    
    const limitedEvents = matchedEvents.slice(0, finalLimit);

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

export { handleWebSocketMessage };