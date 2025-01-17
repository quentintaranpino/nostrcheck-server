import WebSocket from "ws";
import { NIP01_event } from "../../interfaces/nostr.js";
import app from "../../app.js";

const parseRelayMessage = (data: WebSocket.RawData): any | null => {
  try {
    const message = JSON.parse(data.toString());
    const result = NIP01_event.safeParse(message);
    return result.success ? result.data : null;
  } catch {
    return null; 
  }
};

const subscriptions: Map<WebSocket, Map<string, Function>> = new Map();

const addSubscription = (subId: string, socket: WebSocket, listener: Function) => {
  if (!subscriptions.has(socket)) {
    subscriptions.set(socket, new Map());
  }

  const clientSubscriptions = subscriptions.get(socket);
  if (clientSubscriptions && clientSubscriptions.size >= app.get("config.security")["relay"]["maxSocketSubscriptions"]) {
    socket.send(JSON.stringify(["NOTICE", "error: subscription limit reached"]));
    return;
  }

  if (clientSubscriptions) {
    clientSubscriptions.set(subId, listener);
  }
};

const removeSubscription = (subId?: string, socket?: WebSocket) => {
  if (socket && subscriptions.has(socket)) {
    const clientSubscriptions = subscriptions.get(socket);

    if (subId) {
      clientSubscriptions?.delete(subId);
      socket.send(JSON.stringify(["CLOSED", subId, "Subscription closed by server"]));
    }

    if (!subId || (clientSubscriptions && clientSubscriptions.size === 0)) {
      subscriptions.delete(socket);
      if (!subId) {
        clientSubscriptions?.forEach((_, id) => {
          socket.send(JSON.stringify(["CLOSED", id, "Subscription closed by server"]));
        });
      }
    }
  }
};

const removeAllSubscriptions = (socket: WebSocket) => {
  const clientSubscriptions = subscriptions.get(socket);
  if (clientSubscriptions) {
    clientSubscriptions.forEach((_, subId) => {
      socket.send(JSON.stringify(["CLOSED", subId]));
    });
    subscriptions.delete(socket);
  }
  socket.send(JSON.stringify(["NOTICE", "all subscriptions removed"]));
};


export {subscriptions, parseRelayMessage, addSubscription, removeSubscription, removeAllSubscriptions};