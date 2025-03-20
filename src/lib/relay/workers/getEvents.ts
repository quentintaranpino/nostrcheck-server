import { Filter, matchFilter, Event } from "nostr-tools";
import workerpool from "workerpool";
import { decodeEvent, decodePartialEvent } from "../utils.js";
import { SharedChunk } from "../../../interfaces/relay.js";
import { createClient, RedisClientType } from "redis";

const FILTER_CACHE_TTL = 120000; 

let redisClient: RedisClientType | null = null;

interface RedisConfig {
  host: string;
  port: string;
  user: string;
  password: string;
  database: number;
}

/**
 * Initializes the Redis client for the worker.
 *
 * @param redisConfig - Configuration to connect to Redis.
 * @returns A promise that resolves when the Redis client is initialized.
 */
const initRedis = async (redisConfig: RedisConfig): Promise<void> => {
  if (!redisClient) {
    redisClient = createClient({
      url: `redis://${redisConfig.user}:${redisConfig.password}@${redisConfig.host}:${redisConfig.port}`,
      database: redisConfig.database,
    });
    await redisClient.connect();
  }
};

/**
 * Creates a stable hash for a filter to detect duplicates.
 */
const createFilterHash = (filter: Filter): string => {
  const normalized: any = {};
  let timeBucket = 60; 

  if (filter.since !== undefined && filter.until !== undefined) {
    const range = filter.until - filter.since;
    if (range > 30 * 86400) {
      timeBucket = 86400;  // 1 day
    } else if (range > 7 * 86400) {
      timeBucket = 21600; // 6 hours
    } else if (range > 2 * 86400) {
      timeBucket = 10800; // 3 hours
    } else if (range > 12 * 3600) {
      timeBucket = 3600; // 1 hour
    } else if (range > 2 * 3600) {
      timeBucket = 1800; // 30 minutes
    } else if (range > 3600) {
      timeBucket = 600; // 10 minutes
    } else {
      timeBucket = 60; // 1 minute
    }
  }

  if (filter.since !== undefined) {
    normalized.since = Math.floor(filter.since / timeBucket) * timeBucket;
  }
  if (filter.until !== undefined) {
    normalized.until = Math.floor(filter.until / timeBucket) * timeBucket;
  }

  if (filter.kinds) {
    normalized.kinds = [...filter.kinds].sort().join(',');
  }
  if (filter.authors) {
    normalized.authors = [...filter.authors].sort().join(',');
  }
  if (filter.ids) {
    normalized.ids = [...filter.ids].sort().join(',');
  }

  for (const key in filter) {
    if (key.startsWith('#') && Array.isArray(filter[key as keyof Filter])) {
      normalized[key] = [...(filter[key as keyof Filter] as string[])].sort().join(',');
    }
  }

  if (filter.search) {
    normalized.search = filter.search.toLowerCase().trim();
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
  until: number
): Promise<SharedChunk[]> => {
  const timeFilteredChunks = chunks.filter(chunk => {
    if (chunk.timeRange.max < since) return false;
    if (chunk.timeRange.min > until) return false;
    return true;
  });

  if (!redisClient) {
    return [];
  }

  if (filter.authors && filter.authors.length > 0) {
    const authorsSet = new Set(filter.authors);
    const relevant: SharedChunk[] = [];

    for (const chunk of timeFilteredChunks) {
      const cacheKey = getChunkCacheKey(chunk);
      const cachedPubkeys = await redisClient.get("pubkeys:" + cacheKey);

      if (await isChunkExcluded(chunk, filter.authors)) {
        continue; 
      }

      if (cachedPubkeys) {
        const pubkeys: string[] = JSON.parse(cachedPubkeys);
        if (pubkeys.some(pubkey => authorsSet.has(pubkey))) {
          relevant.push(chunk);
        } else {
         
          await cacheChunkExclusion(chunk, filter.authors);
        }
      } else {
        relevant.push(chunk);
      }
    }
    return relevant;
  }

  return timeFilteredChunks;
};


/**
 * Retrieves event headers from a shared memory chunk.
 * If the headers are cached, they are retrieved from the cache.
 * 
 * @param chunk - SharedChunk object.
 * @param redisClient - Redis client object.
 * @returns A promise that resolves to an array of event headers.
 */
const getCachedEventHeaders = async (
  chunk: SharedChunk
): Promise<{
  offset: number;
  header: {
    created_at: number;
    kind: number;
    pubkey: string;
    id: string;
  };
}[]> => {
  if (!redisClient) {
    return [];
  }
  const cacheKey = `chunkheaders:${getChunkCacheKey(chunk)}`;
    const cachedHeaders = await redisClient.get(cacheKey);
    if (cachedHeaders) {
      return JSON.parse(cachedHeaders) as {
        offset: number;
        header: {
          created_at: number;
          kind: number;
          pubkey: string;
          id: string;
        };
      }[];
    }

  const headers = decodePartialEvent(chunk);
  await redisClient.set(cacheKey, JSON.stringify(headers), { EX: FILTER_CACHE_TTL / 1000 });
  return headers;
};


const chunkExclusionCacheKey = (chunk: SharedChunk, authors: string[]): string => {
  const authorsHash = authors.sort().join(',');
  return `chunkexclusion:${getChunkCacheKey(chunk)}:${authorsHash}`;
};

const isChunkExcluded = async (
  chunk: SharedChunk,
  authors: string[],
): Promise<boolean> => {
  if (!redisClient) return false;
  const exclusionKey = chunkExclusionCacheKey(chunk, authors);
  const excluded = await redisClient.get(exclusionKey);
  return excluded === '1';
};

const cacheChunkExclusion = async (
  chunk: SharedChunk,
  authors: string[],
): Promise<void> => {
  if (!redisClient) return;
  const exclusionKey = chunkExclusionCacheKey(chunk, authors);
  await redisClient.set(exclusionKey, '1', { EX: 600 }); 
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
  isHeavy: boolean
): Promise<Event[]> => {

  if (!redisClient) {
    return [];
  }

  const finalResults = [];
  const now = Math.floor(Date.now() / 1000);
  const startTimeMs = Date.now();
  const TIMEOUT_MS = isHeavy ? 5000 : 3000;
  const checkTimeout = () => Date.now() - startTimeMs > TIMEOUT_MS;

  for (const filter of filters) {
    if (checkTimeout()) break;

    const until = filter.until !== undefined ? filter.until : now;
    const since = filter.since !== undefined ? filter.since : 0;
    const effectiveLimit = filter.limit !== undefined ? Math.min(Number(filter.limit), maxLimit) : maxLimit;
    const rawSearch = filter.search ? filter.search.trim() : "";
    const searchQuery = rawSearch.length >= 3 ? rawSearch.toLowerCase() : null;

    let cacheUsed = false;

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

    if (!cacheUsed) {
      const relevantChunks = await filterRelevantChunks(chunks, filter, since, until);
      const filterResults: { event: Event; score?: number }[] = [];
      const BATCH_SIZE = isHeavy ? 25 : 10;

      for (const chunk of relevantChunks) {
        if (checkTimeout()) break;
        const headers = await getCachedEventHeaders(chunk);
        const view = new DataView(chunk.buffer);
        
        // Pre-filter all headers first
        const filteredHeaders = headers.filter(({ header }) => {
          if (header.created_at < since || header.created_at > until) return false;
          if (filter.kinds && !filter.kinds.includes(header.kind)) return false;
          if (filter.authors && filter.authors.length > 0 && !filter.authors.includes(header.pubkey)) return false;
          if (filter.ids && filter.ids.length > 0 && !filter.ids.includes(header.id)) return false;
          return true;
        });

        // Dynamic batch sizing based on filter complexity and data volume
        const dynamicBatchSize = () => {
          // If this is a heavy task and we have many headers
          if (isHeavy && filteredHeaders.length > 500) {
            // Reduce batch size for very large datasets
            return Math.max(5, Math.min(BATCH_SIZE, Math.ceil(250 / Math.sqrt(filteredHeaders.length))));
          }
          return BATCH_SIZE;
        };
        
        const effectiveBatchSize = dynamicBatchSize();

        // Process filtered headers in batches using slices
        for (let i = 0; i < filteredHeaders.length; i += effectiveBatchSize) {
          if (checkTimeout()) break;
          
          const batchHeaders = filteredHeaders.slice(i, i + effectiveBatchSize);
          const batchTasks = batchHeaders.map(({ offset }) => ({ chunk, offset, view }));
          
          const batchResults = await Promise.all(
            batchTasks.map(task => decodeEvent(task.chunk.buffer, task.view, task.offset))
          );
          
          // Process each result in the batch
          for (const result of batchResults) {
            const { event } = result;
            
            // Skip events that don't match the filter criteria
            if (!matchFilter(filter, event)) continue;
            
            // Add matching events to results
            filterResults.push({ event, score: 0 });
            
            // Early exit if we've already found enough events and there's no search query
            if (!searchQuery && filterResults.length >= effectiveLimit) break;
          }
          
          // Early exit from batch processing if we have enough results
          if (!searchQuery && filterResults.length >= effectiveLimit) break;
          
          // Allow event loop to breathe on heavy tasks
          if (isHeavy && i > 0 && i % (effectiveBatchSize * 4) === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        if (!searchQuery && filterResults.length >= effectiveLimit) break;
      }

      const eventsToAdd = filterResults.slice(0, effectiveLimit).map(({ event }) => {
        const eventWithoutMetadata = { ...event };
        return eventWithoutMetadata;
      });

      finalResults.push(...eventsToAdd);

      const filterHash = createFilterHash(filter);
      const cachedEntry = await redisClient.get("filter:" + filterHash);
      if (!cachedEntry || JSON.parse(cachedEntry).length < eventsToAdd.length) {
        await redisClient.set("filter:" + filterHash, JSON.stringify(eventsToAdd), { EX: FILTER_CACHE_TTL / 1000 });
      }

      if (filterResults.length > (maxLimit / 2)) {
        filterResults.length = 0;
        if (global.gc) global.gc();
      }

    }
  }

  return Array.from(new Map(finalResults.map(event => [event.id, event])).values());
};


workerpool.worker({_getEvents: _getEvents, initRedis: initRedis});

export { _getEvents };