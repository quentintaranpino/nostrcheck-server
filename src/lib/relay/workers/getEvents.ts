import { Event, Filter, matchFilter } from "nostr-tools";
import { decompressEvent } from "../utils.js";
import workerpool from 'workerpool';

const _getEvents = async (filters: Filter[], maxLimit: number, sharedDB : SharedArrayBuffer, indexMap: Uint32Array): Promise<Event[]> => {

  if (!sharedDB || !indexMap) {
    console.warn("_getEvents - sharedDB or indexMap is not initialized");
    return [];
  }

  const view = new DataView(sharedDB);
  const allEvents: Event[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (const filter of filters) {
    const until = filter.until !== undefined ? filter.until : now;
    const since = filter.since !== undefined ? filter.since : 0;
  
    let effectiveLimit = filter.limit;
    const isSearch = filter.search && filter.search.trim().length >= 3;
    if (!isSearch) {
      effectiveLimit = effectiveLimit !== undefined ? Math.min(effectiveLimit, maxLimit) : maxLimit;
    }
  
    const rawSearch = filter.search ? filter.search.trim() : "";
    const searchQuery = rawSearch.length >= 3 ? rawSearch.toLowerCase() : null;
  
    const startIndex = binarySearchDescendingIndexMap(indexMap, until, view);
    const endIndex = binarySearchDescendingIndexMap(indexMap, since, view, true);
  
    for (let i = startIndex; i < endIndex; i++) {
      const offset = indexMap[i];
    
      // 1. created_at (4 bytes)
      const created_at = view.getInt32(offset, true);
    
      // 2. índice (4 bytes, no se usa)
      // const indexVal = view.getUint32(offset + 4, true);
    
      // 3. contentSize (2 bytes)
      const contentSize = view.getUint16(offset + 8, true);
    
      // 4. kind (4 bytes)
      const kind = view.getInt32(offset + 10, true);
    
      // 5. pubkey: 32 bytes → convertir a hexadecimal
      const pubkeyBytes = new Uint8Array(sharedDB, offset + 14, 32);
      const pubkey = Array.from(pubkeyBytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
    
      // 6. sig: 64 bytes → convertir a hexadecimal
      const sigBytes = new Uint8Array(sharedDB, offset + 46, 64);
      const sig = Array.from(sigBytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
    
      // 7. id: 32 bytes → convertir a hexadecimal
      const idBytes = new Uint8Array(sharedDB, offset + 110, 32);
      const id = Array.from(idBytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
    
      // 8. tagsSize: 2 bytes
      const tagsSize = view.getUint16(offset + 142, true);
    
      // 9. tags: leer tagsSize bytes y parsear el JSON
      const tagsBytes = new Uint8Array(sharedDB, offset + 144, tagsSize);
      let tags: any;
      try {
        tags = JSON.parse(new TextDecoder().decode(tagsBytes));
      } catch (err) {
        console.error("Error al parsear tags:", err);
        tags = [];
      }
    
      // 10. content: leer contentSize bytes
      const contentBytes = new Uint8Array(sharedDB, offset + 144 + tagsSize, contentSize);
      const content = new TextDecoder().decode(contentBytes);
    
      // Reconstruir el objeto evento
      let event: Event = { created_at, id, kind, pubkey, sig, tags, content };

      event = await decompressEvent(event);
    
      if (!matchFilter(filter, event)) continue;
    
      if (event.content.startsWith("lz:")) {
        event = await decompressEvent(event);
      }
    
      if (!searchQuery) {
        allEvents.push(event);
      } else {
        const contentLower = event.content.toLowerCase();
        const idx = contentLower.indexOf(searchQuery);
        if (idx !== -1) allEvents.push(event);
      }
    
      if (!searchQuery && effectiveLimit !== undefined && allEvents.length >= effectiveLimit) break;
    }
    
  }

  return allEvents;
};
  
/**
 * Binary search for the index of the first element in the indexMap that is less than target
 * @param indexMap
 * @param target
 * @param view
 * @param strict
 * @returns
 */
const binarySearchDescendingIndexMap = (
  indexMap: Uint32Array,
  target: number,
  view: DataView,
  strict = false
): number => {
  let low = 0;
  let high = indexMap.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const offset = indexMap[mid];
    const created_at = view.getInt32(offset, true);

    if (strict ? created_at >= target : created_at > target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
};

workerpool.worker({_getEvents: _getEvents});

export { _getEvents };