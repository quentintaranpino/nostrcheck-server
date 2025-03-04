import fastq, { queueAsPromised } from "fastq";
import { Event } from "nostr-tools";
import workerpool from "workerpool";
import path from "path";

import { logger } from "../logger.js";
import { CHUNK_SIZE, eventStore, MetadataEvent, RelayJob, SharedChunk } from "../../interfaces/relay.js";
import app from "../../app.js";
import { isModuleEnabled } from "../config.js";
import { deleteEvents, storeEvents } from "./database.js";
import { initializeSharedEvents } from "./utils.js";

// Workers
const relayWorkers = Number(app.get("config.relay")["workers"]);
const workersDir = path.resolve('./dist/lib/relay/workers');
import { _getEvents } from "./workers/getEvents.js";

const relayWorker = async (task: RelayJob): Promise<unknown> => {
  try {
    logger.info(`RelayWorker - Processing task: ${task.fn.name}`);
    const result = await task.fn(...(task.args || []));
    return result;
  } catch (error) {
    logger.error("relayWorker - Error processing task", error);
    return error;}
}

const enqueueRelayTask = async <T>(task: RelayJob): Promise<{enqueued: boolean; result: T | null;}> => {
  try {
      const queueLength = getRelayQueueLength();
      if (queueLength > app.get("config.relay")["maxQueueLength"]) {
          logger.debug(`enqueueRelayTask - Relay queue limit reached: ${queueLength}`);
          return { enqueued: false, result: null };
      }
      const result = await relayQueue.push(task);
      logger.debug(`enqueueRelayTask - Task added to relay queue: ${task.fn.name}, queue length: ${queueLength}`);
      return { enqueued: true, result };
  } catch (error) {
      logger.error("enqueueRelayTask - Error processing task in relay queue", error);
      return { enqueued: false, result: null };
  }
};

const getRelayQueueLength = () : number => {return relayQueue.length()};

const relayQueue: queueAsPromised<RelayJob> = fastq.promise(relayWorker, relayWorkers);

/**
 * Persist events to the database and update shared memory chunks.
 * New events are assigned to an existing chunk based on their created_at.
 * If no matching chunk is found for a new event, a new chunk is created.
 * This new chunk covers from the minimum created_at of the new events up to "now".
 */
/**
 * Persist events to the database and update shared memory chunks.
 * New events are assigned to an existing chunk based on their created_at.
 * For the newest chunk (index 0), events with a timestamp greater than the current max
 * are also assigned there, causing the chunk's max range to update.
 * Events that don't match any chunk are used to create new chunk(s) of size CHUNK_SIZE.
 */
const persistEvents = async () => {
  if (
    !isModuleEnabled("relay", app) ||
    !eventStore ||
    !eventStore.pending ||
    !eventStore.relayEventsLoaded ||
    eventStore.pending.size === 0
  ) {
    return;
  }
  // Convert pending events to an array (MetadataEvent)
  const eventsToPersist = Array.from(eventStore.pending.values()) as MetadataEvent[];

  if (eventsToPersist.length > 0) {
    const insertedCount: number = await storeEvents(eventsToPersist);
    if (insertedCount > 0) {
      // Mark persisted events as processed and remove them from pending
      eventsToPersist.forEach((event: Event) => {
        const eventEntry = eventStore.memoryDB.get(event.id);
        if (eventEntry) eventEntry.processed = true;
        eventStore.pending.delete(event.id);
      });

      // Mapping from chunk index to new events that belong to that chunk.
      const chunkUpdates: Map<number, MetadataEvent[]> = new Map();
      // Array for new events that do not fit in any existing chunk.
      const unassigned: MetadataEvent[] = [];

      // For each new event, try to assign it to an existing chunk based on its created_at.
      eventsToPersist.forEach((event: Event) => {
        let assigned = false;
        eventStore.sharedDBChunks.forEach((chunk, idx) => {
          if (idx === 0) {
            // For the newest chunk, allow events even if they are newer than its current max.
            if (event.created_at >= chunk.timeRange.min) {
              // Asignar el evento al chunk 0.
              const arr = chunkUpdates.get(idx) || [];
              arr.push(event);
              chunkUpdates.set(idx, arr);
              assigned = true;
            }
          } else {
            // For other chunks, normal assignment: event.created_at must fall within the chunk range.
            if (event.created_at >= chunk.timeRange.min && event.created_at <= chunk.timeRange.max) {
              const arr = chunkUpdates.get(idx) || [];
              arr.push(event);
              chunkUpdates.set(idx, arr);
              assigned = true;
            }
          }
        });
        if (!assigned) {
          unassigned.push(event);
        }
      });

      // For each chunk that has new events, update that chunk.
      chunkUpdates.forEach((_newEvents, chunkIdx) => {
        // Rebuild the chunk from all events in memoryDB that fall in its (possibly extended) range.
        const newChunkEvents = Array.from(eventStore.memoryDB.values())
          .map(me => me.event)
          .filter(e => {
            // For chunk 0, extend the range to include events newer than the current max.
            if (chunkIdx === 0) {
              return e.created_at >= eventStore.sharedDBChunks[0].timeRange.min;
            } else {
              return e.created_at >= eventStore.sharedDBChunks[chunkIdx].timeRange.min &&
                     e.created_at <= eventStore.sharedDBChunks[chunkIdx].timeRange.max;
            }
          });
        if (newChunkEvents.length > 0) {
          // Sort events in descending order by created_at.
          newChunkEvents.sort((a, b) => b.created_at - a.created_at);
          // Rebuild shared memory for this chunk.
          const { buffer, indexMap } = initializeSharedEvents(newChunkEvents);
          const newTimeRange = {
            max: newChunkEvents[0].created_at,
            min: newChunkEvents[newChunkEvents.length - 1].created_at,
          };
          eventStore.sharedDBChunks[chunkIdx] = { buffer, indexMap, timeRange: newTimeRange };
        }
      });

      // Process unassigned events: create new chunk(s) using only unassigned events.
      if (unassigned.length > 0) {
        // Sort unassigned events in descending order by created_at.
        unassigned.sort((a, b) => b.created_at - a.created_at);
        for (let i = 0; i < unassigned.length; i += CHUNK_SIZE) {
          const chunkBatch = unassigned.slice(i, i + CHUNK_SIZE);
          // Ensure the batch is sorted descending.
          chunkBatch.sort((a, b) => b.created_at - a.created_at);
          const { buffer, indexMap } = initializeSharedEvents(chunkBatch);
          const newTimeRange = {
            max: chunkBatch[0].created_at,
            min: chunkBatch[chunkBatch.length - 1].created_at,
          };
          const newChunk = { buffer, indexMap, timeRange: newTimeRange };
          eventStore.sharedDBChunks.push(newChunk);
        }
        // Optionally, sort the chunks by timeRange.max descending.
        eventStore.sharedDBChunks.sort((a, b) => b.timeRange.max - a.timeRange.max);
      }
    } else {
      // If storing failed, log an error for each event.
      eventsToPersist.forEach((event: Event) => {
        logger.error(`relayController - Interval - StoreEvents failed for event: ${event.id}`);
      });
    }
  }
};



