import { Application } from "express";
import { Event } from "nostr-tools";
import { dbBulkInsert, dbDelete, dbSimpleSelect, dbUpdate} from "../database.js";
import { logger } from "../logger.js";
import { CHUNK_SIZE, EventIndex, MetadataEvent, eventStore } from "../../interfaces/relay.js";
import { isModuleEnabled } from "../config.js";
import { decompressEvent, encodeChunk } from "./utils.js";
import { safeJSONParse } from "../utils.js";

const initEvents = async (app: Application): Promise<boolean> => {
  if (!isModuleEnabled("relay", app)) return false;
  if (eventStore.sharedDBChunks && eventStore.sharedDBChunks.length > 0) return false;

  const eventIndex: Map<string, EventIndex> = new Map();
  const pending: Map<string, Event> = new Map();
  const pendingDelete: Map<string, Event> = new Map();
  eventStore.pending = pending;
  eventStore.pendingDelete = pendingDelete;
  eventStore.sharedDBChunks = [];
  eventStore.eventIndex = eventIndex;

  let offset = 0;

  (async function loadBatch() {
    try {
      while (true) {
        logger.info(`initEvents - Loaded ${eventIndex.size} events from DB (offset: ${offset})`);
        const loadedEvents = await getEventsDB(offset, CHUNK_SIZE);
        if (loadedEvents.length === 0) {
          eventStore.relayEventsLoaded = true;
          logger.info(`initEvents - Finished loading ${eventIndex.size} events in ${eventStore.sharedDBChunks.length} chunks from DB`);
          break;
        } else {
          const batchEvents: MetadataEvent[] = [];
          for (const event of loadedEvents) {
            batchEvents.push(event);
          }
          
          // Generate a new chunk and add it to the sharedDBChunks array and memoryDB map.
          const newChunk = await encodeChunk(batchEvents);
          const chunkIndex = eventStore.sharedDBChunks.length;
          eventStore.sharedDBChunks.push(newChunk);

          // Add the events to the eventIndex map.
          for (let i = 0; i < batchEvents.length; i++) {
            const event = batchEvents[i];
            const expirationTag = event.tags.find(tag => tag[0] === "expiration");
            const expiration = expirationTag ? Number(expirationTag[1]) : undefined;
            eventIndex.set(event.id, {
              id: event.id,
              chunkIndex, 
              position: i,
              processed: true,
              created_at: event.created_at,
              kind: event.kind,
              pubkey: event.pubkey,
              expiration: expiration,
            });

            eventStore.globalIds.add(event.id);
            if (event.pubkey) {
              eventStore.globalPubkeys.add(event.pubkey);
            }
            if (expiration !== undefined) {
              eventStore.globalExpirable.add(event.id);
            }
          }

          offset += CHUNK_SIZE;

          // Yield control to the event loop to avoid blocking.
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    } catch (error) {
      logger.error(`initEvents - Error loading events: ${error}`);
    }
  })().catch(err => logger.error("initEvents background load error:", err));

  // Return immediately while the loadBatch runs in the background.
  return true;
};

const getEventsDB = async (offset: number, limit: number): Promise<MetadataEvent[]> => {

  const query = `
        WITH ev AS (
          SELECT *
          FROM events
          WHERE active = '1'
          ORDER BY created_at DESC, id DESC
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

  const dbResult = await dbSimpleSelect("events", query, "SET SESSION group_concat_max_len = 8388608;");
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
const deleteEvents = async (eventsInput: MetadataEvent | MetadataEvent[], deleteFromDB: boolean = false, comments : string = ""): Promise<number> => {

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

      eventStore.eventIndex.delete(event.id);
      eventStore.pending.delete(event.id);
      eventStore.pendingDelete.delete(event.id);
      eventStore.globalIds.delete(event.id);
      eventStore.globalPubkeys.delete(event.pubkey);
      eventStore.globalExpirable.delete(event.id);

    } else {
      logger.error(`deleteEvents - Failed to delete process event ${event.id}`);
    }
  }

  return affectedCount;
};

export { storeEvents, initEvents, deleteEvents };