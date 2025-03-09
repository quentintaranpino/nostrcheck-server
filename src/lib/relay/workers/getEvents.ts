import { Filter, matchFilter, Event } from "nostr-tools";
import workerpool from "workerpool";
import { decodeChunk, parseSearchTokens } from "../utils.js";
import { MetadataEvent, SharedChunk } from "../../../interfaces/relay.js";

interface DecodedChunkCache {
  data: MetadataEvent[];
  timestamp: number;
  hits: number;
  created_at: number;
}

const decodedChunksCache = new Map<string, DecodedChunkCache>();
const lastUpdatedChunks = new Map<string, number>(); 

const BASE_CACHE_TTL = 60000; 
const MAX_CACHE_SIZE = 50; 
const CLEANUP_PERCENTAGE = 0.4;

/**
 * Returns the time-to-live (TTL) for a shared memory chunk based on its age.
 *
 * @param chunk - SharedChunk object.
 * @returns TTL in milliseconds.
 */
const getChunkTTL = (chunk: SharedChunk): number => {
  const now = Math.floor(Date.now() / 1000);
  const ageInHours = (now - chunk.timeRange.max) / 3600;
  
  if (ageInHours < 1) return 45000;     
  if (ageInHours < 24) return 120000;  
  if (ageInHours < 168) return 300000;  
  return 600000;   
};

/**
 * Generates a cache key for a shared memory chunk.
 *
 * @param chunk - SharedChunk object.
 * @returns A string cache key.
 */
const getChunkCacheKey = (chunk: SharedChunk): string => {
  return `${chunk.timeRange.min}-${chunk.timeRange.max}-${chunk.indexMap.length}`;
};


/**
 * Retrieves the decoded events from a shared memory chunk.
 * The decoded events are cached for a period of time to reduce the decoding overhead.
 *
 * @param chunk - SharedChunk object to decode.
 * @returns A promise that resolves to an array of decoded events.
 */
const getDecodedChunk = async (chunk: SharedChunk): Promise<MetadataEvent[]> => {
  const cacheKey = getChunkCacheKey(chunk);
  const now = Date.now();
  
  if (decodedChunksCache.has(cacheKey)) {
    const cached = decodedChunksCache.get(cacheKey)!;

    const dynamicTTL = getChunkTTL(chunk);
    const hasExceededDynamicTTL = (now - cached.created_at) > dynamicTTL;
    
    if (hasExceededDynamicTTL) {
      decodedChunksCache.delete(cacheKey);
    } else {
      cached.hits++;
      cached.timestamp = now;
      return cached.data;
    }
  }
  
  const decodedChunk = await decodeChunk(chunk);
  
  decodedChunksCache.set(cacheKey, {
    data: decodedChunk,
    timestamp: now,
    hits: 1,
    created_at: now
  });
  
  if (decodedChunksCache.size > MAX_CACHE_SIZE) {
    const entries = [...decodedChunksCache.entries()]
      .sort((a, b) => {
        const ageFactorA = (now - a[1].timestamp) / BASE_CACHE_TTL;
        const ageFactorB = (now - b[1].timestamp) / BASE_CACHE_TTL;
        return (a[1].hits / (1 + ageFactorA)) - (b[1].hits / (1 + ageFactorB));
      });
    
    const toRemove = Math.floor(MAX_CACHE_SIZE * CLEANUP_PERCENTAGE);
    for (let i = 0; i < toRemove; i++) {
      if (entries[i]) decodedChunksCache.delete(entries[i][0]);
    }
  }
  
  return decodedChunk;

};

/**
 * Periodically clean up the decoded chunks cache.
 */
setInterval(() => {
  const now = Date.now();
  let removedCount = 0;
  
  const entries = [...decodedChunksCache.entries()]
    .sort((a, b) => {
      const ageFactorA = (now - a[1].timestamp) / BASE_CACHE_TTL;
      const ageFactorB = (now - b[1].timestamp) / BASE_CACHE_TTL;
      return (a[1].hits / (1 + ageFactorA)) - (b[1].hits / (1 + ageFactorB));
    });
  
  if (decodedChunksCache.size > MAX_CACHE_SIZE * 0.75) {
    const toRemove = Math.floor(MAX_CACHE_SIZE * 0.25);
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      decodedChunksCache.delete(entries[i][0]);
      removedCount++;
    }
  } else {
    for (const [key, value] of decodedChunksCache.entries()) {
      if (now - value.timestamp > BASE_CACHE_TTL) {
        decodedChunksCache.delete(key);
        removedCount++;
      }
    }
  }
  
}, BASE_CACHE_TTL / 2);


