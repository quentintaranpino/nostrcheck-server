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
 * Processes a segment of shared memory chunks to retrieve events that match the filter criteria.
 * 
 * @param filter - Filter object.
 * @param chunks - Array of SharedChunk objects.
 * @param segmentSince - Start time of the segment.
 * @param segmentUntil - End time of the segment.
 * @param searchQuery - Search query string.
 * 
 * @returns A promise that resolves to an array of events.
 */
async function processSegment(
  filter: Filter, 
  chunks: SharedChunk[], 
  segmentSince: number, 
  segmentUntil: number,
  searchQuery: string | null
): Promise<{ event: MetadataEvent; score: number }[]> {
  const segmentResults: { event: MetadataEvent; score: number }[] = [];

  const segmentChunks = chunks.filter(chunk => {
    return !(chunk.timeRange.max < segmentSince || chunk.timeRange.min > segmentUntil);
  });

  for (const chunk of segmentChunks) {
    const headers = await getCachedEventHeaders(chunk);
    const view = new DataView(chunk.buffer);

    const filteredHeaders = headers.filter(({ header }) => {
      if (header.created_at < segmentSince || header.created_at > segmentUntil) return false;
      if (filter.kinds && !filter.kinds.includes(header.kind)) return false;
      if (filter.authors && filter.authors.length > 0 && !filter.authors.includes(header.pubkey)) return false;
      if (filter.ids && filter.ids.length > 0 && !filter.ids.includes(header.id)) return false;
      return true;
    });

    const decodedEvents = await Promise.all(
      filteredHeaders.map(({ offset }) => decodeEvent(chunk.buffer, view, offset))
    );

    for (const { event } of decodedEvents) {
      if (!matchFilter(filter, event)) continue;

      let score = 0;
      if (searchQuery) {
        const parts = searchQuery.split(':');
        if (parts.length === 2) {
          const key = parts[0].trim();
          const value = parts[1].trim();
          if (event.metadata && event.metadata[key]) {
            const metaValue = event.metadata[key];
            if (Array.isArray(metaValue)) {
              if (!metaValue.some(val => val.toLowerCase() === value)) continue;
            } else if (typeof metaValue === 'string') {
              if (metaValue.toLowerCase() !== value) continue;
            } else {
              continue;
            }
          } else {
            continue;
          }
        } else {
          const contentLower = event.content.toLowerCase();
          const idx = contentLower.indexOf(searchQuery);
          if (idx === -1) continue;
          score = idx; // Lower index is better
        }
      }
      segmentResults.push({ event, score });
    }
  }
  return segmentResults;
}

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
  timeout: number 
): Promise<Event[]> => {

  if (!redisWorker) return [];

  const finalResults: Event[] = [];
  const now = Math.floor(Date.now() / 1000);
  const startTimeMs = Date.now();
  const checkTimeout = () => Date.now() - startTimeMs > timeout;

  for (const filter of filters) {
    if (checkTimeout()) break;

    const rawSearch = filter.search ? filter.search.trim() : "";
    const searchQuery = rawSearch.length >= 3 ? rawSearch.toLowerCase() : null;
    const until = filter.until !== undefined ? filter.until : now;
    const since = filter.since !== undefined ? filter.since : now - 86400 * 90; // 90 days
    const effectiveLimit = searchQuery ? Math.ceil(maxLimit * 1.5) : maxLimit;

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

    const segmentDuration = 86400; // 1 day segments
    const segments = [];
    for (let t = until; t > since; t -= segmentDuration) {
      segments.push({
        segmentSince: Math.max(since, t - segmentDuration),
        segmentUntil: t
      });
    }

    let accumulatedResults: { event: MetadataEvent; score: number }[] = [];
    let counter = 0
    for (const seg of segments) {
      counter++;
      if (checkTimeout()) break;
      const segResults = await processSegment(filter, chunks, seg.segmentSince, seg.segmentUntil, searchQuery);
      accumulatedResults = accumulatedResults.concat(segResults);
      if (accumulatedResults.length >= effectiveLimit) break;
    }

    if (searchQuery) {
      accumulatedResults.sort((a, b) => a.score - b.score);
    } else {
      accumulatedResults.sort((a, b) => b.event.created_at - a.event.created_at);
    }
    const finalSegmentEvents = accumulatedResults.slice(0, effectiveLimit).map(({ event }) => {
      const { metadata, ...eventWithoutMetadata } = event;
      return eventWithoutMetadata;
    });

    finalResults.push(...finalSegmentEvents);

    if (!cachedEntryRaw) {
      const cacheEntry = {
        timestamp: Math.floor(Date.now() / 1000),
        data: finalSegmentEvents,
      };
      await redisWorker.set(cacheKey, JSON.stringify(cacheEntry), { EX: FILTER_CACHE_TTL });
    }
  }

  return Array.from(new Map(finalResults.map(event => [event.id, event])).values());
};

workerpool.worker({initWorker: initWorker, _getEvents: _getEvents});

export { _getEvents };