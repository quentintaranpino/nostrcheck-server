import fastq, { queueAsPromised } from "fastq";
import { Filter } from "nostr-tools";
import workerpool from "workerpool";
import path from "path";

import { logger } from "../logger.js";
import { CHUNK_SIZE, eventStore, MetadataEvent, PendingGetEventsTask, RelayJob, SharedChunk } from "../../interfaces/relay.js";
import { deleteEvents, storeEvents } from "./database.js";
import { decodeChunk, dynamicTimeout, encodeChunk, getEventById, updateChunk } from "./utils.js";

// Workers
const relayWorkers = Number(getConfig(null, ["relay", "workers"]));
const workersDir = path.resolve('./dist/lib/relay/workers');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { _getEvents } from "./workers/getEvents.js";
import { getConfig, isModuleEnabled } from "../config/core.js";
  
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

const CHUNK_BATCH = 100;

const findChunkFor = (ts: number, chunks: SharedChunk[]): SharedChunk | undefined => {
  let lo = 0, hi = chunks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (chunks[mid].timeRange.min > ts) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  const candidate = chunks[hi];
  return candidate && ts <= candidate.timeRange.max ? candidate : undefined;
};

/**
 * Persist events to the database and update shared memory chunks.
 * New events are assigned to an existing chunk based on their created_at.
 * For the newest chunk (index 0), events with a timestamp greater than the current max
 * are also assigned there, causing the chunk's max range to update.
 * Events that don't match any chunk are used to create new chunk(s) of size CHUNK_SIZE.
 */
const persistEvents = async () => {
  if (
    !isModuleEnabled("relay", "") ||
    !eventStore ||
    !eventStore.pending ||
    !eventStore.relayEventsLoaded ||
    eventStore.pending.size === 0
  ) {
    return;
  }

  const events = Array.from(eventStore.pending.values()) as MetadataEvent[];
  const inserted = await storeEvents(events);
  const newest = eventStore.sharedDBChunks.find(c => c.isActive)!;
  const affected = new Set<SharedChunk>();
  const unassigned: MetadataEvent[] = [];

  for (let i = 0; i < events.length; i += CHUNK_BATCH) {
    const batch = events.slice(i, i + CHUNK_BATCH);
    for (const ev of batch) {
      const entry = eventStore.eventIndex.get(ev.id);
      if (entry) entry.processed = true;
      eventStore.pending.delete(ev.id);

      let chunk = findChunkFor(ev.created_at, eventStore.sharedDBChunks);
      if (!chunk && ev.created_at >= newest.timeRange.min && newest.indexMap.length < CHUNK_SIZE) {
        chunk = newest;
        newest.timeRange.max = ev.created_at;
      }
      if (chunk) {
        affected.add(chunk);
      } else {
        unassigned.push(ev);
      }
    }
    await new Promise(r => setImmediate(r));
  }

  const chunkToEvents = new Map<SharedChunk, MetadataEvent[]>();
  for (const ev of events) {
    for (const chunk of affected) {
      if (ev.created_at >= chunk.timeRange.min && ev.created_at <= chunk.timeRange.max) {
        const arr = chunkToEvents.get(chunk) || [];
        arr.push(ev);
        chunkToEvents.set(chunk, arr);
        break;
      }
    }
  }
  for (const [chunk, evs] of chunkToEvents.entries()) {
    const updated = await updateChunk(chunk, evs, "add");
    const idx = eventStore.sharedDBChunks.findIndex(c => c === chunk);
    if (idx !== -1) {
      eventStore.sharedDBChunks[idx] = updated;
      const decoded = await decodeChunk(updated);
      decoded.forEach((d, pos) => {
        const e = eventStore.eventIndex.get(d.id);
        if (e) {
          e.chunkIndex = idx;
          e.position = pos;
          e.processed = true;
        }
      });
    }
  }

  if (unassigned.length > 0) {
    await new Promise(r => setImmediate(r));

    unassigned.sort((a, b) => b.created_at - a.created_at);

    const currentActive = eventStore.sharedDBChunks.find(c => c.isActive);
    if (currentActive) currentActive.isActive = false;

    const newChunk = await encodeChunk(unassigned);
    newChunk.isActive = true;
    newChunk.id = crypto.randomUUID();

    let insertAt = 0;
    while (
      insertAt < eventStore.sharedDBChunks.length &&
      eventStore.sharedDBChunks[insertAt].timeRange.max > newChunk.timeRange.max
    ) {
      insertAt++;
    }

    eventStore.sharedDBChunks.splice(insertAt, 0, newChunk);

    unassigned.forEach((ev, pos) => {
      const e = eventStore.eventIndex.get(ev.id);
      if (e) {
        e.chunkIndex = insertAt; 
        e.position   = pos;      
        e.processed  = true;
      }
    });

  }

  if (inserted !== events.length) {
    logger.debug(
      `persistEvents – ${inserted} inserted, ${events.length - inserted} duplicates`
    );
  }

};

/**
 * Unpersist events from the memoryDB
 * - NIP-09 or NIP-62 deletion
 * - NIP-40 inactivation
 */
const unpersistEvents = async () => {

  if (!isModuleEnabled("relay", "")) return;
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

// interval to persist and unpersist events
let manageEventsRunning = false;
const manageEvents = async () => {

  if (!eventStore || !isModuleEnabled("relay", "") || !eventStore.relayEventsLoaded || getRelayHeavyWorkerLength() > 0 || getRelayLightWorkerLength() > 0) {
    setTimeout(manageEvents, 1 * 60 * 1000); 
    return;
  }

  if (manageEventsRunning) {
    setTimeout(manageEvents, 1 * 60 * 1000); 
    return;
  }

  manageEventsRunning = true;
  await enqueueRelayTask({ fn: async () => {
      await persistEvents();
      await unpersistEvents();
      // await updateEventsMetadata();
  }});
  manageEventsRunning = false;
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
  await lightGetEventsPool.exec("initWorker", []);
  await heavyGetEventsPool.exec("initWorker", []);
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

    await getEventsWorker.exec("initWorker", []);

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
