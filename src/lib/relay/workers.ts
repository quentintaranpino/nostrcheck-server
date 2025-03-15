import fastq, { queueAsPromised } from "fastq";
import { Event, Filter } from "nostr-tools";
import workerpool from "workerpool";
import path from "path";

import { logger } from "../logger.js";
import { CHUNK_SIZE, eventStore, MetadataEvent, RelayJob, SharedChunk } from "../../interfaces/relay.js";
import app from "../../app.js";
import { isModuleEnabled } from "../config.js";
import { deleteEvents, storeEvents } from "./database.js";
import { encodeChunk, getEventsByTimerange } from "./utils.js";

// Workers
const relayWorkers = Number(app.get("config.relay")["workers"]);
const workersDir = path.resolve('./dist/lib/relay/workers');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { _getEvents } from "./workers/getEvents.js";
import { sendMessage } from "../nostr/NIP04.js";
  
const relayWorker = async (task: RelayJob): Promise<unknown> => {
  try {
    logger.debug(`RelayWorker - Processing task: ${task.fn.name}`);
    const result = await task.fn(...(task.args || []));
    return result;
  } catch (error) {
    logger.error("relayWorker - Error processing task", error);
    return error;}
}

const isHeavyTask = (task: RelayJob): boolean => {
  if (task.fn.name !== 'handleReqOrCount') {
    return false;
  }
  const filters = task.args?.[2] as Filter[];
  if (!filters || !Array.isArray(filters)) return false;
  return filters.some(filter => {
    if (filter.authors && filter.authors.length > 20) return true;
    if (filter.search && filter.search.includes(':')) return true;
    if (filter.search && filter.limit && filter.limit > 500) return true;
    if (filter.search && (!filter.authors || filter.authors.length === 0) && filter.limit && filter.limit > 100) return true;
    
    const hasSpecificFilters = 
        (filter.authors && filter.authors.length > 0) || 
        (filter.ids && filter.ids.length > 0) ||
        (filter.limit && filter.limit < 5);
    
    if (!hasSpecificFilters && (!filter.kinds || filter.kinds.length > 5)) return true;
    
    if (!hasSpecificFilters) {
      const timeRange = (filter.until || Math.floor(Date.now() / 1000)) - (filter.since || 0);
      if (timeRange > 2592000) return true; 
    }
    
    return false;
  });
};

const enqueueRelayTask = async <T>(task: RelayJob): Promise<{enqueued: boolean; result: T | null;}> => {
  try {
      const heavyTask = isHeavyTask(task);
      // if (heavyTask) {
      //   sendMessage(JSON.stringify(task.args?.[2]), "npub138s5hey76qrnm2pmv7p8nnffhfddsm8sqzm285dyc0wy4f8a6qkqtzx624")
      // }
      const queueLength = getRelayQueueLength();
      if (queueLength > app.get("config.relay")["maxQueueLength"] && heavyTask) {
          logger.debug(`enqueueRelayTask - Relay queue limit reached: ${queueLength}`);
          return { enqueued: false, result: null };
      }

      const result = await (heavyTask ? relayQueueHeavyTask : relayQueue).push(task);
      logger.debug(`enqueueRelayTask - Task added to relay queue: ${task.fn.name}, queue length: ${queueLength}`);
      return { enqueued: true, result };
  } catch (error) {
      logger.error("enqueueRelayTask - Error processing task in relay queue", error);
      return { enqueued: false, result: null };
  }
};

const getRelayQueueLength = (): number => {
  return relayQueue.length() + relayQueueHeavyTask.length();
};

const getRelayQueueLightLength = (): number => {
  return relayQueue.length();
};

const getRelayQueueHeavyLength = (): number => {
  return relayQueueHeavyTask.length();
};

