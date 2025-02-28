import { Application } from "express";
import { Event } from "nostr-tools";
import { dbBulkInsert, dbDelete, dbSimpleSelect, dbUpdate} from "../database.js";
import { logger } from "../logger.js";
import { MemoryEvent, MetadataEvent, eventStore } from "../../interfaces/relay.js";
import { isModuleEnabled } from "../config.js";
import { compressEvent, decompressEvent, parseSearchTokens } from "./utils.js";
import { safeJSONParse } from "../utils.js";

const expandBuffer = (oldBuffer: SharedArrayBuffer, newSize: number): SharedArrayBuffer => {
  console.warn(`Expanding buffer from ${oldBuffer.byteLength} to ${newSize} bytes`);
  const newBuffer = new SharedArrayBuffer(newSize);
  new Uint8Array(newBuffer).set(new Uint8Array(oldBuffer));
  return newBuffer;
};

const initializeSharedEvents = (events: Event[]): { buffer: SharedArrayBuffer; indexMap: Uint32Array } => {
  let bufferSize = 50 * 1024 * 1024; // 50MB iniciales
  let buffer = new SharedArrayBuffer(bufferSize);
  let view = new DataView(buffer);
  const indexMap = new Uint32Array(events.length);

  let offset = 0;
  // Layout de cada evento:
  // 1. created_at   : 4 bytes
  // 2. índice       : 4 bytes
  // 3. contentSize  : 2 bytes
  // 4. kind         : 4 bytes
  // 5. pubkey       : 32 bytes
  // 6. sig          : 64 bytes
  // 7. id           : 32 bytes
  // 8. tagsSize     : 2 bytes
  // 9. tags         : tagsSize bytes (variable)
  // 10. content     : contentSize bytes (variable)
  // Header fijo = 4+4+2+4+32+64+32+2 = 144 bytes

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    const encodedContent = new TextEncoder().encode(event.content);
    const contentSize = encodedContent.length;

    const encodedTags = new TextEncoder().encode(JSON.stringify(event.tags));
    const tagsSize = encodedTags.length;

    const requiredSize = offset + 144 + tagsSize + contentSize;
    if (requiredSize > buffer.byteLength) {
      bufferSize *= 2;
      buffer = expandBuffer(buffer, bufferSize);
      view = new DataView(buffer);
    }

    // Guarda el offset en el indexMap
    indexMap[i] = offset;

    // 1. created_at (4 bytes)
    view.setInt32(offset, event.created_at, true);
    offset += 4;

    // 2. índice (4 bytes)
    view.setUint32(offset, i, true);
    offset += 4;

    // 3. contentSize (2 bytes)
    view.setUint16(offset, contentSize, true);
    offset += 2;

    // 4. kind (4 bytes)
    view.setInt32(offset, event.kind, true);
    offset += 4;

    // 5. pubkey (32 bytes)
    const pubkeyBytes = Buffer.from(event.pubkey, "hex");
    // 6. sig (64 bytes)
    const sigBytes = Buffer.from(event.sig, "hex");
    // 7. id (32 bytes)
    const idBytes = Buffer.from(event.id, "hex");

    if (pubkeyBytes.length !== 32 || sigBytes.length !== 64 || idBytes.length !== 32) {
      console.error(`initializeSharedEvents - Invalid pubkey, sig or id length for event ${event.id}`);
      continue;
    }

    new Uint8Array(buffer, offset, 32).set(pubkeyBytes);
    offset += 32;
    new Uint8Array(buffer, offset, 64).set(sigBytes);
    offset += 64;
    new Uint8Array(buffer, offset, 32).set(idBytes);
    offset += 32;

    // 8. tagsSize (2 bytes)
    view.setUint16(offset, tagsSize, true);
    offset += 2;

    // 9. tags (variable)
    new Uint8Array(buffer, offset, tagsSize).set(encodedTags);
    offset += tagsSize;

    // 10. content (variable)
    new Uint8Array(buffer, offset, contentSize).set(encodedContent);
    offset += contentSize;
  }

  return { buffer, indexMap };
};