/**
 * Periodically refresh the decoded chunks cache for recent chunks.
 */
setInterval(() => {
  const now = Date.now();
  const recentChunksToRefresh: string[] = [];
  
  for (const [key, value] of decodedChunksCache.entries()) {
    const maxTimeFromKey = parseInt(key.split('-')[1]);
    const ageInHours = (Math.floor(now/1000) - maxTimeFromKey) / 3600;
    
    if (ageInHours < 1) {
      recentChunksToRefresh.push(key);
    }
  }
  
  recentChunksToRefresh
    .sort((a, b) => {
      const lastUpdatedA = lastUpdatedChunks.get(a) || 0;
      const lastUpdatedB = lastUpdatedChunks.get(b) || 0;
      return lastUpdatedA - lastUpdatedB;
    })
    .slice(0, 3) 
    .forEach(key => {
      lastUpdatedChunks.set(key, now);
      decodedChunksCache.delete(key);
    });
}, BASE_CACHE_TTL);

/**
 * Retrieves events from an array of shared memory chunks, applying NIP-50 search with extensions.
 * For filters with a search query, events are scored and sorted by matching quality,
 * and the limit is applied after sorting.
 *
 * @param filters - Array of filter objects to apply.
 * @param maxLimit - Maximum number of events to return.
 * @param chunks - Array of SharedChunk objects.
 * @returns A promise that resolves to an array of events.
 */
const _getEvents = async (filters: Filter[], maxLimit: number, chunks: SharedChunk[]): Promise<Event[]> => {
  const finalResults: Event[] = [];
  const now = Math.floor(Date.now() / 1000);

  // Process each filter provided.
  for (const filter of filters) {
    const until = filter.until !== undefined ? filter.until : now;
    const since = filter.since !== undefined ? filter.since : 0;
    const effectiveLimit = filter.limit !== undefined ? Math.min(filter.limit, maxLimit) : maxLimit;
    
    const rawSearch = filter.search ? filter.search.trim() : "";
    const searchQuery = rawSearch.length >= 3 ? rawSearch.toLowerCase() : null;

    const relevantChunks = chunks.filter(chunk => {
      if (chunk.timeRange.max < since) return false; 
      if (chunk.timeRange.min > until) return false;
      return true;
    });
    const decodedChunks = await Promise.all(relevantChunks.map(getDecodedChunk));

    const filterResults: { event: MetadataEvent; score: number }[] = [];

    // Iterate over each chunk that overlaps with the filter's time range.
    for (const decodedEvents of decodedChunks) {
      for (let event of decodedEvents) {
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

        // If no search query is provided and the effective limit is reached, stop processing
        if (!searchQuery && filterResults.length >= effectiveLimit) {
          break;
        }
      }
    }

    // If a search query was provided, sort by matching score in descending order.
    if (searchQuery) {
      filterResults.sort((a, b) => b.score - a.score);
    }

    // Apply the effective limit after sorting.
    const filteredEvents = filterResults.slice(0, effectiveLimit).map(obj => {
      // Remove metadata before returning the event.
      const { metadata, ...eventWithoutMetadata } = obj.event;
      return eventWithoutMetadata;
    });

    // Append the filtered events to the final results if the effective limit has not been reached.
    for (let i = 0; i < Math.min(filteredEvents.length, effectiveLimit - finalResults.length); i++) {
      finalResults.push(filteredEvents[i]);
    }
  }

  // Deduplicate events based on their id.
  const uniqueEvents = Array.from(new Map(finalResults.map(event => [event.id, event])).values());

  return uniqueEvents;
};

workerpool.worker({_getEvents: _getEvents});

export { _getEvents };
