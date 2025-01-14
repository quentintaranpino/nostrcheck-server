import WebSocket from "ws";
import { parseRelayMessage, subscriptions, addSubscription, removeSubscription } from "../lib/relay/core.js";
import { matchFilter } from "nostr-tools";
import { isEventValid } from "../lib/nostr/core.js";
import { isModuleEnabled } from "../lib/config.js";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { getClientIp } from "../lib/utils.js";
import { Request } from "express";

const events: any[] = []; // Temporary in-memory storage for events

export const handleWebSocketMessage = (socket: WebSocket, data: WebSocket.RawData, req: Request) => {

  // Check if current module is enabled
  if (!isModuleEnabled("relay", app)) {
    logger.warn("Attempt to access a non-active module:","relay","|","IP:",getClientIp(req));
    removeSubscription("", socket);
    return;
  }

  try {
    const message = parseRelayMessage(data);

    if (!message) {
      socket.send(JSON.stringify(["NOTICE", "Invalid message format"]));
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
    console.error("Error handling WebSocket message:", error);
    socket.send(JSON.stringify(["NOTICE", "Internal server error"]));
    socket.send(JSON.stringify(["CLOSED", "Internal server error"]));
  }
};

// Handle EVENT
const handleEvent = async (socket: WebSocket, event: any) => {
  if (await isEventValid(event) !== 0) {
    socket.send(JSON.stringify(["NOTICE", "Invalid event structure"]));
    return;
  }

  logger.info("Received EVENT:", event.id);

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
const handleReq = (socket: WebSocket, subId: string, filter: any) => {

  logger.info("Received REQ:", subId, filter);

  if (!filter || typeof filter !== "object") {
    socket.send(JSON.stringify(["NOTICE", "Invalid filter"]));
    return;
  }

  // Find matching events
  const matchingEvents = events.filter((event) => matchFilter(filter, event));

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
