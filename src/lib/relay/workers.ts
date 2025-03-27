import fastq, { queueAsPromised } from "fastq";
import { Filter } from "nostr-tools";
import workerpool from "workerpool";
import path from "path";

import { logger } from "../logger.js";
import { CHUNK_SIZE, eventStore, MetadataEvent, PendingGetEventsTask, RelayJob, SharedChunk } from "../../interfaces/relay.js";
import app from "../../app.js";
import { isModuleEnabled } from "../config.js";
import { deleteEvents, storeEvents } from "./database.js";
import { decodeChunk, dynamicTimeout, encodeChunk, getEventById, updateChunk } from "./utils.js";
import { RedisConfig } from "../../interfaces/redis.js";

const redisConfig : RedisConfig= {
  host: app.get("config.redis")["host"],
  port: app.get("config.redis")["port"],
  user: app.get("config.redis")["user"],
  password: app.get("config.redis")["password"],
  defaultDB: 2 // database "2" for relay DB
};

// Workers
const relayWorkers = Number(app.get("config.relay")["workers"]);
const workersDir = path.resolve('./dist/lib/relay/workers');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { _getEvents } from "./workers/getEvents.js";
  
const relayWorker = async (task: RelayJob): Promise<unknown> => {
  try {
    logger.debug(`RelayWorker - Processing task: ${task.fn.name}`);
    const result = await task.fn(...(task.args || []));
    return result;
  } catch (error) {
    logger.error("relayWorker - Error processing task", error);
    return error;}
}