/**
 * Unpersist events from the memoryDB
 * - NIP-09 or NIP-62 deletion
 * - NIP-40 inactivation
 */
const unpersistEvents = async () => {

    if (!isModuleEnabled("relay", app)) return;
    if (!eventStore || !eventStore.pendingDelete || !eventStore.relayEventsLoaded) return;
  
    // NIP-09 or NIP-62 deletion
    if (eventStore.pendingDelete.size > 0) {
      const eventsToDelete: Event[] = Array.from(eventStore.pendingDelete.values())
        .map((e: MetadataEvent) => e);
  
      if (eventsToDelete.length > 0) {
        const deletedCount: number = await deleteEvents(eventsToDelete, true);
        if (deletedCount !== eventsToDelete.length) logger.error(`relayController - Interval - Failed to delete events: ${eventsToDelete.length - deletedCount}`);
      }
    }
  
    // NIP-40 inactivation
    const now = Math.floor(Date.now() / 1000);
    const expiredEvents = [];
    for (const [eventId, memoryEvent] of eventStore.memoryDB.entries()) {
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


// const updateEventsMetadata = async () => {
//   if (!isModuleEnabled("relay", app)) return;
//   if (!app.get("relayEventsLoaded")) return;

//   const relayEvents = app.get("relayEvents") as RelayEvents;
//   if (!relayEvents) return;

//   const dbEvents = await dbMultiSelect(
//     ["id", "event_id"],
//     "events",
//     "event_id is not null",
//     [""],
//     false
//   );
//   const dbEventsIds = dbEvents.map((e: { event_id: string }) => e.event_id);

//   logger.debug(dbEventsIds);

//   const metadataPromises = dbEventsIds.map(async (e) => {
//     const memEvent = relayEvents.memoryDB.get(e);
//     if (!memEvent) return [];
//     const metadata = await parseEventMetadata(memEvent.event);
//     return metadata;
//   });

//   const metadataResults = await Promise.all(metadataPromises);
//   const allMetadataValues: Array<[string, string, string, number, string | null, string]> = [];
//   metadataResults.forEach((metadata) => {
//     metadata.forEach((tuple) => {
//       allMetadataValues.push(tuple);
//     });
//   });

//   if (allMetadataValues.length > 0) {
//     for (const value of allMetadataValues) {
//       await dbUpsert(
//         "eventmetadata",
//         {
//           event_id: value[0],
//           metadata_type: value[1],
//           metadata_value: value[2],
//           position: value[3],
//           extra_data: value[4],
//           created_at: value[5],
//         },
//         ["event_id", "metadata_type", "position"]
//       );
//     }
//   }
  
// };

// interval to persist and unpersist events
const workerInterval = async () => {
  if (getRelayQueueLength() == 0) {
      await enqueueRelayTask({ fn: async () => {
          await persistEvents();
          await unpersistEvents();
          // await updateEventsMetadata();
      }});
  }
  setTimeout(workerInterval, 10 * 1000);
};

workerInterval();

// GetEvents worker
const getEventsWorker = workerpool.pool(path.join(workersDir,  'getEvents.js'), { maxWorkers: relayWorkers });
async function getEvents(filters: any, maxLimit: number, chunks: SharedChunk[]): Promise<any> {
  try {
    const result = await getEventsWorker.exec("_getEvents", [
      JSON.parse(JSON.stringify(filters)),
      maxLimit,
      chunks
    ]);
    return result;
  } catch (error) {
    console.error(`getEventsWorker - Error: ${error}`);
    return [];
  }
}
  
export { getRelayQueueLength, enqueueRelayTask, relayWorkers, getEvents };
