import { Filter, matchFilter, Event } from "nostr-tools";
import workerpool from "workerpool";
import { decodeChunk, parseSearchTokens } from "../utils.js";
import { MetadataEvent, SharedChunk } from "../../../interfaces/relay.js";
import { createClient } from "redis";

const FILTER_CACHE_TTL = 15000; // in milliseconds
const CACHE_TTL = 30000; // in milliseconds

/**
 * Creates a stable hash for a filter to detect duplicates.
 */
const createFilterHash = (filter: Filter): string => {
  const normalized: any = {};
  
  // Normalize the most important filter properties.
  if (filter.kinds) normalized.kinds = [...filter.kinds].sort().join(',');
  if (filter.authors) normalized.authors = [...filter.authors].sort().join(',');
  if (filter.ids) normalized.ids = [...filter.ids].sort().join(',');
  if (filter.since) normalized.since = filter.since;
  if (filter.until) {
    // Use a bucket for "until" based on FILTER_CACHE_TTL.
    // Convert FILTER_CACHE_TTL from ms to seconds (30 seconds en este ejemplo)
    const bucket = FILTER_CACHE_TTL / 1000;
    normalized.until = Math.floor(filter.until / bucket) * bucket;
  }
  
  // Handle tag filters.
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
 * Retrieves the decoded events from a shared memory chunk.
 * The decoded events are cached in Redis for a period of time to reduce decoding overhead.
 *
 * @param chunk - SharedChunk object to decode.
 * @returns A promise that resolves to an array of decoded events.
 */
const getDecodedChunk = async (chunk: SharedChunk, redisClient?: any): Promise<MetadataEvent[]> => {
  const cacheKey = getChunkCacheKey(chunk);
  
  if (redisClient) {
    const cached = await redisClient.get("decodedChunk:" + cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }
  
  const decodedChunk = await decodeChunk(chunk);
  
  if (redisClient) {
    await redisClient.set("decodedChunk:" + cacheKey, JSON.stringify(decodedChunk), { EX: CACHE_TTL / 1000 });
    const pubkeys = Array.from(new Set(decodedChunk.map(e => e.pubkey)));
    await redisClient.set("pubkeys:" + cacheKey, JSON.stringify(pubkeys), { EX: CACHE_TTL / 1000 });
  }
  
  return decodedChunk;
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
  isHeavy : boolean,
  redisConfig?: { host: string; port: string; user: string; password: string; database: number }
): Promise<Event[]> => {

  let redisClient;
  if (redisConfig) {
    redisClient = createClient({
      url: `redis://${redisConfig.user}:${redisConfig.password}@${redisConfig.host}:${redisConfig.port}`,
      database: redisConfig.database
    });

    await redisClient.connect().catch(() => {
      redisClient = null;
    });
  }

  const finalResults: Event[] = [];
  const now = Math.floor(Date.now() / 1000);
  const startTimeMs = Date.now();
  const TIMEOUT_MS = isHeavy ? 30000 : 15000;

  const checkTimeout = (): boolean => {
    return (Date.now() - startTimeMs) > TIMEOUT_MS;
  };

  // If a single filter is provided, attempt to retrieve the result from Redis.
  if (filters.length === 1 && redisClient) {
    const filterHash = createFilterHash(filters[0]);
    const cachedEntry = await redisClient.get("filter:" + filterHash);
    if (cachedEntry) {
      if (redisClient) await redisClient.disconnect();
      return JSON.parse(cachedEntry);
    }
  }

  // Process each provided filter.
  for (const filter of filters) {

    if (checkTimeout()) {
      break; 
    }

    const until = filter.until !== undefined ? filter.until : now;
    const since = filter.since !== undefined ? filter.since : 0;
    const effectiveLimit = filter.limit !== undefined ? Math.min(filter.limit, maxLimit) : maxLimit;
    
    const rawSearch = filter.search ? filter.search.trim() : "";
    const searchQuery = rawSearch.length >= 3 ? rawSearch.toLowerCase() : null;

    const relevantChunks = await filterRelevantChunks(chunks, filter, since, until, redisClient);
    const decodedChunks = [];
    for (const chunk of relevantChunks) {
      if (checkTimeout()) break;
      const decoded = await getDecodedChunk(chunk, redisClient);
      decodedChunks.push(decoded);
    }

    if (checkTimeout()) continue;

    const filterResults: { event: MetadataEvent; score: number }[] = [];

    // Iterate over each chunk that overlaps with the filter's time range.
    for (const decodedEvents of decodedChunks) {
      if (checkTimeout() || (!searchQuery && filterResults.length >= effectiveLimit)) {
        break;  
      }
      for (let event of decodedEvents) {
        if (event.created_at < since || event.created_at > until) continue;
        if (filter.kinds && !filter.kinds.includes(event.kind)) continue;
        if (!matchFilter(filter, event)) continue;

        let specialOk = true;
        if (filter.search) {
          const { plainSearch: _, specialTokens } = parseSearchTokens(filter.search);
          for (const key in specialTokens) {
            if (!event.metadata || !(key in event.metadata)) {
              specialOk = false;
              break;
            }
            const metaVal = event.metadata[key];
            if (typeof metaVal === "string") {
              if (!specialTokens[key].includes(metaVal.toLowerCase())) {
                specialOk = false;
                break;
              }
            } else if (Array.isArray(metaVal)) {
              const uniqueValues = [...new Set(metaVal.map(v => v.toLowerCase()))];
              if (!specialTokens[key].some(val => uniqueValues.includes(val))) {
                specialOk = false;
                break;
              }
            } else {
              specialOk = false;
              break;
            }
          }
        }
        if (!specialOk) continue;

        const isStructuredFilter = filter.search && /^[a-zA-Z0-9_-]+:[^ ]/.test(filter.search);
        const passesSearch =
          !searchQuery || isStructuredFilter || event.content.toLowerCase().includes(searchQuery);
        if (!passesSearch) {
          continue;
        }

        let score = 0;
        if (searchQuery) {
          const content = event.content.toLowerCase();
          score = (content.match(new RegExp(`\\b${searchQuery}\\b`, "gi")) || []).length;
        }
    
        filterResults.push({ event, score });

        // If no search query is provided and the effective limit is reached, stop processing.
        if (!searchQuery && filterResults.length >= effectiveLimit) {
          break;
        }
      }
    }

    // If a search query was provided, sort by matching score in descending order.
    if (searchQuery) {
      filterResults.sort((a, b) => b.score - a.score);
    }

    // Apply the effective limit.
    const filteredEventsLimit = Math.min(filterResults.length, effectiveLimit);
    for (let i = 0; i < filteredEventsLimit; i++) {
      const { metadata, ...eventWithoutMetadata } = filterResults[i].event;
      if (finalResults.length < effectiveLimit) {
        finalResults.push(eventWithoutMetadata);
      }
    }
    
  }

  // Deduplicate events based on their id.
  const uniqueEvents = Array.from(new Map(finalResults.map(event => [event.id, event])).values());

  if (filters.length === 1 && finalResults.length > 0 && redisClient) {
    const filterHash = createFilterHash(filters[0]);
    await redisClient.set("filter:" + filterHash, JSON.stringify(uniqueEvents), { EX: FILTER_CACHE_TTL / 1000 });
  }
  
  if (redisClient) await redisClient.disconnect();

  return uniqueEvents;
};

workerpool.worker({_getEvents: _getEvents});

export { _getEvents };