function isHeavyFilter(filters: Filter[]): boolean {
  if (!filters || !Array.isArray(filters)) return false;

  return filters.some(filter => {
    if (filter.authors && filter.authors.length > 30) return true;
    if (filter.search && filter.search.includes(':')) return true;
    if (filter.search && filter.limit && filter.limit > 500) return true;
    if (
      filter.search &&
      (!filter.authors || filter.authors.length === 0) &&
      filter.limit &&
      filter.limit > 150
    )
      return true;

    const hasSpecificFilters =
      (filter.authors && filter.authors.length > 0) ||
      (filter.ids && filter.ids.length > 0) ||
      (filter.limit && filter.limit < 5);

    if (!hasSpecificFilters && (!filter.kinds || filter.kinds.length > 10)) return true;

    if (!hasSpecificFilters) {
      const timeRange =
        (filter.until || Math.floor(Date.now() / 1000)) - (filter.since || 0);
      if (timeRange > 2592000) return true;
    }

    return false;
  });
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

const getRelayQueueLength = (): number => {
  return relayQueue.length();
};

const getRelayLightWorkerLength = (): number => {
  return lightGetEventsPool.stats().pendingTasks;
}

const getRelayHeavyWorkerLength = (): number => {
  return heavyGetEventsPool.stats().pendingTasks;
}

const relayQueue: queueAsPromised<RelayJob> = fastq.promise(relayWorker, Math.ceil(relayWorkers));

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
    const newestChunk = eventStore.sharedDBChunks[0];

    for (const event of eventsToPersist) {
      await new Promise(resolve => setImmediate(resolve));
      const indexEntry = eventStore.eventIndex.get(event.id);
      if (indexEntry) indexEntry.processed = true;
      eventStore.pending.delete(event.id);

      let assigned = false;
      for (const chunk of eventStore.sharedDBChunks) {
        await new Promise(resolve => setImmediate(resolve));
        if (
          event.created_at >= chunk.timeRange.min &&
          event.created_at <= chunk.timeRange.max
        ) {
          affectedChunks.push(chunk);
          assigned = true;
          break;
        }
        
      }

      if (!assigned && event.created_at >= newestChunk.timeRange.min && newestChunk.indexMap.length < CHUNK_SIZE) {
        newestChunk.timeRange.max = event.created_at;
        affectedChunks.push(newestChunk);
        assigned = true;
      }

      if (!assigned) {
        unassignedEvents.push(event);
      }
    }

    for (const chunk of affectedChunks) {
      await new Promise(resolve => setImmediate(resolve));
      const newChunkEvents = eventsToPersist.filter(
        event => event.created_at >= chunk.timeRange.min && event.created_at <= chunk.timeRange.max
      );
    
      if (newChunkEvents.length > 0) {
        const updatedChunk = await updateChunk(chunk, newChunkEvents, "add");
        const idx = eventStore.sharedDBChunks.findIndex(c => c === chunk);
        if (idx !== -1) {
          eventStore.sharedDBChunks[idx] = updatedChunk;
    
          const updatedEvents = await decodeChunk(updatedChunk);
          for (let position = 0; position < updatedEvents.length; position++) {
            const event = updatedEvents[position];
            const entry = eventStore.eventIndex.get(event.id);
            if (entry) {
              entry.chunkIndex = idx;
              entry.position = position;
              entry.processed = true;
            }
          }
        }
      }
    }

    if (unassignedEvents.length > 0) {
      await new Promise(resolve => setImmediate(resolve));
      unassignedEvents.sort((a, b) => b.created_at - a.created_at);
      const newChunk = await encodeChunk(unassignedEvents);
      const newChunkIndex = eventStore.sharedDBChunks.length;
      for (let position = 0; position < unassignedEvents.length; position++) {
        await new Promise(resolve => setImmediate(resolve));
        const event = unassignedEvents[position];
        const entry = eventStore.eventIndex.get(event.id);
        if (entry) {
          entry.chunkIndex = newChunkIndex;
          entry.position = position;
          entry.processed = true;
        }
      }
      eventStore.sharedDBChunks.push(newChunk);
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

  const now = Math.floor(Date.now() / 1000);
  const eventsToProcess: { event: MetadataEvent, isExpirable: boolean }[] = [];

  // NIP-09 or NIP-62 events
  for (const event of eventStore.pendingDelete.values()) {
    eventsToProcess.push({ event, isExpirable: false });
  }

  // NIP-40 inactivation events
  for (const id of eventStore.globalExpirable) {
    const indexEntry = eventStore.eventIndex.get(id);
    if (indexEntry?.expiration !== undefined && indexEntry.expiration < now) {
      const event = await getEventById(id, eventStore);
      if (event) {
        eventsToProcess.push({ event, isExpirable: true });
      }
    }
  }

  // Delete events from the database and eventStore
  for (const { event, isExpirable } of eventsToProcess) {
    const success = await deleteEvents(event, !isExpirable, isExpirable ? "event expired (NIP-40)" : "");
    if (!success) {
      logger.error(`relayController - Interval - Failed to delete event: ${event.id}`);
    }
  }

  if (eventsToProcess.length === 0) return;

  const createdAtTimes = eventsToProcess.map(({ event }) => event.created_at);
  const minCreatedAt = Math.min(...createdAtTimes);
  const maxCreatedAt = Math.max(...createdAtTimes);

  // Delete events from the shared memory chunks
  for (const [idx, chunk] of eventStore.sharedDBChunks.entries()) {
    await new Promise(resolve => setImmediate(resolve));
    if (chunk.timeRange.max < minCreatedAt || chunk.timeRange.min > maxCreatedAt) continue;
    const eventsInChunk = await decodeChunk(chunk);
    const eventsToRemove = eventsInChunk.filter(e =>
      eventsToProcess.some(proc => proc.event.id === e.id)
    );
    if (eventsToRemove.length > 0) {
      const updatedChunk = await updateChunk(chunk, eventsToRemove, "remove");
      eventStore.sharedDBChunks[idx] = updatedChunk;
    }
  }
};

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
const manageEvents = async () => {

  if (!eventStore || !isModuleEnabled("relay", app) || !eventStore.relayEventsLoaded || getRelayHeavyWorkerLength() > 0 || getRelayLightWorkerLength() > 0) {
    setTimeout(manageEvents, 1 * 60 * 1000); 
    return;
  }

  await enqueueRelayTask({ fn: async () => {
      await persistEvents();
      await unpersistEvents();
      // await updateEventsMetadata();
  }});
  setTimeout(manageEvents, 1 * 60 * 1000); // 1 minute
};

manageEvents();

// Workers
let lightGetEventsPool = workerpool.pool(
  path.join(workersDir, 'getEvents.js'),
  { maxWorkers: Math.ceil(relayWorkers * 0.25) }
);

let heavyGetEventsPool = workerpool.pool(
  path.join(workersDir, 'getEvents.js'),
  { maxWorkers: Math.ceil(relayWorkers * 0.75) }
);
(async () => {
  await lightGetEventsPool.exec("initWorker", [redisConfig]);
  await heavyGetEventsPool.exec("initWorker", [redisConfig]);
})();

const pendingLightTasks: Map<string, PendingGetEventsTask> = new Map();
const pendingHeavyTasks: Map<string, PendingGetEventsTask> = new Map();

const getPendingLightTasks = (): PendingGetEventsTask[] => {
  return Array.from(pendingLightTasks.values());
}

const getPendingHeavyTasks = (): PendingGetEventsTask[] => {
  return Array.from(pendingHeavyTasks.values());
}

let workersRecycling = false;
const getEvents = async (filters: any, maxLimit: number, chunks: SharedChunk[]): Promise<any> => {
  const isHeavy = isHeavyFilter(filters);
  const taskId = Math.random().toString(36).substring(7);

  try {

    if (workersRecycling) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return getEvents(filters, maxLimit, chunks);
    }

    const taskData: PendingGetEventsTask = {
      id: taskId,
      filters,
      enqueuedAt: Date.now()
    };

    isHeavy ? pendingHeavyTasks.set(taskId, taskData) : pendingLightTasks.set(taskId, taskData);

    const getEventsWorker = isHeavy ? heavyGetEventsPool : lightGetEventsPool

    await getEventsWorker.exec("initWorker", [redisConfig]);

    const result =  await getEventsWorker.exec("_getEvents", [
      JSON.parse(JSON.stringify(filters)),
      maxLimit,
      chunks,
      dynamicTimeout(filters, isHeavy, getRelayLightWorkerLength(), getRelayHeavyWorkerLength())
    ]);
    return result;
    
  } catch (error) {
    logger.error(`getEventsWorker - Error: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  } finally {
    isHeavy ? pendingHeavyTasks.delete(taskId) : pendingLightTasks.delete(taskId);
  }
};

/**
 * Recicle workers
 * This function is called every 10 minutes to recicle workers
 * It stops all workers and creates new ones flushing old cache.
 */
const recicleWorkers = async () => {

  if (getRelayHeavyWorkerLength() > 0 || getRelayLightWorkerLength() > 0) {
    return;
  }

  try{
    workersRecycling = true;

    await Promise.all([
      lightGetEventsPool.exec("cleanRedis", []),
      heavyGetEventsPool.exec("cleanRedis", [])
    ]);

    await Promise.all([
      lightGetEventsPool.terminate(false),
      heavyGetEventsPool.terminate(false)
    ]);

    lightGetEventsPool = workerpool.pool(
      path.join(workersDir, 'getEvents.js'),
      { maxWorkers: Math.ceil(relayWorkers * 0.25) }
    );

    heavyGetEventsPool = workerpool.pool(
      path.join(workersDir, 'getEvents.js'),
      { maxWorkers: Math.ceil(relayWorkers * 0.75) }
    );

  }catch(error){
    logger.error(`recicleWorkers - Error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    workersRecycling = false;
  }

};

// Recicle workers
setInterval(async () => {
  recicleWorkers();
}, 5 * 60 * 1000); // 5 minutes

export { getRelayQueueLength, enqueueRelayTask, relayWorkers, getEvents, getRelayLightWorkerLength, getRelayHeavyWorkerLength, getPendingLightTasks, getPendingHeavyTasks };  
