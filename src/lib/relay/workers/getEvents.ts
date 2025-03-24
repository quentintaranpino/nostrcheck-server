import { Filter, matchFilter, Event } from "nostr-tools";
import workerpool from "workerpool";
import { createFilterHash, decodeEvent, decodePartialEvent } from "../utils.js";
import { MetadataEvent, SharedChunk } from "../../../interfaces/relay.js";
import { RedisConfig } from "../../../interfaces/redis.js";
import { RedisService } from "../../redis.js";

const FILTER_CACHE_TTL = 120; 

let redisWorker: RedisService | null = null;

/**
 * Initializes the worker with a Redis connection.
 * 
**/
const initWorker = async (redisConfig: RedisConfig): Promise<void> => {

  if (redisWorker !== null) {
    return;
  }

  redisWorker = new RedisService({
    host : process.env.REDIS_HOST || redisConfig.host,
    port : process.env.REDIS_PORT || redisConfig.port,
    user : process.env.REDIS_USER || redisConfig.user,
    password : process.env.REDIS_PASSWORD || redisConfig.password,
    defaultDB : redisConfig.defaultDB
    });
  await redisWorker.init();

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

  if (!redisWorker) {
    return [];
  }

  if (filter.authors && filter.authors.length > 0) {
    const authorsSet = new Set(filter.authors);
    const relevant: SharedChunk[] = [];

    for (const chunk of timeFilteredChunks) {
      const cacheKey = getChunkCacheKey(chunk);
      const cachedPubkeys = await redisWorker.get("pubkeys:" + cacheKey);

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
  if (!redisWorker) {
    return [];
  }
  const cacheKey = `chunkheaders:${getChunkCacheKey(chunk)}`;
    const cachedHeaders = await redisWorker.get(cacheKey);
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
  await redisWorker.set(cacheKey, JSON.stringify(headers), { EX: FILTER_CACHE_TTL});
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
  if (!redisWorker) return false;
  const exclusionKey = chunkExclusionCacheKey(chunk, authors);
  const excluded = await redisWorker.get(exclusionKey);
  return excluded === '1';
};

const cacheChunkExclusion = async (
  chunk: SharedChunk,
  authors: string[],
): Promise<void> => {
  if (!redisWorker) return;
  const exclusionKey = chunkExclusionCacheKey(chunk, authors);
  await redisWorker.set(exclusionKey, '1', { EX: FILTER_CACHE_TTL }); 
};

/**
 * Scans recent chunks for events that match the filter criteria.
 * 
 * @param chunks - Array of SharedChunk objects.
 * @param filter - Filter object.
 * @param maxAgeSeconds - Maximum age of the chunks to scan.
 * @returns A promise that resolves to an array of events.
 */
const scanRecentChunks = async (
  chunks: SharedChunk[],
  filter: Filter,
  maxAgeSeconds: number
): Promise<Event[]> => {
  if (!redisWorker) return [];

  const now = Math.floor(Date.now() / 1000);
  const since = now - maxAgeSeconds;

  const recentChunks = chunks.filter(chunk => chunk.timeRange.max >= since);

  const eventsArrays = await Promise.all(
    recentChunks.map(async (chunk) => {
      const headers = await getCachedEventHeaders(chunk);
      const view = new DataView(chunk.buffer);

      const filteredHeaders = headers.filter(({ header }) => {
        if (header.created_at < since) return false;
        if (filter.kinds && !filter.kinds.includes(header.kind)) return false;
        if (filter.authors && filter.authors.length > 0 && !filter.authors.includes(header.pubkey)) return false;
        if (filter.ids && filter.ids.length > 0 && !filter.ids.includes(header.id)) return false;
        return true;
      });

      const decodedEvents = await Promise.all(
        filteredHeaders.map(async ({ offset }) => {
          const { event } = await decodeEvent(chunk.buffer, view, offset);
          return event;
        })
      );

      return decodedEvents.filter(event => matchFilter(filter, event));
    })
  );

  const events = eventsArrays.flat();
  events.sort((a, b) => b.created_at - a.created_at);
  return events;
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
 timeout: number 
): Promise<Event[]> => {

 if (!redisWorker) {
   return [];
 }

 const finalResults = [];
 const now = Math.floor(Date.now() / 1000);
 const startTimeMs = Date.now();
 const checkTimeout = () => Date.now() - startTimeMs > timeout;

 for (const filter of filters) {
   if (checkTimeout()) break;

   const until = filter.until !== undefined ? filter.until : now;
   const since = filter.since !== undefined ? filter.since : 0;
   const effectiveLimit = filter.limit !== undefined ? Math.min(Number(filter.limit), maxLimit) : maxLimit;
   const rawSearch = filter.search ? filter.search.trim() : "";
   const searchQuery = rawSearch.length >= 3 ? rawSearch.toLowerCase() : null;

   const filterHash = createFilterHash(filter);
   const cacheKey = "filter:" + filterHash;
   const cachedEntryRaw = await redisWorker.get(cacheKey);

   if (cachedEntryRaw && cachedEntryRaw !== '[]') {
     const cachedEntry = JSON.parse(cachedEntryRaw);
     const cachedResults = cachedEntry.data;
     const elapsed = Math.floor(Date.now() / 1000) - cachedEntry.timestamp;
     const freshEvents = await scanRecentChunks(chunks, filter, elapsed);
     let cachedFiltered: MetadataEvent[];
     if (freshEvents.length > 0) {
       const freshestTime = freshEvents[0].created_at;
       cachedFiltered = cachedResults.filter((e: MetadataEvent) => 
         e.created_at <= freshestTime && !freshEvents.some((f: MetadataEvent) => f.id === e.id)
       );
     } else {
       cachedFiltered = cachedResults;
     }
     const combined = [...freshEvents, ...cachedFiltered].slice(0, effectiveLimit);
     finalResults.push(...combined);
     continue;
   }

   const relevantChunks = await filterRelevantChunks(chunks, filter, since, until);
   const filterResults: { event: MetadataEvent; score?: number }[] = [];
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

     const dynamicBatchSize = () => {
       if (isHeavy && filteredHeaders.length > 500) {
         return Math.max(5, Math.min(BATCH_SIZE, Math.ceil(250 / Math.sqrt(filteredHeaders.length))));
       }
       return BATCH_SIZE;
     };
     
     const effectiveBatchSize = dynamicBatchSize();

     for (let i = 0; i < filteredHeaders.length; i += effectiveBatchSize) {
       if (checkTimeout()) break;
       
       const batchHeaders = filteredHeaders.slice(i, i + effectiveBatchSize);
       const batchTasks = batchHeaders.map(({ offset }) => ({ chunk, offset, view }));
       
       const batchResults = await Promise.all(
         batchTasks.map(task => decodeEvent(task.chunk.buffer, task.view, task.offset))
       );
       
       for (const result of batchResults) {
         const { event } = result;
         
         // Skip events that don't match the filter criteria
         if (!matchFilter(filter, event)) continue;

         if (searchQuery) {
           const parts = searchQuery.split(':');
           if (parts.length === 2) {
             const key = parts[0].trim();
             const value = parts[1].trim();
             if (event.metadata && event.metadata[key]) {
               const metaValue = event.metadata[key];
               let match = false;
               if (Array.isArray(metaValue)) {
                 match = metaValue.some(val => val.toLowerCase() === value);
               } else if (typeof metaValue === 'string') {
                 match = metaValue.toLowerCase() === value;
               }
               if (!match) continue;
               filterResults.push({ event, score: 0 });
             } else {
               continue;
             }
           } else {
             const contentLower = event.content.toLowerCase();
             const idx = contentLower.indexOf(searchQuery);
             if (idx === -1) continue;
             filterResults.push({ event, score: idx });
           }
         } else {
           filterResults.push({ event, score: 0 });
         }
         
         // Early exit if we've already found enough events and there's no search query
         if (!searchQuery && filterResults.length >= maxLimit) break;
       }
       
       // Early exit from batch processing if we have enough results
       if (!searchQuery && filterResults.length >= maxLimit) break;
       
       // Allow event loop to breathe on heavy tasks
       if (isHeavy && i > 0 && i % (effectiveBatchSize * 4) === 0) {
         await new Promise(resolve => setTimeout(resolve, 0));
       }
     }

     if (!searchQuery && filterResults.length >= maxLimit) break;
   }

   if (searchQuery) {
     filterResults.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
   }

   const eventsToAdd = filterResults.slice(0, maxLimit).map(({ event }) => {
     const { metadata, ...eventWithoutMetadata } = event;
     return eventWithoutMetadata;
   });

   finalResults.push(...eventsToAdd.slice(0, effectiveLimit));

   if (!cachedEntryRaw) {
    const cacheEntry = {
      timestamp: Math.floor(Date.now() / 1000),
      data: eventsToAdd,
    };
    await redisWorker.set(cacheKey, JSON.stringify(cacheEntry), { EX: FILTER_CACHE_TTL });
    }
  }

 return Array.from(new Map(finalResults.map(event => [event.id, event])).values());
};

workerpool.worker({initWorker: initWorker, _getEvents: _getEvents});

export { _getEvents };