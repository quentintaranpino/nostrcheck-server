import WebSocket from "ws";
import app from "../../app.js";
import { Event } from "nostr-tools";
import { logger } from "../logger.js";

const subscriptions: Map<WebSocket, Map<string, (event: Event) => void>> = new Map();

/**
 * Add a subscription to a client socket
 * @param subId Subscription ID
 * @param socket Client socket
 * @param listener Event listener
 */
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

/**
 * Remove a subscription from a client socket
 * @param subId Subscription ID
 * @param socket Client socket
 */
const removeSubscription = (subId?: string, socket?: WebSocket) => {
  
  if (!socket || !subscriptions.has(socket))    return;
  const clientSubscriptions = subscriptions.get(socket);
  if (!clientSubscriptions)   return;

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

/**
 * Remove all subscriptions from a client socket
 * @param socket Client socket
 * @param closeCode Close code for the socket
 */
const removeAllSubscriptions = (socket: WebSocket, closeCode = 1000) => {
  const clientSubscriptions = subscriptions.get(socket);
  if (clientSubscriptions) {
    clientSubscriptions.forEach((_, subId) => {
      socket.send(JSON.stringify(["CLOSED", subId, "Subscription forcibly closed"]));
      logger.debug(`removeAllSubscriptions - Subscription forcibly closed: ${subId}, IP:`, socket.url);
    });
    subscriptions.delete(socket);
  }
  logger.debug(`removeAllSubscriptions - All subscriptions forcibly closed`, {readyState: socket.readyState, url: socket.url});
  socket.close(closeCode, "All subscriptions removed");
};

export {subscriptions, addSubscription, removeSubscription, removeAllSubscriptions};