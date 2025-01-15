import WebSocket from "ws";
import { parseRelayMessage, subscriptions, addSubscription, removeSubscription } from "../lib/relay/core.js";
import { Event, Filter, matchFilter } from "nostr-tools";
import { isEventValid } from "../lib/nostr/core.js";
import { isModuleEnabled } from "../lib/config.js";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { Request } from "express";
import { isIpAllowed } from "../lib/ips.js";
import { isEntityBanned } from "../lib/banned.js";

const events: any[] = []; // Temporary in-memory storage for events

const handleWebSocketMessage = async (socket: WebSocket, data: WebSocket.RawData, req: Request) => {

  // Check if the request IP is allowed
  const reqInfo = await isIpAllowed(req);
  if (reqInfo.banned == true) {
    logger.warn(`Attempt to access relay with unauthorized IP: ${reqInfo.ip} | Reason: ${reqInfo.comments}`);
    socket.send(JSON.stringify(["NOTICE", `unauthorized access: ${reqInfo.comments}`]));
    removeSubscription(undefined, socket);
    return;
  }

  // Check if current module is enabled
  if (!isModuleEnabled("relay", app)) {
    logger.warn("Attempt to access a non-active module:", "relay", "|", "IP:", reqInfo.ip);
    socket.send(JSON.stringify(["NOTICE", "relay module is not active"]));
    removeSubscription(undefined, socket);
    return;
  }

  try {
    const message = parseRelayMessage(data);

    if (!message) {
      socket.send(JSON.stringify(["NOTICE", "Invalid message format"]));
      removeSubscription(undefined, socket);
      return;
    }

    const [type, ...args] = message;

    switch (type) {
      case "EVENT":
        handleEvent(socket, args[0]);
        break;

      case "REQ":
        handleReq(socket, args[0], args[1]);
        break;

      case "CLOSE":
        handleClose(socket, args[0]);
        break;

      default:
        socket.send(JSON.stringify(["NOTICE", "Unknown command"]));
    }
  } catch (error) {
    logger.error("Error handling WebSocket message:", error);
    socket.send(JSON.stringify(["NOTICE", "Internal server error"]));
    socket.close(1011, "Internal server error"); 
  }
};

// Handle EVENT
const handleEvent = async (socket: WebSocket, event: Event) => {

  // Check if the event pubkey is banned
  if (await isEntityBanned(event.pubkey, "registered")) {
    socket.send(JSON.stringify(["NOTICE", "unauthorized access: banned pubkey"]));
    socket.send(JSON.stringify(["OK", event.id, false, "unauthorized access: banned pubkey"]));
    removeSubscription(undefined, socket);
    return;
  }

  const validationResult = await isEventValid(event);
  
  if (validationResult.status !== "success") {
    let errorMessage = `invalid: ${validationResult.message}`;
    socket.send(JSON.stringify(["OK", event.id, false, errorMessage]));
    return;
  }

  logger.info("Received EVENT:", event.id);

  // Check if the event is already in memory
  if (events.some((e) => e.id === event.id)) {
    socket.send(JSON.stringify(["OK", event.id, false, "duplicate: already have this event"]));
    return;
  }

  // Save the event in memory
  events.push(event);
  if (events.length > 10000) {
    events.shift(); // Remove oldest events to limit memory usage, temporary solution
  }

  // Notify subscribers
  subscriptions.forEach((value) => {
    value.listener(event);
  });

  socket.send(JSON.stringify(["OK", event.id, true, ""]));
};

// Handle REQ
const handleReq = (socket: WebSocket, subId: string, filter: Filter) => {
  logger.info("Received REQ:", subId, filter);

  if (!filter || typeof filter !== "object") {
    socket.send(JSON.stringify(["CLOSED", subId, "error: invalid filter"]));
    return;
  }

  try {
    // Find matching events
    const matchingEvents = events
      .filter((event) => matchFilter(filter, event))
      .slice(0, filter.limit || 100);

    // Send matching events
    matchingEvents.forEach((event) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(["EVENT", subId, event]));
      }
    });

    // Send end of stream
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(["EOSE", subId]));
    }

    // Create a listener for future events
    const listener = (event: any) => {
      if (matchFilter(filter, event) && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(["EVENT", subId, event]));
      }
    };

    // Register the subscription
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
  if (subId) {
    if (subscriptions.has(subId)) {
      removeSubscription(subId);
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(["NOTICE", `Subscription ${subId} closed`]));
      }
    } 
  } else {
    removeSubscription(undefined, socket);
  }
};

export { handleWebSocketMessage };