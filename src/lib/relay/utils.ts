import LZString from "lz-string";
import WebSocket from "ws";
import { Event, Filter } from "nostr-tools";
import { NIP01_event, NIP01_Filter } from "../../interfaces/nostr.js";
import { getTextLanguage } from "../language.js";
import { EventIndex, MetadataEvent, RelayEvents, SharedChunk } from "../../interfaces/relay.js";
import crypto from "crypto";

/**
 * Compress an event using LZString
 * @param e Event to compress
 * @returns Compressed event or original if compression is not beneficial
 */
const compressEvent = async (e: Event): Promise<Event> => {
    try {
        if (!e.content) return e;
        const compressed = LZString.compressToBase64(e.content);
        if (!compressed || e.content.length <= compressed.length) return e;
        return { ...e, content: `lz:${compressed}` };
    } catch (error: any) {
        return e;
    }
};

/**
 * Decompress an event using LZString
 * @param e Event to decompress
 * @returns Decompressed event
 */
const decompressEvent = async (e: Event): Promise<Event> => {
    try {
        if (!e.content || !e.content.startsWith('lz:')) return e;
        const decompressed = LZString.decompressFromBase64(e.content.substring(3)) ?? e.content;
        return { ...e, content: decompressed };
    } catch (error: any) {
        return e;
    }
};

/**
 * Parse a relay message using NIP01_event schema
 * @param data Raw data to parse
 * @returns Parsed data or null if parsing fails
 */
const parseRelayMessage = (data: WebSocket.RawData): ReturnType<typeof NIP01_event.safeParse>["data"] | null => {
  try {
    const message = JSON.parse(data.toString());
    const result = NIP01_event.safeParse(message);
    return result.success ? result.data : null;
  } catch {
    return null; 
  }
};


/**
 * Validate a filter object against the NIP01_Filter schema
 * @param filter Filter object to validate
 * @returns True if valid, false otherwise
 */
const validateFilter = (filter: unknown): boolean => {
  try {
    if (!filter || typeof filter !== 'object') return false;
    const result = NIP01_Filter.safeParse(filter);
    if (!result.success) return false;
    if (result.data.since && result.data.until && result.data.since > result.data.until) {
      return false;
    }

    for (const key in result.data) {
      if (key.startsWith('#') && key.length === 2) {
        const tagValues = result.data[key];
        if (Array.isArray(tagValues)) {
          if ((key === '#e' || key === '#p') && 
              !tagValues.every(v => /^[a-f0-9]{64}$/.test(v))) {
            return false;
          }
        }
      }
    }

    return true;
  } catch {
    return false;
  }
};

const parseEventMetadata = async (event: Event): Promise<[string, string, string, number, (string | null), string][]> => {
  const metadata: [string, string, string, number, (string | null), string][] = [];
  let position = 0;
  const now = Math.floor(Date.now() / 1000);

  // Extract language
  if (event.kind === 1 || event.kind === 30023) {
    const eventContent = (await decompressEvent(event)).content || "";
    const eventLanguange = getTextLanguage(eventContent || "");
    if (eventLanguange) {
      metadata.push([event.id, "language", eventLanguange, position, null, now.toString()]);
    }
  }

  return metadata;
};

const fillEventMetadata = async (event: Event): Promise<MetadataEvent> => {
  const metaRows = await parseEventMetadata(event); // Devuelve: [event_id, metadata_type, metadata_value, position, extra_data, created_at][]
  const metaObj: { [key: string]: string | string[] } = {};

  metaRows.forEach(row => {
    const key = row[1];
    const value = row[2];
    if (metaObj[key] === undefined) {
      metaObj[key] = value;
    } else {
      if (Array.isArray(metaObj[key])) {
        if (!metaObj[key].includes(value)) {
          metaObj[key] = [...metaObj[key] as string[], value];
        }
      } else {
        if (metaObj[key] !== value) {
          metaObj[key] = [metaObj[key] as string, value];
        }
      }
    }
  });

  return { ...event, metadata: metaObj };
};


/**
 * Parse search tokens from a search string
 * @param search Search string
 * @returns Parsed tokens and text
 * @example
 * parseSearchTokens("tag:value -tag2:value2")
 */
