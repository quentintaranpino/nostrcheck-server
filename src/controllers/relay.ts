import WebSocket from "ws";
import { parseRelayMessage, isValidEvent, matchFilter } from "../lib/relay/core.js";

const subscriptions: Map<string, (event: any) => void> = new Map();
const events: any[] = []; // Storing events in memory, temporary solution

export const handleWebSocketMessage = (socket: WebSocket, data: WebSocket.RawData) => {
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
  }
};

// Maneja eventos tipo "EVENT"
const handleEvent = async (socket: WebSocket, event: any) => {
  if (!await isValidEvent(event)) {
    socket.send(JSON.stringify(["NOTICE", "Invalid event structure"]));
    return;
  }

  console.log("Received EVENT:", event.id);

  // Almacenar el evento en memoria
  events.push(event);
  if (events.length > 10000) {
    events.shift(); 
  }

  subscriptions.forEach((listener) => listener(event));

  socket.send(JSON.stringify(["OK", event.id, true, ""]));
};

// REQ 
const handleReq = (socket: WebSocket, subId: string, filter: any) => {
  console.log("Received REQ:", subId);

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

  // Store the listener
  subscriptions.set(subId, listener);
};

// Manage CLOSE
const handleClose = (socket: WebSocket, subId: string) => {
  console.log("Received CLOSE:", subId);

  // Remove the subscription
  if (subscriptions.has(subId)) {
    subscriptions.delete(subId);
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(["NOTICE", `Subscription ${subId} closed`]));
    }
  } else {
    console.log(`Subscription ${subId} not found`);
  }
};
