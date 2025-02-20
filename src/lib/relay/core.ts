import WebSocket from "ws";
import app from "../../app.js";
import { Event } from "nostr-tools";
import { logger } from "../logger.js";
import { isModuleEnabled } from "../config.js";
import { dbMultiSelect, dbUpdate } from "../database.js";
import { deleteEvents, storeEvents } from "./database.js";

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

/*
* Periodically persist events to the database
*/
setInterval(async () => {

  if (!isModuleEnabled("relay", app)) return;
  if (!app.get("relayEventsLoaded")) return;

  const relayEvents = app.get("relayEvents");
  if (!relayEvents || !relayEvents.pending) return;
  if (relayEvents.pending.size === 0) return;

  const eventsToPersist = Array.from(relayEvents.pending.values()) as Event[];
  if (eventsToPersist.length > 0) {
    const insertedCount: number = await storeEvents(eventsToPersist);
    if (insertedCount > 0) {
      eventsToPersist.forEach((event: Event) => {
        const eventEntry = relayEvents.memoryDB.get(event.id);
        if (eventEntry) eventEntry.processed = true;
        relayEvents.pending.delete(event.id);
      });
    } else {
      eventsToPersist.forEach((event: Event) => {
        logger.error(`relayController - Interval - StoreEvents failed for event: ${event.id}`);
      });
    }
  }
}, 30 * 1000);

/*
* Periodically inactive events from the database (kind 5, NIP-09), delete events from database (kind 62, NIP-62)
*/
setInterval(async () => {

  if (!isModuleEnabled("relay", app)) return;
  if (!app.get("relayEventsLoaded")) return;

  const relayEvents = app.get("relayEvents");

  // NIP-09 inactivation
  if (!relayEvents || !relayEvents.pendingInactive) return;
  if (relayEvents.pendingInactive.size === 0) return;

  const eventsToInactive = Array.from(relayEvents.pendingInactive.values()) as Event[];
  if (eventsToInactive.length > 0) {
    const inactivedCount: number = await deleteEvents(eventsToInactive, false, "NIP-09 inactivation");
    if (inactivedCount != eventsToInactive.length){
        logger.error(`relayController - Interval - Failed to inactive events: ${eventsToInactive.length - inactivedCount}`);
    }
  }

  // NIP-62 deletion
  if (!relayEvents.pendingDelete) return;
  if (relayEvents.pendingDelete.size === 0) return;

  const eventsToDelete = Array.from(relayEvents.pendingDelete.values()) as Event[];
  if (eventsToDelete.length > 0) {
    const deletedCount: number = await deleteEvents(eventsToDelete, true, "NIP-62 deletion");
    if (deletedCount != eventsToDelete.length){
        logger.error(`relayController - Interval - Failed to delete events: ${eventsToDelete.length - deletedCount}`);
    }
  }

}, 30 * 1000);

/*
* Periodically set active = '0' for events with expiration tag in the past (NIP-40)
*/
setInterval(async () => {

  if (!isModuleEnabled("relay", app)) return;

  const tags = await dbMultiSelect(["event_id", "tag_name", "tag_value"],"eventtags","tag_name = ? AND tag_value < ?", ["expiration", Math.floor(Date.now() / 1000)], false);
  const expiredEvents = await dbMultiSelect(["event_id", "kind"],"events","active = 1 AND event_id IN ('" + tags.map(tag => tag.event_id).join("','") + "')", [], false);
  if (expiredEvents.length > 0){
    for (const expiredEvent of expiredEvents) {
      let eventUpdate = await dbUpdate("events", {"active": "0"}, ["event_id"], [expiredEvent.event_id]);
      eventUpdate = await dbUpdate("events", {"comments" : "event expired"}, ["event_id"], [expiredEvent.event_id]);
      if (!eventUpdate) {
        logger.error(`relayController - Interval - Failed to set event ${expiredEvent.event_id} as inactive`);
        continue;
      }
      const events = app.get("relayEvents");
      events.memoryDB.delete(expiredEvent.event_id);
      const index: number = events.sortedArray.findIndex((e: Event) => e.id === expiredEvent.event_id);
      if (index !== -1)   events.sortedArray.splice(index, 1);
      logger.debug(`relayController - Interval - Set event ${expiredEvent.event_id} as inactive successfully`);
    }
  }
}, 30 * 1000); // 1 minutes

export {subscriptions, addSubscription, removeSubscription, removeAllSubscriptions};