const parseSearchTokens = (search: string): { plainSearch: string, specialTokens: Record<string, string[]> } => {
  const tokens = search.split(/\s+/);
  let plainSearch = "";
  const specialTokens: Record<string, string[]> = {};
  for (const token of tokens) {
    const m = token.match(/^(-?)(\w+):(.+)$/);
    if (m) {
      const negated = m[1] === "-"; 
      const key = m[2].toLowerCase();
      const value = m[3].toLowerCase();

      if (key === "language" && !negated) {
        specialTokens[key] = specialTokens[key] || [];
        specialTokens[key].push(value);
        continue;
      }
    }
    plainSearch += token + " ";
  }
  return { plainSearch: plainSearch.trim(), specialTokens };
};

/**
 * Decodes an event from the SharedArrayBuffer starting at a given offset.
 * Returns the decoded event along with the new offset after reading.
 *
 * Event layout:
 * 1. created_at    : 4 bytes
 * 2. index         : 4 bytes (not used)
 * 3. contentSize   : 4 bytes
 * 4. kind          : 4 bytes
 * 5. pubkey        : 32 bytes
 * 6. sig           : 64 bytes
 * 7. id            : 32 bytes
 * 8. tagsSize      : 4 bytes
 * 9. tags          : tagsSize bytes (variable, JSON)
 * 10. content      : contentSize bytes (variable, UTF-8)
 * 11. metadataSize : 4 bytes
 * 12. metadata     : metadataSize bytes (variable, JSON)
 *
 * If the content starts with "lz:", it will be decompressed.
 */
const hexTable = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
const textDecoder = new TextDecoder();

const decodeEvent = async (sharedDB: SharedArrayBuffer, view: DataView, offset: number): Promise<{ event: MetadataEvent; newOffset: number }> => {
  const readHexString = (byteLength: number) => {
    const bytes = new Uint8Array(sharedDB, offset, byteLength);
    let hex = '';
    for (let i = 0; i < byteLength; i++) hex += hexTable[bytes[i]];
    offset += byteLength;
    return hex;
  };

  // 1. created_at (4 bytes)
  const created_at = view.getInt32(offset, true);
  offset += 4;

  // 2. index (4 bytes, not used)
  offset += 4;

  // 3. contentSize (4 bytes)
  const contentSize = view.getUint32(offset, true);
  offset += 4;

  // 4. kind (4 bytes)
  const kind = view.getInt32(offset, true);
  offset += 4;

  // 5. pubkey (32 bytes)
  const pubkey = readHexString(32);

  // 6. sig (64 bytes)
  const sig = readHexString(64);

  // 7. id (32 bytes)
  const id = readHexString(32);

  // 8. tagsSize (4 bytes)
  const tagsSize = view.getUint32(offset, true);
  offset += 4;

  // 9. tags (variable)
  const tagsBytes = new Uint8Array(sharedDB, offset, tagsSize);
  let tags: any;
  try {
    tags = JSON.parse(textDecoder.decode(tagsBytes));
  } catch {
    tags = [];
  }
  offset += tagsSize;

  // 10. content (variable)
  const contentBytes = new Uint8Array(sharedDB, offset, contentSize);
  let content = textDecoder.decode(contentBytes);
  offset += contentSize;

  // 11. metadataSize (4 bytes)
  const metadataSize = view.getUint32(offset, true);
  offset += 4;

  // 12. metadata (variable)
  let metadata: any = {};
  if (metadataSize > 0) {
    const metadataBytes = new Uint8Array(sharedDB, offset, metadataSize);
    try {
      metadata = JSON.parse(textDecoder.decode(metadataBytes));
    } catch {
      metadata = {};
    }
    offset += metadataSize;
  }

  let event: MetadataEvent = { created_at, id, kind, pubkey, sig, tags, content, metadata };
  if (content.startsWith("lz:")) {
    event = await decompressEvent(event);
  }

  return { event, newOffset: offset };
};

/**
 * Decodes an event from a shared memory chunk.
 * The event is decoded based on the header information.
 * 
 * @param buffer - SharedArrayBuffer containing the chunk data.
 * @param view - DataView object for the buffer.
 * @param offset - Offset of the event in the buffer.
 * @returns A promise that resolves to the decoded event.
 */
