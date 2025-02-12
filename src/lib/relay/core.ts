import WebSocket from "ws";
import { NIP01_event } from "../../interfaces/nostr.js";
import app from "../../app.js";
import { Event } from "nostr-tools";
import { logger } from "../logger.js";

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

  const max_subscriptions = app.get("config.relay")["limitation"]["max_subscriptions"];
  if (clientSubscriptions.size >= max_subscriptions) {
    logger.debug(`addSubscription - Subscription limit reached: ${max_subscriptions} | IP:`, socket.url);
    socket.send(JSON.stringify(["NOTICE", "error: subscription limit reached"]));
    return;
  }

  clientSubscriptions.set(subId, listener);

};

const removeSubscription = (subId?: string, socket?: WebSocket) => {
  if (!socket || !subscriptions.has(socket)) {
      return;
  }

  const clientSubscriptions = subscriptions.get(socket);
  if (!clientSubscriptions) {
      return;
  }

  try {
      if (subId) {
        if (clientSubscriptions.has(subId)) {
          clientSubscriptions.delete(subId);
          logger.debug(`removeSubscription - Subscription closed: ${subId}`);
        }

        if (clientSubscriptions.size === 0) {
          subscriptions.delete(socket);
        }
      } else {
        clientSubscriptions.forEach((_, id) => {
          logger.debug(`removeSubscription - Subscription closed: ${id}`);
          socket.send(JSON.stringify(["CLOSED", id, "Connection closed"]));
        });
        subscriptions.delete(socket);
      }
  } catch (error) {
      logger.error(`removeSubscription - Error closing subscriptions: ${subId} with error: ${error}`);
  }
};

const removeAllSubscriptions = (socket: WebSocket) => {
  const clientSubscriptions = subscriptions.get(socket);
  if (clientSubscriptions) {
    clientSubscriptions.forEach((_, subId) => {
      socket.send(JSON.stringify(["CLOSED", subId, "Subscription forcibly closed"]));
      logger.debug("Subscription forcibly closed:", subId);
      logger.debug(`removeAllSubscriptions - Subscription forcibly closed: ${subId}, IP:`, socket.url);
    });
    subscriptions.delete(socket);
  }
  logger.debug(`removeAllSubscriptions - All subscriptions forcibly closed`, {readyState: socket.readyState, url: socket.url});
};

export {subscriptions, parseRelayMessage, addSubscription, removeSubscription, removeAllSubscriptions};