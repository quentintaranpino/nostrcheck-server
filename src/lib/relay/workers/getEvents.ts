import { Filter, matchFilter, Event } from "nostr-tools";
import workerpool from "workerpool";
import { decodeChunk, parseSearchTokens } from "../utils.js";
import { MetadataEvent, SharedChunk } from "../../../interfaces/relay.js";

/**
 * Cache for tracking recent filter requests to prevent processing duplicates
 */
interface FilterCacheEntry {
  timestamp: number;
  results?: Event[];
  processingTime: number;
}

const recentFiltersCache = new Map<string, FilterCacheEntry>();
const FILTER_CACHE_TTL = 30000;
const FILTER_CACHE_MAX_SIZE = 500;

/**
 * Periodically clean up the recent filters cache.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of recentFiltersCache.entries()) {
    if (now - entry.timestamp > FILTER_CACHE_TTL) {
      recentFiltersCache.delete(key);
    }
  }
  if (recentFiltersCache.size > FILTER_CACHE_MAX_SIZE) {
    const entries = [...recentFiltersCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = Math.floor(FILTER_CACHE_MAX_SIZE * 0.2);
    for (let i = 0; i < toRemove; i++) {
      if (entries[i]) recentFiltersCache.delete(entries[i][0]);
    }
  }
}, FILTER_CACHE_TTL / 2);

/**
 * Creates a stable hash for a filter to detect duplicates
 */
const createFilterHash = (filter: Filter): string => {
  const normalized: any = {};
  
  // Normalize the most important filter properties
  if (filter.kinds) normalized.kinds = [...filter.kinds].sort().join(',');
  if (filter.authors) normalized.authors = [...filter.authors].sort().join(',');
  if (filter.ids) normalized.ids = [...filter.ids].sort().join(',');
  if (filter.since) normalized.since = filter.since;
  if (filter.until) normalized.until = filter.until;
  
  // Handle tag filters
  for (const key in filter) {
    if (key.startsWith('#') && Array.isArray(filter[key as keyof Filter])) {
      normalized[key] = [...(filter[key as keyof Filter] as string[])].sort().join(',');
    }
  }
  
  return JSON.stringify(normalized);
};


// Cache for pubkey information per shared memory chunk.
const pubkeyCache = new Map<string, Set<string>>(); 

interface DecodedChunkCache {
  data: MetadataEvent[];
  timestamp: number;
  hits: number;
}

const decodedChunksCache = new Map<string, DecodedChunkCache>();
const CACHE_TTL = 60000; 
const MAX_CACHE_SIZE = 50; 
const MAX_HITS_BEFORE_REFRESH = 50;

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
 * Filters chunks based on time range and available pubkey cache information.
 * Optimizes by skipping chunks that don't contain any of the requested authors.
 */
const filterRelevantChunks = (chunks: SharedChunk[], filter: Filter, since: number, until: number): SharedChunk[] => {
  const timeFilteredChunks = chunks.filter(chunk => {
    if (chunk.timeRange.max < since) return false; 
    if (chunk.timeRange.min > until) return false;
    return true;
  });
  
  // Si hay filtro de autores y tenemos caché, refinar más
  if (filter.authors && filter.authors.length > 0) {
    const authorsSet = new Set(filter.authors);
    
    return timeFilteredChunks.filter(chunk => {
      const cacheKey = getChunkCacheKey(chunk);
      const pubkeys = pubkeyCache.get(cacheKey);
      
      if (!pubkeys) return true;
      
      for (const pubkey of pubkeys) {
        if (authorsSet.has(pubkey)) return true;
      }
      
      return false;
    });
  }
  
  return timeFilteredChunks;
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
    
    if (cached.hits >= MAX_HITS_BEFORE_REFRESH && 
        now - cached.timestamp >= CACHE_TTL) {
      decodedChunksCache.delete(cacheKey);
    } else if (now - cached.timestamp < CACHE_TTL) {
      cached.hits++;
      decodedChunksCache.set(cacheKey, cached);
      return cached.data;
    }
  }
  const decodedChunk = await decodeChunk(chunk);
  
  decodedChunksCache.set(cacheKey, {
    data: decodedChunk,
    timestamp: now,
    hits: 1
  });
  
  if (decodedChunksCache.size > MAX_CACHE_SIZE) {
    const entries = [...decodedChunksCache.entries()]
      .sort((a, b) => a[1].hits - b[1].hits);
    
    const toRemove = Math.floor(MAX_CACHE_SIZE * 0.2);
    for (let i = 0; i < toRemove; i++) {
      if (entries[i]) decodedChunksCache.delete(entries[i][0]);
    }
  }

  const pubkeys = new Set(decodedChunk.map(e => e.pubkey));
  pubkeyCache.set(cacheKey, pubkeys);
  
  return decodedChunk;
};

/**
 * Periodically clean up the decoded chunks cache.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of decodedChunksCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      decodedChunksCache.delete(key);
    }
  }
}, CACHE_TTL / 2); 

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
  const startTimeMs = Date.now();
  const TIMEOUT_MS = 4500;

  const checkTimeout = (): boolean => {
    if (Date.now() - startTimeMs > TIMEOUT_MS) {
      return true;
    }
    return false;
  };

  if (filters.length === 1) {
    const filterHash = createFilterHash(filters[0]);
    const cachedEntry = recentFiltersCache.get(filterHash);
    
    if (cachedEntry && cachedEntry.results) {
      return cachedEntry.results;
    }
    
    if (cachedEntry) {
      cachedEntry.timestamp = startTimeMs;
      recentFiltersCache.set(filterHash, cachedEntry);
    } else {
      const startTime = startTimeMs;
      recentFiltersCache.set(filterHash, { 
        timestamp: startTime,
        processingTime: 0
      });
      
    }
  }

  // Process each filter provided.
  for (const filter of filters) {

    if (checkTimeout()) {
      break; 
    }

    const until = filter.until !== undefined ? filter.until : now;
    const since = filter.since !== undefined ? filter.since : 0;
    const effectiveLimit = filter.limit !== undefined ? Math.min(filter.limit, maxLimit) : maxLimit;
    
    const rawSearch = filter.search ? filter.search.trim() : "";
    const searchQuery = rawSearch.length >= 3 ? rawSearch.toLowerCase() : null;

    const relevantChunks = filterRelevantChunks(chunks, filter, since, until);
    const decodedChunks = [];
    for (const chunk of relevantChunks) {
      if (checkTimeout()) break;
      const decoded = await getDecodedChunk(chunk);
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

  if (filters.length === 1 && finalResults.length > 0) {
    const filterHash = createFilterHash(filters[0]);
    const cachedEntry = recentFiltersCache.get(filterHash);
    
    if (cachedEntry) {
      cachedEntry.results = finalResults.map(event => ({...event}));
      cachedEntry.processingTime = Date.now() - cachedEntry.timestamp;
      recentFiltersCache.set(filterHash, cachedEntry);
    }
  }

  return uniqueEvents;
};

workerpool.worker({_getEvents: _getEvents});

export { _getEvents };