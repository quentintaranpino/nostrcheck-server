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

const events: any[] = []; // Temporary in-memory storage for events

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
          handleReq(socket, args[0], filters);
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

  const validEvent = await isEventValid(event);
  
  if (validEvent.status !== "success") {
    socket.send(JSON.stringify(["OK", event.id, false, `invalid: ${validEvent.message}`]));
    return;
  }

  logger.info("Received EVENT:", event.id);

  // Check if the event is already in memory
  if (events.some((e) => e.id === event.id)) {
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
    const index = events.findIndex((e) => e.kind === event.kind && e.pubkey === event.pubkey);
    if (index !== -1) {
      const old = events[index];
      if (
        event.created_at > old.created_at ||
        (event.created_at === old.created_at && event.id < old.id)
      ) {
        events[index] = event; 
      } else {
        socket.send(JSON.stringify(["OK", event.id, false, "duplicate: older or same version"]));
        return;
      }
    } else {
      events.push(event);
    }
  } else {
    events.push(event);
  }
  if (events.length > 10000) {
    events.shift(); // Remove oldest events to limit memory usage, temporary solution
  }

  // Notify subscribers
  subscriptions.forEach((clientSubscriptions) => {
    clientSubscriptions.forEach((listener) => {
      listener(event); 
    });
  });

  socket.send(JSON.stringify(["OK", event.id, true, ""]));
};

// Handle REQ
const handleReq = (socket: WebSocket, subId: string, filters: Filter[]) => {
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
    const matchedEvents = events.filter((ev) =>
      filters.some((fil) => matchFilter(fil, ev))
    );

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

    const listener = (ev: Event): void => {
      if (filters.some((f) => matchFilter(f, ev)) && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(["EVENT", subId, ev]));
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

export { handleWebSocketMessage };