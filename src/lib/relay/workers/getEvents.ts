import { Filter, matchFilter, Event } from "nostr-tools";
import workerpool from "workerpool";
import { decodeChunk, parseSearchTokens } from "../utils.js";
import { MetadataEvent, SharedChunk } from "../../../interfaces/relay.js";

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

    // Array to store events that match this filter along with their matching score.
    const filterResults: { event: MetadataEvent; score: number }[] = [];

    // Iterate over each chunk that overlaps with the filter's time range.
    for (const chunk of chunks) {
      // Skip chunk if its time range does not overlap with [since, until].
      if (chunk.timeRange.max < since || chunk.timeRange.min > until) continue;

      // Decode the entire chunk.
      const decodedEvents = await decodeChunk(chunk);
      // Filter events by time range.
      const relevantEvents = decodedEvents.filter(e => e.created_at <= until && e.created_at >= since);

      // Process each event in the chunk.
      for (let event of relevantEvents) {
        // Skip event if it doesn't match the filter.
        if (!matchFilter(filter, event)) continue;

        // Apply special filtering based on metadata tokens if a search is specified.
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

        // Check if the event passes the search query.
        const isStructuredFilter = filter.search && /^[a-zA-Z0-9_-]+:[^ ]/.test(filter.search);
        const passesSearch =
          !searchQuery || isStructuredFilter || event.content.toLowerCase().includes(searchQuery);
        if (!passesSearch) continue;

        // Compute a matching score if searchQuery is present.
        let score = 0;
        if (searchQuery) {
          const content = event.content.toLowerCase();
          let count = 0;
          let pos = content.indexOf(searchQuery);
          while (pos !== -1) {
            count++;
            pos = content.indexOf(searchQuery, pos + searchQuery.length);
          }
          score = count;
        }

        filterResults.push({ event, score });
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
    finalResults.push(...filteredEvents);
  }

  // Deduplicate events based on their id.
  return Array.from(new Map(finalResults.map(event => [event.id, event])).values());
};


workerpool.worker({_getEvents: _getEvents});


export { _getEvents };