const decodePartialEvent = (chunk: SharedChunk): { offset: number, header: { created_at: number, kind: number, pubkey: string, id: string } }[] => {
  const headers = [];
  const view = new DataView(chunk.buffer);
  for (let i = 0; i < chunk.indexMap.length; i++) {
    const baseOffset = chunk.indexMap[i];
    const created_at = view.getInt32(baseOffset, true);
    const kind = view.getInt32(baseOffset + 12, true);
    const pubkeyBytes = new Uint8Array(chunk.buffer, baseOffset + 16, 32);
    const pubkey = Array.from(pubkeyBytes).map(b => b.toString(16).padStart(2, "0")).join("");
    const idBytes = new Uint8Array(chunk.buffer, baseOffset + 112, 32);
    const id = Array.from(idBytes).map(b => b.toString(16).padStart(2, "0")).join("");
    headers.push({ offset: baseOffset, header: { created_at, kind, pubkey, id } });
  }
  return headers;
};


/**
 * Encodes a single event into the SharedArrayBuffer starting at the given offset.
 * Returns the new offset after writing the event.
 *
 * Event layout:
 * 1. created_at    : 4 bytes
 * 2. index         : 4 bytes (provided as a parameter)
 * 3. contentSize   : 4 bytes
 * 4. kind          : 4 bytes
 * 5. pubkey        : 32 bytes
 * 6. sig           : 64 bytes
 * 7. id            : 32 bytes
 * 8. tagsSize      : 4 bytes
 * 9. tags          : tagsSize bytes (variable, JSON)
 * 10. content      : contentSize bytes (variable, UTF-8)
 * 11. metadataSize : 4 bytes
 * 12. metadata     : metadataSize bytes (variable, JSON)
 *
 * Note: It is assumed that the buffer has enough space.
 */
const encodeEvent = async (event: MetadataEvent, view: DataView, buffer: SharedArrayBuffer, offset: number, index: number): Promise<number> => {

  // Encode content and tags as UTF-8/JSON.
  const encodedContent = new TextEncoder().encode(event.content);
  const contentSize = encodedContent.length;

  const encodedTags = new TextEncoder().encode(JSON.stringify(event.tags));
  const tagsSize = encodedTags.length;

  const encodedMetadata = event.metadata
    ? new TextEncoder().encode(JSON.stringify(event.metadata))
    : new Uint8Array(0);
  const metadataSize = encodedMetadata.length;

  // 1. Write created_at (4 bytes)
  view.setInt32(offset, event.created_at, true);
  offset += 4;

  // 2. Write index (4 bytes)
  view.setUint32(offset, index, true);
  offset += 4;

  // 3. Write contentSize (4 bytes)
  view.setUint32(offset, contentSize, true);
  offset += 4;

  // 4. Write kind (4 bytes)
  view.setInt32(offset, event.kind, true);
  offset += 4;

  // 5. Write pubkey (32 bytes)
  const pubkeyBytes = Buffer.from(event.pubkey, "hex");
  
  // 6. Write sig (64 bytes)
  const sigBytes = Buffer.from(event.sig, "hex");

  // 7. Write id (32 bytes)
  const idBytes = Buffer.from(event.id, "hex");

  if (pubkeyBytes.length !== 32 || sigBytes.length !== 64 || idBytes.length !== 32) {
    console.error(`encodeEvent - Invalid pubkey, sig or id length for event ${event.id}`);
    return offset;
  }

  new Uint8Array(buffer, offset, 32).set(pubkeyBytes);
  offset += 32;
  new Uint8Array(buffer, offset, 64).set(sigBytes);
  offset += 64;
  new Uint8Array(buffer, offset, 32).set(idBytes);
  offset += 32;

  // 8. Write tagsSize (4 bytes)
  view.setUint32(offset, tagsSize, true);
  offset += 4;

  // 9. Write tags (variable)
  new Uint8Array(buffer, offset, tagsSize).set(encodedTags);
  offset += tagsSize;

  // 10. Write content (variable)
  new Uint8Array(buffer, offset, contentSize).set(encodedContent);
  offset += contentSize;

  // 11. Write metadataSize (4 bytes)
  view.setUint32(offset, metadataSize, true);
  offset += 4;

  // 12. Write metadata (variable)
  new Uint8Array(buffer, offset, metadataSize).set(encodedMetadata);
  offset += metadataSize;

  return offset;
};