const initEvents = async (app: Application): Promise<boolean> => {

  if (!isModuleEnabled("relay", app)) return false;
  if (eventStore.sharedDB) return false;

  const eventsMap: Map<string, MemoryEvent> = new Map();
  const eventsArray: MetadataEvent[] = [];
  const pending: Map<string, Event> = new Map();
  const pendingDelete: Map<string, Event> = new Map();

  const eventsArray: Event[] = [];
  const loadEvents = async () => {
    try {
      const limit = 10000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        logger.info(`initEvents - Loaded ${eventsMap.size} events from DB`);
        const loadedEvents = await getEventsDB(offset, limit);
        if (loadedEvents.length === 0 || offset > 10000) {
          hasMore = false;
        } else {
          for (let event of loadedEvents) {
            if (event.content.length > 15) event = await compressEvent(event)
            eventsMap.set(event.id, { event: event, processed: true });
            eventsArray.push(event);
          }
          offset += limit;
        }
      }
      eventsArray.sort((a, b) => b.created_at - a.created_at);
      logger.info(`initEvents - Finished loading ${eventsMap.size} events from DB`);

    } catch (error) {
      logger.info(`initEvents - Error loading events: ${error}`);
    } finally {
      eventStore.relayEventsLoaded = true;
    }
  };
  
  await loadEvents();

  const { buffer, indexMap } = initializeSharedEvents(eventsArray);

  eventStore.memoryDB = eventsMap;
  eventStore.sharedDB = buffer;
  eventStore.sharedDBIndexMap = indexMap;
  eventStore.pending = pending;
  eventStore.pendingDelete = pendingDelete;

  return true;

};

const getEventsDB = async (offset: number, limit: number): Promise<MetadataEvent[]> => {

  //   const query = `
  // SELECT
  //   e.event_id,
  //   e.pubkey,
  //   e.kind,
  //   e.created_at,
  //   e.content,
  //   e.sig,
  //   IFNULL(tag_agg.tags, '[]') AS tags,
  //   IFNULL(meta_agg.metadata, '{}') AS metadata
  // FROM (
  //   SELECT *
  //   FROM events
  //   WHERE active = '1'
  //   ORDER BY id DESC
  //   LIMIT ${limit} OFFSET ${offset}
  // ) AS e
  // LEFT JOIN (
  //   SELECT 
  //     event_id,
  //     CONCAT('[', GROUP_CONCAT(
  //       CONCAT(
  //         '["', tag_name, '","', tag_value, '","',
  //         REPLACE(IFNULL(extra_values, ''), '"', '\\\\"'),
  //         '"]'
  //       ) ORDER BY position ASC SEPARATOR ','
  //     ), ']') AS tags
  //   FROM eventtags
  //   GROUP BY event_id
  // ) tag_agg ON e.event_id = tag_agg.event_id
  // LEFT JOIN (
  //   SELECT 
  //     event_id,
  //     CONCAT('{', GROUP_CONCAT(meta_str ORDER BY metadata_type SEPARATOR ','), '}') AS metadata
  //   FROM (
  //     SELECT 
  //       event_id,
  //       metadata_type,
  //       CONCAT(
  //         '"', metadata_type, '":',
  //         '[',
  //           GROUP_CONCAT(CONCAT('"', metadata_value, '"') ORDER BY position ASC SEPARATOR ','),
  //         ']'
  //       ) AS meta_str
  //     FROM eventmetadata
  //     GROUP BY event_id, metadata_type
  //   ) sub
  //   GROUP BY event_id
  // ) meta_agg ON e.event_id = meta_agg.event_id;

  //   `;

  const query = `
        WITH ev AS (
          SELECT *
          FROM events
          WHERE active = '1'
          ORDER BY id DESC
          LIMIT ${limit} OFFSET ${offset}
        ),
        tagAgg AS (
          SELECT 
            event_id,
            JSON_ARRAYAGG(
              JSON_ARRAY(
                tag_name,
                tag_value,
                REPLACE(IFNULL(extra_values, ''), '"', '\\\\"')
              ) ORDER BY position ASC
            ) AS tags
          FROM eventtags
          GROUP BY event_id
        ),
        metaAgg AS (
          SELECT 
            event_id,
            JSON_OBJECTAGG(metadata_type, metadata_values) AS metadata
          FROM (
            SELECT 
              event_id,
              metadata_type,
              JSON_ARRAYAGG(metadata_value ORDER BY position ASC) AS metadata_values
            FROM eventmetadata
            GROUP BY event_id, metadata_type
          ) sub
          GROUP BY event_id
        )
        SELECT
          ev.event_id,
          ev.pubkey,
          ev.kind,
          ev.created_at,
          ev.content,
          ev.sig,
          COALESCE(tagAgg.tags, JSON_ARRAY()) AS tags,
          COALESCE(metaAgg.metadata, JSON_OBJECT()) AS metadata
        FROM ev
        LEFT JOIN tagAgg ON ev.event_id = tagAgg.event_id
        LEFT JOIN metaAgg ON ev.event_id = metaAgg.event_id;


    `;

  const dbResult = await dbSimpleSelect("events", query, "SET SESSION group_concat_max_len = 4194304;");
  if (!dbResult) return [];

  interface EventRow {
    event_id: string;
    pubkey: string;
    kind: number;
    created_at: number;
    content: string;
    sig: string;
    tags?: string;     
    metadata?: string;
  }

  const rows: EventRow[] = JSON.parse(JSON.stringify(dbResult));

  const events: MetadataEvent[] = rows.map((row: EventRow) => ({
    id: row.event_id,
    pubkey: row.pubkey,
    kind: row.kind,
    created_at: row.created_at,
    content: row.content,
    sig: row.sig,
    tags: row.tags ? safeJSONParse(row.tags, []) : [],
    metadata: row.metadata ? safeJSONParse(row.metadata, undefined) : undefined,
  }));

  return events;

};


