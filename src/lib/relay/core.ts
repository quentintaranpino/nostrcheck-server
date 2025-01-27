import WebSocket from "ws";
import { NIP01_event } from "../../interfaces/nostr.js";
import app from "../../app.js";
import { Event } from "nostr-tools";

const parseRelayMessage = (data: WebSocket.RawData): ReturnType<typeof NIP01_event.safeParse>["data"] | null => {
  try {
    const message = JSON.parse(data.toString());
    const result = NIP01_event.safeParse(message);
    return result.success ? result.data : null;
  } catch {
    return null; 
  }
};

const subscriptions: Map<WebSocket, Map<string, (event: Event) => void>> = new Map();

const addSubscription = (subId: string, socket: WebSocket, listener: (event: Event) => void) => {
  if (!subscriptions.has(socket)) {
    subscriptions.set(socket, new Map());
  }

  const clientSubscriptions = subscriptions.get(socket);
  if (!clientSubscriptions) {
    return;
  }

  if (clientSubscriptions.has(subId)) {
    clientSubscriptions.delete(subId);
  }

  const maxSubs = app.get("config.security")["relay"]["maxSocketSubscriptions"];
  if (clientSubscriptions.size >= maxSubs) {
    socket.send(JSON.stringify(["NOTICE", "error: subscription limit reached"]));
    return;
  }

  clientSubscriptions.set(subId, listener);

};

const removeSubscription = (subId?: string, socket?: WebSocket) => {
  if (!socket || !subscriptions.has(socket)) return;

    const clientSubscriptions = subscriptions.get(socket);
    if (!clientSubscriptions) return;

    if (subId && clientSubscriptions.has(subId)) {
      clientSubscriptions.delete(subId);
      socket.send(JSON.stringify(["CLOSED", subId, "Subscription forcibly closed"]));
    }

    if (!subId || (clientSubscriptions && clientSubscriptions.size === 0)) {
      if (!subId) {
        clientSubscriptions.forEach((_, id) => {
          socket.send(JSON.stringify(["CLOSED", id, "Subscription forcibly closed"]));
        });
      }
      subscriptions.delete(socket);
    }
};

const removeAllSubscriptions = (socket: WebSocket) => {
  const clientSubscriptions = subscriptions.get(socket);
  if (clientSubscriptions) {
    clientSubscriptions.forEach((_, subId) => {
      socket.send(JSON.stringify(["CLOSED", subId, "All subscriptions forcibly closed"]));
    });
    subscriptions.delete(socket);
  }
  socket.send(JSON.stringify(["NOTICE", "All subscriptions forcibly closed"]));
};

export {subscriptions, parseRelayMessage, addSubscription, removeSubscription, removeAllSubscriptions};