/**
 * Binary search for the index of the first element in indexMap that is less than the target.
 * @param indexMap - The index map containing offsets.
 * @param target - The target timestamp.
 * @param view - DataView of the shared buffer.
 * @param strict - If true, uses a strict comparison.
 * @returns The index in the indexMap.
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

/**
 * Returns the index where an event should be inserted in a sorted array.
 * 
 * This function performs a binary search on a sorted array of events and returns the index
 * at which a new event should be inserted to maintain the order of the array.
 * using the `created_at` timestamp as the sorting criterion.
 * 
 * @param {Event[]} arr - The sorted array of events.
 * @param {number} target - The timestamp to compare against.
 * @returns {number}
*/
const binarySearchCreatedAt = (arr: Event[], target: number): number => {
  let low = 0;
  let high = arr.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (arr[mid].created_at < target) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}



const expandBuffer = (oldBuffer: SharedArrayBuffer, newSize: number): SharedArrayBuffer => {
  const newBuffer = new SharedArrayBuffer(newSize);
  new Uint8Array(newBuffer).set(new Uint8Array(oldBuffer));
  return newBuffer;
};

const encodeEvents = async (events: MetadataEvent[]): Promise<{ buffer: SharedArrayBuffer; indexMap: Uint32Array; usedBytes: number }> => {
  const estimatedSize = Math.max(1 * 1024 * 1024, events.length * 1024);
  let bufferSize = estimatedSize; 
  let buffer = new SharedArrayBuffer(bufferSize);
  let view = new DataView(buffer);
  const indexMap = new Uint32Array(events.length);
  let offset = 0;

  // Fixed header size is 152 bytes (for the fixed-length fields)
  for (let i = 0; i < events.length; i++) {
    let event = events[i];

    if (event.content.length > 15) {
      event = await compressEvent(event);
    }

    // Encode sizes and calculate requiredSize
    const encodedContent = new TextEncoder().encode(event.content);
    const contentSize = encodedContent.length;

    const encodedTags = new TextEncoder().encode(JSON.stringify(event.tags));
    const tagsSize = encodedTags.length;

    const encodedMetadata = event.metadata
      ? new TextEncoder().encode(JSON.stringify(event.metadata))
      : new Uint8Array(0);
    const metadataSize = encodedMetadata.length;

    const requiredSize = offset + 152 + tagsSize + contentSize + metadataSize;
    if (requiredSize > buffer.byteLength) {
      bufferSize = Math.ceil(requiredSize * 1.2);
      buffer = expandBuffer(buffer, bufferSize);
      view = new DataView(buffer);
    }

    indexMap[i] = offset;
    offset = await encodeEvent(event, view, buffer, offset, i);
  }

  if (offset < buffer.byteLength * 0.8) { 
    const compactBuffer = new SharedArrayBuffer(offset);
    new Uint8Array(compactBuffer).set(new Uint8Array(buffer, 0, offset));
    buffer = compactBuffer;
  }

  return { buffer, indexMap, usedBytes: offset }; 

};

/**
 * Encode an array of MetadataEvent objects into a shared memory chunk.
 * This function sorts the events by created_at timestamp in descending order,
 * encodes the events into a shared memory buffer, and generates an index map
 * to quickly locate each event in the buffer.
 *
 * @param events - The array of MetadataEvent objects to encode.
 * @returns A SharedChunk object containing the encoded events and index map.
 */
const encodeChunk = async (events: MetadataEvent[]): Promise<SharedChunk> => {
  if (events.length === 0) {
    return { buffer: new SharedArrayBuffer(0), indexMap: new Uint32Array(0), timeRange: { min: 0, max: 0 }, usedBytes: 0 };
  }
  events.sort((a, b) => b.created_at - a.created_at);
  const { buffer, indexMap, usedBytes } = await encodeEvents(events);
  const newTimeRange = {
    max: events[0].created_at,
    min: events[events.length - 1].created_at,
  };
  return { buffer, indexMap, timeRange: newTimeRange, usedBytes };
}

/**
 * Decode all events from a shared memory chunk.
 * This function reverses the process of encodeChunk/encodeEvents,
 * returning an array of MetadataEvent from the given chunk.
 *
 * @param chunk - The shared memory chunk to decode.
 * @returns A Promise that resolves to an array of decoded MetadataEvent objects.
 */
