import { Filter, matchFilter, Event } from "nostr-tools";
import workerpool from "workerpool";
import { decodeEvent } from "../utils.js";
import { SharedChunk } from "../../../interfaces/relay.js";
import { createClient } from "redis";

const FILTER_CACHE_TTL = 30000; 

/**
 * Creates a stable hash for an array of filters to detect duplicates.
 */
const createFiltersHash = (filters: Filter[]): string => {
  const hashes = filters.map(createFilterHash).sort();
  return JSON.stringify(hashes);
};

/**
 * Creates a stable hash for a filter to detect duplicates.
 */
const createFilterHash = (filter: Filter): string => {
  const normalized: any = {};
  const timeBucket = 60;
  if (filter.since) normalized.since = Math.floor(filter.since / timeBucket) * timeBucket;
  if (filter.until) normalized.until = Math.floor(filter.until / timeBucket) * timeBucket;

    // Normalize the most important filter properties.
  if (filter.kinds) normalized.kinds = [...filter.kinds].sort().join(',');
  if (filter.authors) normalized.authors = [...filter.authors].sort().join(',');
  if (filter.ids) normalized.ids = [...filter.ids].sort().join(',');

  for (const key in filter) {
    if (key.startsWith('#') && Array.isArray(filter[key as keyof Filter])) {
      normalized[key] = [...(filter[key as keyof Filter] as string[])].sort().join(',');
    }
  }
  return JSON.stringify(normalized);
};

/**
 * Generates a cache key for a shared memory chunk.
 *
 * @param chunk - SharedChunk object.
 * @returns A string representing the cache key.
 */
const getChunkCacheKey = (chunk: SharedChunk): string => {
  return `${chunk.timeRange.min}-${chunk.timeRange.max}-${chunk.indexMap.length}`;
};

/**
 * Filters chunks based on the time range and pubkey cache information using Redis.
 * If the cache is found, the filtering is refined.
 */
const filterRelevantChunks = async (
  chunks: SharedChunk[], 
  filter: Filter, 
  since: number, 
  until: number,
  redisClient?: any
): Promise<SharedChunk[]> => {
  const timeFilteredChunks = chunks.filter(chunk => {
    if (chunk.timeRange.max < since) return false; 
    if (chunk.timeRange.min > until) return false;
    return true;
  });
  
  if (filter.authors && filter.authors.length > 0 && redisClient) {
    const authorsSet = new Set(filter.authors);
    const relevant: SharedChunk[] = [];
    for (const chunk of timeFilteredChunks) {
      const cacheKey = getChunkCacheKey(chunk);
      const cachedPubkeys = await redisClient.get("pubkeys:" + cacheKey);
      if (cachedPubkeys) {
        const pubkeys: string[] = JSON.parse(cachedPubkeys);
        if (pubkeys.some(pubkey => authorsSet.has(pubkey))) {
          relevant.push(chunk);
        }
      } else {
        // If no cache exists, include the chunk for further processing.
        relevant.push(chunk);
      }
    }
    return relevant;
  }
  
  return timeFilteredChunks;
};

/**
 * Decodes an event from a shared memory chunk.
 * The event is decoded based on the header information.
 * 
 * @param buffer - SharedArrayBuffer containing the chunk data.
 * @param view - DataView object for the buffer.
 * @param offset - Offset of the event in the buffer.
 * @returns A promise that resolves to the decoded event.
 */
const getEventHeaders = (chunk: SharedChunk): { offset: number, header: { created_at: number, kind: number, pubkey: string, id: string } }[] => {
  const headers = [];
  const view = new DataView(chunk.buffer);
  for (let i = 0; i < chunk.indexMap.length; i++) {
    const baseOffset = chunk.indexMap[i];
    const created_at = view.getInt32(baseOffset, true);
    const kind = view.getInt32(baseOffset + 12, true);
    const pubkeyBytes = new Uint8Array(chunk.buffer, baseOffset + 16, 32);
    const pubkey = Array.from(pubkeyBytes).map(b => b.toString(16).padStart(2, "0")).join("");
    const idBytes = new Uint8Array(chunk.buffer, baseOffset + 112, 32);
    const id = Array.from(idBytes).map(b => b.toString(16).padStart(2, "0")).join("");
    headers.push({ offset: baseOffset, header: { created_at, kind, pubkey, id } });
  }
  return headers;
};

/**
 * Retrieves events from an array of shared memory chunks, applying NIP-50 search with extensions.
 * For filters with a search query, events are scored and sorted by matching quality,
 * and the limit is applied after sorting.
 *
 * @param filters - Array of filter objects to apply.
 * @param maxLimit - Maximum number of events to return.
 * @param chunks - Array of SharedChunk objects.
 * @param isHeavy - Indicates whether the operation is heavy or not.
 * @param redisConfig - Configuration to connect to Redis.
 * @returns A promise that resolves to an array of events.
 */
