import fastq, { queueAsPromised } from "fastq";
import { logger } from "../logger.js";
import { RelayEvents, RelayJob } from "../../interfaces/relay.js";
import app from "../../app.js";
import { isModuleEnabled } from "../config.js";
import { deleteEvents, storeEvents } from "./database.js";
import { Event } from "nostr-tools";


const relayWorker = async (task: RelayJob): Promise<unknown> => {
  try {
    logger.info(`RelayWorker - Processing task: ${task.fn.name}`);
    const result = await task.fn(...(task.args || []));
    return result;
  } catch (error) {
    logger.error("genericWorker - Error processing task", error);
    return error;}
}

const enqueueRelayTask = async (task: RelayJob): Promise<boolean> => {
    try {
        const queueLength = getRelayQueueLength();
        if (queueLength > app.get("config.relay")["maxQueueLength"]) {
            logger.debug(`enqueueRelayTask - Relay queue limit reached: ${queueLength}`);
            return false;
        }
        relayQueue.push(task);
        logger.debug(`enqueueRelayTask - Task added to relay queue: ${task.fn.name}, queue length: ${queueLength}`);
        return true;
    }catch (error) {
        logger.error("enqueueRelayTask - Error processing task in relay queue", error);
        return false;
    }
}

const getRelayQueueLength = () : number => {
    return relayQueue.length();
}

const relayWorkers = app.get("config.relay")["workers"]
const relayQueue: queueAsPromised<RelayJob> = fastq.promise(relayWorker, relayWorkers);


/**
 * Persist events to the database
 */
const persistEvents = async () => {

    if (!isModuleEnabled("relay", app)) return;
    if (!app.get("relayEventsLoaded")) return;
  
    const relayEvents = app.get("relayEvents") as RelayEvents;
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
}   


/**
 * Unpersist events from the memoryDB
 * - NIP-09 or NIP-62 deletion
 * - NIP-40 inactivation
 */
const unpersistEvents = async () => {

    if (!isModuleEnabled("relay", app)) return;
    if (!app.get("relayEventsLoaded")) return;
  
    const relayEvents = app.get("relayEvents") as RelayEvents;
  
    if (!relayEvents || !relayEvents.pendingDelete) return;
  
    // NIP-09 or NIP-62 deletion
    if (relayEvents.pendingDelete.size > 0) {
      const eventsToDelete: Event[] = Array.from((relayEvents as RelayEvents).pendingDelete.values())
        .map((e: Event) => e);
  
      if (eventsToDelete.length > 0) {
        const deletedCount: number = await deleteEvents(eventsToDelete, true);
        if (deletedCount !== eventsToDelete.length) logger.error(`relayController - Interval - Failed to delete events: ${eventsToDelete.length - deletedCount}`);
      }
    }
  
    // NIP-40 inactivation
    const now = Math.floor(Date.now() / 1000);
    const expiredEvents = [];
    for (const [eventId, memoryEvent] of relayEvents.memoryDB.entries()) {
      const expirationTag = memoryEvent.event.tags.find(tag => tag[0] === "expiration");
      if (expirationTag && Number(expirationTag[1]) < now) {
        expiredEvents.push(memoryEvent.event);
      }
    }
  
    expiredEvents.forEach(async (expiredEvent) => {
      const success = await deleteEvents([expiredEvent], false, "event expired (NIP-40)");
      if (!success) {
        logger.error(`relayController - Interval - Failed to set event ${expiredEvent.id} as inactive`);
        return;
      }
      logger.debug(`relayController - Interval - Set event ${expiredEvent.id} as inactive successfully`);
    });

}

// interval to persist and unpersist events
const workerInterval = async () => {
  if (getRelayQueueLength() > 0) {
      logger.warn(`workerInterval - Relay queue not empty: ${getRelayQueueLength()}, skipping`);
  } else {
      await enqueueRelayTask({ fn: async () => {
          await persistEvents();
          await unpersistEvents();
      }});
  }
  setTimeout(workerInterval, 60 * 1000);
};

workerInterval();
  
export { getRelayQueueLength, enqueueRelayTask, relayWorkers };