const decodeChunk = async (chunk: SharedChunk): Promise<MetadataEvent[]> => {
  console.time('decodeChunk');
  const events: MetadataEvent[] = [];
  const view = new DataView(chunk.buffer);
  for (let i = 0; i < chunk.indexMap.length; i++) {
    const { event } = await decodeEvent(chunk.buffer, view, chunk.indexMap[i]);
    events.push(event);
  }
  console.timeEnd('decodeChunk');
  return events;
};


/**
 * Retrieves an event by its ID from the event index.
 * This function looks up an event by its ID in the event index,
 * returning the event if found, or null if not found.
 *
 * @param id - The ID of the event to retrieve.
 * @returns A Promise that resolves to the Event object, or null if not found.
 */
const getEventById = async (id: string, eventStore : RelayEvents): Promise<Event | null> => {
  const indexEntry = eventStore.eventIndex.get(id);
  if (!indexEntry) return null;
  
  const chunk = eventStore.sharedDBChunks[indexEntry.chunkIndex];
  if (!chunk) return null;

  const position = indexEntry.position;
  if (position >= chunk.indexMap.length) return null;
  
  const view = new DataView(chunk.buffer);
  const offset = chunk.indexMap[position];
  const { event } = await decodeEvent(chunk.buffer, view, offset);
  
  if (event.id !== id) {
    return null;
  }
  
  return event;
};

/**
 * Retrieves events from the event store by a time range.
 * This function retrieves all events from the event store that fall within
 * the specified time range, optionally filtering by a custom filter function.
 *
 * @param startTime - The start of the time range.
 * @param endTime - The end of the time range.
 * @param eventStore - The event store containing the events.
 * @param filter - An optional filter function to apply to each event.
 * @returns A Promise that resolves to an array of Event objects.
 */
const getEventsByTimerange = async (startTime: number, endTime: number, eventStore: RelayEvents, filter?: (entry: EventIndex) => boolean): Promise<Event[]> => {
  const matchingEntries: [string, EventIndex][] = Array.from(eventStore.eventIndex.entries())
    .filter(([_, entry]) => 
      entry.created_at >= startTime && 
      entry.created_at <= endTime && 
      (!filter || filter(entry))
    );
  
  if (matchingEntries.length === 0) return [];
  
  const entriesByChunk = new Map<number, {position: number, id: string}[]>();
  
  for (const [id, entry] of matchingEntries) {
    if (!entriesByChunk.has(entry.chunkIndex)) {
      entriesByChunk.set(entry.chunkIndex, []);
    }
    entriesByChunk.get(entry.chunkIndex)!.push({
      position: entry.position,
      id
    });
  }
  
  const results: Event[] = [];
  
  await Promise.all(Array.from(entriesByChunk.entries()).map(async ([chunkIndex, entries]) => {
    const chunk = eventStore.sharedDBChunks[chunkIndex];
    if (!chunk) return;
    
    const view = new DataView(chunk.buffer);
    
    for (const entry of entries) {
      if (entry.position >= chunk.indexMap.length) continue;
      
      try {
        const { event } = await decodeEvent(chunk.buffer, view, chunk.indexMap[entry.position]);
        const { metadata, ...eventWithoutMetadata } = event;
        results.push(eventWithoutMetadata);
      } catch (error) {
        console.error(`Error decodificando evento en chunk ${chunkIndex}, posición ${entry.position}:`, error);
      }
    }
  }));
  
  return results;
};

/**
 * Discard events based on the provided filters.
 * This function discards events early based on the provided filters,
 * returning true if the event should be discarded, or false if it should be included.
 *
 * @param filters - The filters to apply.
 * @param eventStore - The event store containing the events.
 * @returns True if the event should be discarded, false if it should be included.
 */
const filterEarlyDiscard = (filters: Filter[], eventStore: RelayEvents): boolean => {
  let discard = false;
  for (const filter of filters) {
    if (filter.ids?.length) {
      discard = true;
      if (filter.ids.some(id => eventStore.globalIds.has(id))) {
        return false; 
      }
    }
    if (filter.authors?.length) {
      discard = true;
      if (filter.authors.some(author => eventStore.globalPubkeys.has(author))) {
        return false; 
      }
    }
  }
  return discard;
};

/**
 * Get the size of a shared memory chunk.
 * This function calculates the size of a shared memory chunk in bytes,
 * including the size of the buffer, index map, and overhead.
 * 
 * @param chunk - The shared memory chunk to measure.
 * @returns An object containing the size of the chunk in bytes, KB, and MB.
 */