/**
 * Inserts one or more events (and their tags) into the database using bulk insert.
 * @param {Event | Event[]} eventsInput - Event or array of events to store.
 * @returns {Promise<number>}
 */
const storeEvents = async (eventsInput: MetadataEvent | MetadataEvent[]): Promise<number> => {

    const events: MetadataEvent[] = Array.isArray(eventsInput) ? eventsInput : [eventsInput];
    const filteredEvents  = events.filter(e => e && !(e.kind >= 20000 && e.kind < 30000));
    const eventsToStore = await Promise.all(filteredEvents.map(decompressEvent));

    if (eventsToStore.length === 0) return 0;
  

    const now = Math.floor(Date.now() / 1000);
    const eventValues = eventsToStore.map(e => [
      true,              // active
      false,             // checked
      e.id,              // event_id
      e.pubkey,
      e.kind,
      e.created_at,
      e.content || "",
      e.sig,
      now
    ]);
  
    const eventColumns = [
      "active",
      "checked",
      "event_id",
      "pubkey",
      "kind",
      "created_at",
      "content",
      "sig",
      "received_at"
    ];
  
    const insertedRows = await dbBulkInsert("events", eventColumns, eventValues);
    if (insertedRows !== eventsToStore.length) {
      logger.error(`storeEvents - Failed to insert events. Expected: ${eventsToStore.length}, Inserted: ${insertedRows}`);
    }
  
    // Store tags
    const allTagValues: [string, string, string, number, string | null][] = [];
    eventsToStore.forEach(e => {
      if (e.tags && e.tags.length > 0) {
        e.tags.forEach((tag: string[], index: number) => {
          const tagName = tag[0];
          const tagValue = tag[1] || "";
          const extraValues = tag.slice(2).join(",") || null;
          allTagValues.push([e.id, tagName, tagValue, index, extraValues]);
        });
      }
    });
  
    if (allTagValues.length > 0) {
      const tagColumns = ["event_id", "tag_name", "tag_value", "position", "extra_values"];
      const insertedTagRows = await dbBulkInsert("eventtags", tagColumns, allTagValues);
      if (insertedTagRows !== allTagValues.length) {
        logger.error(`storeEvents - Failed to insert all event tags. Expected: ${allTagValues.length}, Inserted: ${insertedTagRows}`);
      }
    }

    // Store metadata
    const allMetadataValues: [string, string, string, number, string | null, string][] = [];
    eventsToStore.forEach((e : MetadataEvent) => {
      if (e.metadata) {
        Object.entries(e.metadata).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach((val, index) => {
              allMetadataValues.push([e.id, key, val, index, null, e.created_at.toString()]);
            });
          } else if (typeof value === "string") {
            allMetadataValues.push([e.id, key, value, 0, null, e.created_at.toString()]);
          }
        });
      }
    });

    const metadataColumns = ["event_id", "metadata_type", "metadata_value", "position", "extra_data", "created_at"];
    if (allMetadataValues.length > 0) {
        await dbBulkInsert("eventmetadata", metadataColumns, allMetadataValues);
    }
  
    logger.debug(`storeEvents - Bulk inserted events: ${insertedRows}`);
    return insertedRows;
  };

