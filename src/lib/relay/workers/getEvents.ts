import { Filter, matchFilter, Event } from "nostr-tools";
import { binarySearchDescendingIndexMap, decodeEvent, parseSearchTokens } from "../utils.js";
import { MetadataEvent, SharedChunk } from "../../../interfaces/relay.js";

/**
 * Retrieves events from an array of shared memory chunks, applying NIP-50 search with extensions.
 * For filters with a search query, events are scored and sorted by matching quality,
 * and the limit is applied after sorting.
 *
 * @param filters - Array of filter objects to apply.
 * @param maxLimit - Maximum number of events to return.
 * @param chunks - Array of SharedChunk objects, each containing a shared buffer, indexMap, and time range.
 * @returns A promise that resolves to an array of events.
 */
const _getEvents = async (filters: Filter[], maxLimit: number, chunks: SharedChunk[]): Promise<Event[]> => {
  const finalResults: Event[] = [];
  const now = Math.floor(Date.now() / 1000);

  // Process each filter provided
  for (const filter of filters) {
    const until = filter.until !== undefined ? filter.until : now;
    const since = filter.since !== undefined ? filter.since : 0;
    // Use the limit from the filter, but cap it to maxLimit
    const effectiveLimit = filter.limit !== undefined ? Math.min(filter.limit, maxLimit) : maxLimit;
    
    const rawSearch = filter.search ? filter.search.trim() : "";
    const searchQuery = rawSearch.length >= 3 ? rawSearch.toLowerCase() : null;

    // Local array to store results for this filter, with their matching score.
    const filterResults: { event: MetadataEvent, score: number }[] = [];

    // Iterate over each chunk that overlaps with the filter's time range.
    for (const chunk of chunks) {
      // Skip the chunk if its time range doesn't overlap with [since, until]
      if (chunk.timeRange.max < since || chunk.timeRange.min > until) {
        continue;
      }
      const view = new DataView(chunk.buffer);
      // Find the starting index: first event with created_at <= until.
      const startIndex = binarySearchDescendingIndexMap(chunk.indexMap, until, view);
      // Find the ending index: first event with created_at < since.
      const endIndex = binarySearchDescendingIndexMap(chunk.indexMap, since, view, true);

      for (let i = startIndex; i < endIndex; i++) {
        // Decode the event from the chunk.
        const { event } = await decodeEvent(chunk.buffer, view, chunk.indexMap[i]);

        // Skip event if it doesn't match the filter.
        if (!matchFilter(filter, event)) continue;

        // Apply special filtering based on metadata tokens if a search is specified.
        let specialOk = true;
        if (filter.search) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

        // Determine if the event passes the search query:
        // If searchQuery is provided, check if event.content includes it (or if a structured filter is used).
        const isStructuredFilter = filter.search && /^[a-zA-Z0-9_-]+:[^ ]/.test(filter.search);
        const passesSearch =
          !searchQuery || isStructuredFilter || event.content.toLowerCase().includes(searchQuery);
        if (!passesSearch) continue;

        // Compute a matching score if searchQuery is present.
        let score = 0;
        if (searchQuery) {
          // Naive scoring: count occurrences of the searchQuery in event.content.
          const content = event.content.toLowerCase();
          let count = 0;
          let pos = content.indexOf(searchQuery);
          while (pos !== -1) {
            count++;
            pos = content.indexOf(searchQuery, pos + searchQuery.length);
          }
          score = count; // You can adjust the scoring algorithm as needed.
        }
        // For events without a search query, score remains 0.
        filterResults.push({ event, score });
      }
    }

    // If a search query was provided, sort by matching score in descending order.
    if (searchQuery) {
      filterResults.sort((a, b) => b.score - a.score);
    }
    // Apply the effective limit after sorting.
    const filteredEvents = filterResults.slice(0, effectiveLimit).map(obj => {
      // Remove metadata property before returning the event.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { metadata, ...eventWithoutMetadata } = obj.event;
      return eventWithoutMetadata;
    });
    finalResults.push(...filteredEvents);
  }

  return finalResults;
};

export { _getEvents };
