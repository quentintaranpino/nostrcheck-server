import { Event, Filter, matchFilter } from "nostr-tools";
import { decompressEvent } from "../utils.js";
import workerpool from 'workerpool';

const _getEvents = async (filters: Filter[], sortedArray: Event[], maxLimit: number ): Promise<Event[]> => {

    const now = Math.floor(Date.now() / 1000);
    const allEvents: Event[] = [];
  
    for (const filter of filters) {
      const until = filter.until !== undefined ? filter.until : now;
      const since = filter.since !== undefined ? filter.since : 0;
      
      // If is a search query, we don't apply the limit
      let effectiveLimit = filter.limit;
      const isSearch = filter.search && filter.search.trim().length >= 3;
      if (!isSearch) {
        if (effectiveLimit === undefined) {
          effectiveLimit = maxLimit;
        } else if (effectiveLimit > maxLimit) {
          effectiveLimit = maxLimit;
        }
      }
      
      const rawSearch = filter.search ? filter.search.trim() : "";
      const searchQuery = rawSearch.length >= 3 ? rawSearch.toLowerCase() : null;
      const startIndex = binarySearchDescending(sortedArray, until);
      const endIndex = binarySearchDescending(sortedArray, since, true);
      const candidates = sortedArray.slice(startIndex, endIndex);
      
      const { search, ...basicFilter } = filter;
      const filtered: { event: Event; score: number }[] = [];

      for (let e of candidates) {
        if (!matchFilter(basicFilter, e)) continue;

        if (e.content.startsWith("lz:")) { e = await decompressEvent(e); }
        
        if (!searchQuery) {
          filtered.push({ event: e, score: 0 });
        } else {
          const contentLower = e.content.toLowerCase();
          const index = contentLower.indexOf(searchQuery);
          if (index !== -1) filtered.push({ event: e, score: index });
        }
        
        // If we have reached the limit, we stop (if it's not a search query)
        if (!searchQuery && effectiveLimit !== undefined && filtered.length >= effectiveLimit) break;
      }
      
      if (searchQuery) filtered.sort((a, b) => a.score - b.score);
      
      // Obtain the events from the filtered list
      const eventsForFilter =
        effectiveLimit !== undefined
          ? filtered.slice(0, effectiveLimit).map((item) => item.event)
          : filtered.map((item) => item.event);
      
      for (const event of eventsForFilter) {
        allEvents.push(event);
      }
      
    }
    
    return allEvents;
};

  
/**
 * Performs a binary search on a descendingly sorted array of events (sorted by `created_at`)
 * and returns the index of the first element that meets the comparison condition with the target timestamp.
 *
 * In non-strict mode (default), it returns the index of the first event whose `created_at` is less than or equal
 * to the target value. In strict mode, it returns the index of the first event whose `created_at` is strictly
 * less than the target value.
 *
 * @param {Event[]} arr - Array of events sorted in descending order by `created_at`.
 * @param {number} target - The target timestamp for comparison.
 * @param {boolean} [strict=false] - If `true`, the search is strict (looking for the first element with `created_at` < target).
 *                                   If `false`, it looks for the first element with `created_at` <= target.
 * @returns {number} The index of the first event that meets the comparison condition.
 */
function binarySearchDescending(arr: Event[], target: number, strict: boolean = false): number {
  let low = 0;
  let high = arr.length;
  while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (strict ? arr[mid].created_at >= target : arr[mid].created_at > target) {
          low = mid + 1;
      } else {
          high = mid;
      }
  }
  return low;
}

workerpool.worker({_getEvents: _getEvents});

export { _getEvents };