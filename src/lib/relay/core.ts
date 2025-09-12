import WebSocket from "ws";

import { logger } from "../logger.js";
import { ExtendedWebSocket, MetadataEvent } from "../../interfaces/relay.js";
import { getConfig } from "../config/core.js";

const subscriptions: Map<ExtendedWebSocket, Map<string, (event: MetadataEvent) => void>> = new Map();

/**
 * Add a subscription to a client socket
 * @param subId Subscription ID
 * @param socket Client socket
 * @param listener Event listener
 */
const addSubscription = (subId: string, socket: ExtendedWebSocket, listener: (event: MetadataEvent) => void) => {
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

  const max_subscriptions = getConfig(socket.reqInfo.domain,["relay","limitation","max_subscriptions"]);
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
const removeSubscription = (subId?: string, socket?: ExtendedWebSocket) => {
  
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
const removeAllSubscriptions = (socket: ExtendedWebSocket, closeCode = 1000): void => {
  const clientSubs = subscriptions.get(socket);
  if (clientSubs) {
    clientSubs.forEach((_, subId) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(["CLOSED", subId, "Subscription forcibly closed"]));
      }
      logger.debug(`removeAllSubscriptions – sub ${subId} closed, IP: ${socket.reqInfo.ip}`);
    });
    subscriptions.delete(socket);
  }

  logger.debug("removeAllSubscriptions – all subs closed", {
    readyState: socket.readyState,
    ip        : socket.reqInfo.ip,
  });

  if (socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
    socket.close(closeCode, "All subscriptions removed");
  }
};

/**
 * Safely send a message to a WebSocket, ensuring the socket is open and not overloaded.
 * @param ws The WebSocket to send the message to.
 * @param payload The message payload to send.
 * @param highWaterMark The maximum buffered amount before pausing sends (default: 1MB).
 * @returns A promise that resolves to true if the message was sent successfully, false otherwise.
 */
const socketSafeSend = async (ws: ExtendedWebSocket, payload: any, highWaterMark = 1 << 20): Promise<boolean> => {

  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  if (ws.readyState !== WebSocket.OPEN) return false;

  while (ws.bufferedAmount > highWaterMark) {
    if (ws.readyState !== WebSocket.OPEN) return false;
    await sleep(8);
  }

  const data = typeof payload === "string" ? payload : JSON.stringify(payload);

  return new Promise<boolean>(resolve => {
    ws.send(data, (err?: Error) => resolve(!err));
  });
}

export {subscriptions, addSubscription, removeSubscription, removeAllSubscriptions, socketSafeSend};