import { Application } from "express";
import { Event } from "nostr-tools";
import { dbBulkInsert, dbDelete, dbSimpleSelect, dbUpdate} from "../database.js";
import { logger } from "../logger.js";
import { eventStore, MemoryEvent } from "../../interfaces/relay.js";
import { isModuleEnabled } from "../config.js";
import { compressEvent, decompressEvent, parseEventMetadata } from "./utils.js";

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
        if (loadedEvents.length === 0) {
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


const getEventsDB = async (offset: number, limit: number): Promise<Event[]> => {

    const query = `
        SELECT
            e.event_id,
            e.pubkey,
            e.kind,
            e.created_at,
            e.content,
            e.sig,
            t.tag_name,
            t.tag_value,
            t.extra_values
        FROM (
            SELECT *
            FROM events
            WHERE active = '1'
            ORDER BY id DESC
            LIMIT ${limit} OFFSET ${offset}
        ) AS e
        LEFT JOIN eventtags t ON e.event_id = t.event_id;
    `;

    const dbResult = await dbSimpleSelect("events", query);
    if (!dbResult) return [];

    interface EventRow {
        event_id: string;
        pubkey: string;
        kind: number;
        created_at: number;
        content: string;
        sig: string;
        tag_name?: string;
        tag_value?: string;
        extra_values?: string;
    }

    const eventsMap = new Map<string, Event>();
    const events: EventRow[] = JSON.parse(JSON.stringify(dbResult));

    events.forEach((row: EventRow) => {
        if (!eventsMap.has(row.event_id)) {
            eventsMap.set(row.event_id, {
                id: row.event_id,
                pubkey: row.pubkey,
                kind: row.kind,
                created_at: row.created_at,
                content: row.content,
                tags: [],
                sig: row.sig
            });
        }

        const event = eventsMap.get(row.event_id);
        if (event && row.tag_name) {
            const tag = [row.tag_name, row.tag_value];
            // if (row.extra_values) {
            //     try {
            //         tag.push(...JSON.parse(row.extra_values));
            //     } catch (e) {
            //         logger.error("Error parsing extra_values in eventtags:", e);
            //     }
            // }
            event.tags.push(tag.filter(t => t !== undefined));
        }
    });

    return Array.from(eventsMap.values());
};

/**
 * Inserts one or more events (and their tags) into the database using bulk insert.
 * @param {Event | Event[]} eventsInput - Event or array of events to store.
 * @returns {Promise<number>}
 */
const storeEvents = async (eventsInput: Event | Event[]): Promise<number> => {

    const events: Event[] = Array.isArray(eventsInput) ? eventsInput : [eventsInput];
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
    eventsToStore.forEach(e => {
        const metadata = parseEventMetadata(e);
        allMetadataValues.push(...metadata);
    });

    const metadataColumns = ["event_id", "metadata_type", "metadata_value", "position", "extra_data", "created_at"];

    if (allMetadataValues.length > 0) {
        await dbBulkInsert(
            "eventmetadata",
            metadataColumns,
            allMetadataValues
        );
    }
  
    logger.debug(`storeEvents - Bulk inserted events: ${insertedRows}`);
    return insertedRows;
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