const getEvents = async (
  filters: Filter[],
  relayData: { memoryDB: Map<string, MemoryEvent>; sortedArray: MetadataEvent[] }
): Promise<Event[]> => {
  const now = Math.floor(Date.now() / 1000);
  const allEvents: Event[] = [];
  const maxLimit = app.get("config.relay")["limitation"]["max_limit"];

  for (const filter of filters) {
    const until = filter.until !== undefined ? filter.until : now;
    const since = filter.since !== undefined ? filter.since : 0;
      
    // Si no es búsqueda, se aplica un límite de cantidad.
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
    // Separamos tokens especiales de la búsqueda textual.
    const { plainSearch, specialTokens } = parseSearchTokens(rawSearch);
    const searchQuery = plainSearch.length >= 3 ? plainSearch.toLowerCase() : null;
      
    const startIndex = binarySearchDescending(relayData.sortedArray, until);
    const endIndex = binarySearchDescending(relayData.sortedArray, since, true);
    const candidates = relayData.sortedArray.slice(startIndex, endIndex);
      
    const { search, ...basicFilter } = filter;
    const filtered: { event: MetadataEvent; score: number }[] = [];

    logger.debug(`getEvents - searchQuery: ${searchQuery}, effectiveLimit: ${effectiveLimit}, candidates: ${candidates.length}, search: ${search}`);
      
    for (let e of candidates) {
      if (!matchFilter(basicFilter, e)) continue;

      if (e.content.startsWith("lz:")) { 
        e = await decompressEvent(e) as MetadataEvent;
      }
        
      let score = 0;
      if (searchQuery) {
        const contentLower = e.content.toLowerCase();
        const index = contentLower.indexOf(searchQuery);
        if (index === -1) continue;
        score = index;
      }
      
      // Aplicar filtro especial: si se han definido tokens (por ejemplo, language) y el evento tiene metadata,
      // entonces la propiedad debe existir y coincidir con alguno de los valores solicitados.
      let specialOk = true;
      for (const key in specialTokens) {
        if (!e.metadata || !(key in e.metadata)) {
          specialOk = false;
          break;
        }
        const metaVal = e.metadata[key];
        if (typeof metaVal === "string") {
          if (!specialTokens[key].includes(metaVal.toLowerCase())) {
            specialOk = false;
            break;
          }
        } else if (Array.isArray(metaVal)) {
          const lowerValues = metaVal.map(v => v.toLowerCase());
          if (!specialTokens[key].some(val => lowerValues.includes(val))) {
            specialOk = false;
            break;
          }
        } else {
          specialOk = false;
          break;
        }
      }
      if (!specialOk) continue;

      filtered.push({ event: e as MetadataEvent, score });
      if (!searchQuery && effectiveLimit !== undefined && filtered.length >= effectiveLimit) break;
    }
      
    if (searchQuery) {
      filtered.sort((a, b) => a.score - b.score);
    }
      
    // Obtiene la lista final de eventos para este filtro.
    const eventsForFilter =
      effectiveLimit !== undefined
        ? filtered.slice(0, effectiveLimit).map(item => item.event)
        : filtered.map(item => item.event);
      
    for (const event of eventsForFilter) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { metadata, ...standardEvent } = event;
      allEvents.push(standardEvent as Event);
    }
  }
    
  return allEvents;
};


/**
 * Deletes one or more events from the database and memory.
 * 
 * If `deleteFromDB` is `true`, the events are deleted from the database.
 * If `deleteFromDB` is `false`, the events are marked as inactive in the database.
 * 
 * @param {Event | Event[]} eventsInput - Event or array of events to delete.
 * @param {boolean} [deleteFromDB=false] - If `true`, the events are deleted from the database.
 * @param {string} [comments=""] - Comments to add to the events.
 * @returns {Promise<number>} The number of events deleted.
 */
const deleteEvents = async (eventsInput: Event | Event[], deleteFromDB: boolean = false, comments : string = ""): Promise<number> => {

  const eventsToProcess: Event[] = Array.isArray(eventsInput) ? eventsInput : [eventsInput];
  let affectedCount = 0;

  for (const event of eventsToProcess) {
    let dbResult: boolean | number = false;

    if (deleteFromDB) {
      dbResult = await dbDelete("events", ["event_id"], [event.id]);
    } else {
      dbResult = await dbUpdate("events", { active: "0" }, ["event_id"], [event.id]);
      await dbUpdate("events", { comments: comments }, ["event_id"], [event.id]);
    }

    if (dbResult) {

      affectedCount++;

      eventStore.memoryDB.delete(event.id);
      // const index = eventStore.sortedArray.findIndex((e: Event) => e.id === event.id);
      // if (index !== -1)  eventStore.sortedArray.splice(index, 1);
      if (eventStore.pending) eventStore.pending.delete(event.id);
      if (eventStore.pendingDelete) eventStore.pendingDelete.delete(event.id);

    } else {
      logger.error(`deleteEvents - Failed to delete process event ${event.id}`);
    }
  }

  return affectedCount;
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

export { storeEvents, initEvents, binarySearchCreatedAt, deleteEvents };