function getChunkSize(chunk: SharedChunk) {
  const bufferSize = chunk.usedBytes || chunk.buffer.byteLength;
  const indexMapSize = chunk.indexMap.length * 4;
  const overheadSize = 100; 
  
  return {
    bufferBytes: bufferSize,
    indexMapBytes: indexMapSize,
    totalBytes: bufferSize + indexMapSize + overheadSize,
    totalKB: Math.round((bufferSize + indexMapSize + overheadSize) / 1024),
    totalMB: Math.round((bufferSize + indexMapSize + overheadSize) / 1024 / 1024),
    eventsCount: chunk.indexMap.length,
    bufferUtilization: chunk.usedBytes ? 
      `${(chunk.usedBytes / chunk.buffer.byteLength * 100).toFixed(1)}%` : 
      'Unknown'
  };
}

/**
 * Creates a stable hash for a filter to detect duplicates.
 */
const createFilterHash = (filter: Filter): string => {
  const normalized: any = {};
  let timeBucket = 60; 

  if (filter.since !== undefined && filter.until !== undefined) {
    const range = filter.until - filter.since;
    if (range > 30 * 86400) { // 30 days
      timeBucket = 172800;  // 2 day
    } else if (range > 7 * 86400) { // 7 days
      timeBucket = 40320 ; // 11.2 hours
    } else if (range > 2 * 86400) { // 2 days
      timeBucket = 11520; // 3.2 hours
    } else if (range > 12 * 3600) { // 12 hours
      timeBucket = 2880 ; // 48 minutes
    } else if (range > 2 * 3600) { // 2 hours
      timeBucket = 480 ; // 8 minutes
    } else if (range > 3600) { // 1 hour
      timeBucket = 240 ; // 4 minutes
    } else {
      timeBucket = 60; // 1 minute
    }
  }

  // Adjust time bucket for search queries 50% more.
  if (filter.search) {
    timeBucket = Math.floor(timeBucket * 1.5);
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
    const authorsString = filter.authors.sort().join(',');
    normalized.authors = crypto.createHash('sha256').update(authorsString).digest('hex');
  }
  
  if (filter.ids) {
    const idsString = [...filter.ids].sort().join(',');
    normalized.ids = crypto.createHash('sha256').update(idsString).digest('hex');
  }

  for (const key in filter) {
    if (key.startsWith('#') && Array.isArray(filter[key as keyof Filter])) {
      const values = [...(filter[key as keyof Filter] as string[])].sort().join(',');
      normalized[key] = crypto.createHash('sha256').update(values).digest('hex');
    }
  }

  if (filter.search) {
    normalized.search = filter.search.toLowerCase().trim();
  }

  // Generate final hash
  const normalizedString = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(normalizedString).digest('hex');
};


const dynamicTimeout = (filters: Filter[], isHeavy: boolean, lightQueueLength: number, heavyQueueLength: number) : number => {
   
    let timeout = isHeavy ? 1500 : 500;
    
    if (isHeavy && heavyQueueLength > 10) {
      timeout = Math.max(50, timeout - (heavyQueueLength * 25));
    } else if (!isHeavy && lightQueueLength > 20) {
      timeout = Math.max(25, timeout - (lightQueueLength * 5));
    }
    
    const hasSpecificIds: boolean = filters.some((f: Filter) => f.ids && f.ids.length > 0);
    const hasSpecificAuthors: boolean = filters.some((f: Filter) => f.authors && f.authors.length > 0 && f.authors.length < 5);
    
    if (hasSpecificIds || hasSpecificAuthors) {
      timeout *= 1.3; 
    }
    
    timeout = Math.min(timeout, isHeavy ? 1500 : 500);
    return timeout;
}

export {  compressEvent, 
          decompressEvent, 
          parseRelayMessage, 
          parseEventMetadata, 
          parseSearchTokens, 
          fillEventMetadata, 
          binarySearchDescendingIndexMap,
          binarySearchCreatedAt, 
          encodeChunk,
          decodeChunk, 
          getEventById, 
          getEventsByTimerange,
          validateFilter,
          getChunkSize,
          decodeEvent, 
          decodePartialEvent,
          filterEarlyDiscard,
          createFilterHash,
          dynamicTimeout
        };