const relayQueue: queueAsPromised<RelayJob> = fastq.promise(relayWorker, Math.ceil(relayWorkers * 0.3));
const relayQueueHeavyTask: queueAsPromised<RelayJob> = fastq.promise(relayWorker, Math.ceil(relayWorkers * 0.7));

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

  const affectedChunks: SharedChunk[] = [];
  const unassignedEvents : MetadataEvent[] = [];

  const eventsToPersist = Array.from(eventStore.pending.values()) as MetadataEvent[];
  if (eventsToPersist.length > 0) {
    const insertedCount: number = await storeEvents(eventsToPersist);
      
    eventStore.sharedDBChunks.sort((a, b) => b.timeRange.max - a.timeRange.max);
    const newestChunk = eventStore.sharedDBChunks[0]

    // Process each event to assign to a shared memory chunk
    await Promise.all(eventsToPersist.map(async (event: Event) => {

      // Remove event from pending and set as processed on memoryDB
      const indexEntry = eventStore.eventIndex.get(event.id);
      if (indexEntry) indexEntry.processed = true;
      eventStore.pending.delete(event.id);

      // Try to assign event to a regular shared memory chunk
      let assigned = false;
      for (let i = 0; i < eventStore.sharedDBChunks.length; i++) {
        if (event.created_at >= eventStore.sharedDBChunks[i].timeRange.min && event.created_at <= eventStore.sharedDBChunks[i].timeRange.max) {
          affectedChunks.push(eventStore.sharedDBChunks[i]);
          assigned = true;
          break;
        }
      }

      // Try to assign event to the last chunk if it's not full
      if (!assigned && event.created_at >= newestChunk.timeRange.min && newestChunk.indexMap.length < CHUNK_SIZE) {
        newestChunk.timeRange.max = event.created_at;
        affectedChunks.push(newestChunk);
        assigned = true;
      }

      // If event was not assigned, add it to the unassigned list
      if (!assigned) {
        unassignedEvents.push(event);
      }

    }));

    // Update affected chunks with new events
    await Promise.all(affectedChunks.map(async (chunk) => {
      const newChunkEvents = await getEventsByTimerange(
        chunk.timeRange.min, 
        chunk.timeRange.max, 
        eventStore, 
        entry => entry.processed === true
      );
      if (newChunkEvents.length > 0) {
        const affectedChunk = await encodeChunk(newChunkEvents);
        const idx = eventStore.sharedDBChunks.findIndex((c) => c === chunk);
        if (idx !== -1) {
          
          eventStore.sharedDBChunks[idx] = affectedChunk;

          // Update event index with new chunk and position
          for (let position = 0; position < newChunkEvents.length; position++) {
            const event = newChunkEvents[position];
            const entry = eventStore.eventIndex.get(event.id);
            if (entry) {
              entry.chunkIndex = idx;
              entry.position = position;
              entry.processed = true;
            }
          }
        }
      }
    }));

    // Create new chunk(s) for unassigned events
    if (unassignedEvents.length > 0) {
      unassignedEvents.sort((a, b) => b.created_at - a.created_at);
      const newChunk = await encodeChunk(unassignedEvents);
      const newChunkIndex = eventStore.sharedDBChunks.length;
      eventStore.sharedDBChunks.push(newChunk);
      for (let position = 0; position < unassignedEvents.length; position++) {
        const event = unassignedEvents[position];
        const entry = eventStore.eventIndex.get(event.id);
        if (entry) {
          entry.chunkIndex = newChunkIndex;
          entry.position = position;
          entry.processed = true; 

        }
      }
      eventStore.sharedDBChunks.sort((a, b) => b.timeRange.max - a.timeRange.max);
    }

    if (insertedCount !== eventsToPersist.length) {
      logger.debug(`persistEvents - ${insertedCount} new events inserted, ${eventsToPersist.length - insertedCount} duplicates or ignored`);
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
  
    const eventsToDelete: MetadataEvent[] = Array.from(eventStore.pendingDelete.values())
    .map((e: MetadataEvent) => e);

    const expiredEvents: MetadataEvent[] = [];

    // NIP-09 or NIP-62 deletion
    if (eventsToDelete.length > 0) {
      const deletedCount: number = await deleteEvents(eventsToDelete, true);
      if (deletedCount !== eventsToDelete.length) logger.error(`relayController - Interval - Failed to delete events: ${eventsToDelete.length - deletedCount}`);
    }
    
    // NIP-40 inactivation
    const now = Math.floor(Date.now() / 1000);
    const allEvents = await getEventsByTimerange(0, now, eventStore);
    for (const event of allEvents) {
      const expirationTag = event.tags.find(tag => tag[0] === "expiration");
      if (expirationTag && Number(expirationTag[1]) < now) {
        expiredEvents.push(event);
      }
    }
  
    for (const expiredEvent of expiredEvents) {
      const success = await deleteEvents([expiredEvent], false, "event expired (NIP-40)");
      if (!success) {
        logger.error(`relayController - Interval - Failed to set event ${expiredEvent.id} as inactive`);
        continue;
      }
      logger.debug(`relayController - Interval - Set event ${expiredEvent.id} as inactive successfully`);
    }

    // Join eventsToDelete and expiredEvents
    eventsToDelete.push(...expiredEvents);

    if (eventsToDelete.length === 0) return;

    // Recreate expired and deleted events chunks
    for (const chunk of eventStore.sharedDBChunks) {
      if (chunk.timeRange.max < Math.min(...eventsToDelete.map(e => e.created_at)) || chunk.timeRange.min > Math.max(...eventsToDelete.map(e => e.created_at))) continue;
      const chunkEvents = await getEventsByTimerange(chunk.timeRange.min, chunk.timeRange.max, eventStore);
      const newEvents = chunkEvents.filter((e) => !eventsToDelete.find((d) => d.id === e.id));
      const newChunk = await encodeChunk(newEvents);
      const idx = eventStore.sharedDBChunks.findIndex((c) => c === chunk);
      if (idx !== -1) {
        eventStore.sharedDBChunks[idx] = newChunk;
      }
    }
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

  if (!eventStore || !isModuleEnabled("relay", app)) {
    return;
  }

  if (getRelayQueueLength() == 0) {
      await enqueueRelayTask({ fn: async () => {
          await persistEvents();
          await unpersistEvents();
          // await updateEventsMetadata();
      }});
  }
  setTimeout(workerInterval, 1 * 30 * 1000); // 30 seconds
};

workerInterval();

// GetEvents worker
const getEventsWorker = workerpool.pool(path.join(workersDir,  'getEvents.js'), { maxWorkers: relayWorkers });
const getEvents = async (filters: any, maxLimit: number, chunks: SharedChunk[]): Promise<any> => {
  try {
    return await getEventsWorker.exec("_getEvents", [
      JSON.parse(JSON.stringify(filters)),
      maxLimit,
      chunks
    ]);
  } catch (error) {
    logger.error(`getEventsWorker - Error: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
};

export { getRelayQueueLength, getRelayQueueLightLength, getRelayQueueHeavyLength, enqueueRelayTask, relayWorkers, getEvents };