const _getEvents = async (
  filters: Filter[], 
  maxLimit: number,
  chunks: SharedChunk[], 
  isHeavy: boolean,
  redisConfig?: { host: string; port: string; user: string; password: string; database: number }
): Promise<Event[]> => {

  let redisClient;
  if (redisConfig) {
    redisClient = createClient({
      url: `redis://${redisConfig.user}:${redisConfig.password}@${redisConfig.host}:${redisConfig.port}`,
      database: redisConfig.database,
    });
    await redisClient.connect().catch(() => (redisClient = null));
  }

  const finalResults = [];
  const now = Math.floor(Date.now() / 1000);
  const startTimeMs = Date.now();
  const TIMEOUT_MS = isHeavy ? 10000 : 5000;
  const checkTimeout = () => Date.now() - startTimeMs > TIMEOUT_MS;

  for (const filter of filters) {
    if (checkTimeout()) break;

    const until = filter.until !== undefined ? filter.until : now;
    const since = filter.since !== undefined ? filter.since : 0;
    const effectiveLimit = filter.limit !== undefined ? Math.min(Number(filter.limit), maxLimit) : maxLimit;
    const rawSearch = filter.search ? filter.search.trim() : "";
    const searchQuery = rawSearch.length >= 3 ? rawSearch.toLowerCase() : null;

    let cacheUsed = false;

    if (redisClient) {
      const filterHash = createFilterHash(filter);
      const cachedEntry = await redisClient.get("filter:" + filterHash);
      if (cachedEntry) {
        const cachedResults = JSON.parse(cachedEntry);
        if (cachedResults.length >= effectiveLimit) {
          finalResults.push(...cachedResults.slice(0, effectiveLimit));
          cacheUsed = true;
          continue;
        }
      }
    }

    if (!cacheUsed) {
      const relevantChunks = await filterRelevantChunks(chunks, filter, since, until, redisClient);
      const filterResults = [];
      const BATCH_SIZE = 25;

      for (const chunk of relevantChunks) {
        if (checkTimeout()) break;
        const headers = getEventHeaders(chunk);
        const view = new DataView(chunk.buffer);
        let batchTasks = [];

        for (const { offset, header } of headers) {
          if (checkTimeout()) break;
          if (header.created_at < since || header.created_at > until) continue;
          if (filter.kinds && !filter.kinds.includes(header.kind)) continue;
          if (filter.authors && filter.authors.length > 0 && !filter.authors.includes(header.pubkey)) continue;
          if (filter.ids && filter.ids.length > 0 && !filter.ids.includes(header.id)) continue;

          batchTasks.push({ chunk, offset, view });
          if (batchTasks.length >= BATCH_SIZE) {
            const batchResults = await Promise.all(batchTasks.map(task => decodeEvent(task.chunk.buffer, task.view, task.offset)));

            for (const { event } of batchResults) {
              if (!matchFilter(filter, event)) continue;
              filterResults.push({ event, score: 0 });
              if (!searchQuery && filterResults.length >= effectiveLimit) break;
            }

            batchTasks = [];
            if (!searchQuery && filterResults.length >= effectiveLimit) break;
          }
        }

        if (batchTasks.length > 0 && filterResults.length < effectiveLimit) {
          const batchResults = await Promise.all(batchTasks.map(task => decodeEvent(task.chunk.buffer, task.view, task.offset)));
          for (const { event } of batchResults) {
            if (!matchFilter(filter, event)) continue;
            filterResults.push({ event, score: 0 });
            if (!searchQuery && filterResults.length >= effectiveLimit) break;
          }
        }

        if (!searchQuery && filterResults.length >= effectiveLimit) break;
      }

      const eventsToAdd = filterResults.slice(0, effectiveLimit).map(({ event }) => {
        const { metadata, ...eventWithoutMetadata } = event;
        return eventWithoutMetadata;
      });

      finalResults.push(...eventsToAdd);

      if (redisClient) {
        const filterHash = createFilterHash(filter);
        const cachedEntry = await redisClient.get("filter:" + filterHash);
        if (!cachedEntry || JSON.parse(cachedEntry).length < eventsToAdd.length) {
          await redisClient.set("filter:" + filterHash, JSON.stringify(eventsToAdd), { EX: FILTER_CACHE_TTL / 1000 });
        }
      }

      if (filterResults.length > (maxLimit / 2)) {
        filterResults.length = 0;
        if (global.gc) global.gc();
      }

    }
  }

  if (redisClient) await redisClient.disconnect();

  return Array.from(new Map(finalResults.map(event => [event.id, event])).values());
};


workerpool.worker({_getEvents: _getEvents});

export { _getEvents };