import { Event, Filter } from "nostr-tools";
import { ResultSetHeader } from "mysql2/promise";
import { connect, dbBulkInsert, dbDelete, dbSimpleSelect, dbUpdate} from "../database/core.js";
import { logger } from "../logger.js";
import { CHUNK_SIZE, EventIndex, MetadataEvent, eventStore } from "../../interfaces/relay.js";
import { decompressEvent, encodeChunk } from "./utils.js";
import { createSlots, safeJSONParse, Slots } from "../utils.js";
import { getConfig, isModuleEnabled } from "../config/core.js";
import { isReplaceable } from "../nostr/NIP01.js";

/**
 * created_at below which events live only in the DB: now minus relay.memoryDays, or 0
 * (everything in memory) when memoryDays is 0.
 */
const getMemoryHorizon = (): number => {
  const memoryDays = Number(getConfig(null, ["relay", "memoryDays"]));
  return memoryDays > 0 ? Math.floor(Date.now() / 1000) - memoryDays * 86400 : 0;
};

/**
 * Remembers a replaceable event by pubkey + kind, so handleEvent finds the stored version
 * without walking the whole eventIndex. Ids that leave eventIndex are pruned on lookup.
 */
const indexReplaceable = (id: string, pubkey: string, kind: number) => {
  if (!isReplaceable(kind)) return;
  const key = `${pubkey}:${kind}`;
  let ids = eventStore.replaceableIndex.get(key);
  if (!ids) {
    ids = new Set();
    eventStore.replaceableIndex.set(key, ids);
  }
  ids.add(id);
};

/**
 * Ids of the replaceable events of a pubkey + kind still in eventIndex.
 */
const getReplaceableIds = (pubkey: string, kind: number): string[] => {
  const key = `${pubkey}:${kind}`;
  const ids = eventStore.replaceableIndex.get(key);
  if (!ids) return [];
  for (const id of ids) {
    if (!eventStore.eventIndex.has(id)) ids.delete(id);
  }
  if (ids.size === 0) eventStore.replaceableIndex.delete(key);
  return Array.from(ids);
};

const initEvents = async (): Promise<boolean> => {
  if (!isModuleEnabled("relay", "")) return false;
  if (eventStore.sharedDBChunks && eventStore.sharedDBChunks.length > 0) return false;

  const eventIndex: Map<string, EventIndex> = new Map();
  const pending: Map<string, MetadataEvent> = new Map();
  const pendingDelete: Map<string, MetadataEvent> = new Map();
  eventStore.pending = pending;
  eventStore.pendingDelete = pendingDelete;
  eventStore.sharedDBChunks = [];
  eventStore.eventIndex = eventIndex;

  // Only the last N days live in memory; older events are read from the DB on demand.
  eventStore.memoryHorizon = getMemoryHorizon();

  let offset = 0;

  (async function loadBatch() {
    try {
      let lastCreatedAt: number | null = null;
      let lastId: string | null = null;
      while (true) {
        logger.debug(`initEvents - Loaded ${eventIndex.size} events from DB (offset: ${offset})`);
        const loadedEvents = await getEventsDB(lastCreatedAt, lastId, CHUNK_SIZE, eventStore.memoryHorizon);
        if (loadedEvents.length === 0 ) {
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

          // Set isActive to true for the first chunk (the newest chunk).
          if (offset === 0) {
            newChunk.isActive = true;
          }

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
              tenantid: event.tenantid,
            });

            indexReplaceable(event.id, event.pubkey, event.kind);
            eventStore.globalIds.add(event.id);
            if (event.pubkey) {
              eventStore.globalPubkeys.add(event.pubkey);
            }
            if (expiration !== undefined) {
              eventStore.globalExpirable.add(event.id);
            }
          }

          offset += CHUNK_SIZE;
          const tail = loadedEvents[loadedEvents.length - 1];
          lastCreatedAt = tail.created_at;
          lastId = tail.id;

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

const isU32 = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 0xFFFFFFFF;
const isHex64 = (s: unknown) => typeof s === "string" && /^[a-f0-9]{64}$/i.test(s);

const getEventsDB = async (lastCreatedAt: number | null, lastEventId: string | null, limit: number, minCreatedAt: number = 0): Promise<MetadataEvent[]> => {

  const safeLimit = Number.isInteger(limit) && limit! > 0 ? Math.min(limit, 100000) : 10000;

  let cursorWhere = "";
  const cursorParams: (string | number)[] = [];
  if (lastCreatedAt != null && isU32(lastCreatedAt)) {
    if (lastEventId && isHex64(lastEventId)) {
      cursorWhere = `
        AND (
          e.created_at < ?
          OR (e.created_at = ? AND e.event_id < ?)
        )`;
      cursorParams.push(lastCreatedAt, lastCreatedAt, lastEventId);
    } else {
      cursorWhere = `AND e.created_at < ?`;
      cursorParams.push(lastCreatedAt);
    }
  }
  if (minCreatedAt > 0 && isU32(minCreatedAt)) {
    cursorWhere += ` AND e.created_at >= ?`;
    cursorParams.push(minCreatedAt);
  }

  return selectEventsDB(cursorWhere, cursorParams, safeLimit);
};

/**
 * Runs the events + tags + metadata aggregation for a WHERE fragment over `events e`.
 * group_concat_max_len is set on the statement itself: a SET SESSION before it may land
 * on another pooled connection, and JSON_ARRAYAGG then truncates the tags at 1 MB.
 */
const selectEventsDB = async (where: string, params: (string | number)[], limit: number, maxStatementSeconds: number = 0): Promise<MetadataEvent[]> => {

  const statementVars = ["group_concat_max_len = 8388608"];
  if (maxStatementSeconds > 0) statementVars.push(`max_statement_time = ${Number(maxStatementSeconds)}`);

  const query = `
    SET STATEMENT ${statementVars.join(", ")} FOR
    WITH ev AS (
      SELECT e.event_id, e.pubkey, e.kind, e.created_at, e.content, e.sig, e.tenantid
      FROM events e
      WHERE e.active = '1'
      ${where}
      ORDER BY e.created_at DESC, e.event_id DESC
      LIMIT ${Number(limit)}
    ),
    tagAgg AS (
      SELECT et.event_id,
             JSON_ARRAYAGG(JSON_ARRAY(et.tag_name, et.tag_value, et.extra_values) ORDER BY et.position) AS tags
      FROM eventtags et
      JOIN ev ON ev.event_id = et.event_id
      GROUP BY et.event_id
    ),
    metaAgg AS (
      SELECT em.event_id,
             JSON_OBJECTAGG(em.metadata_type, em.metadata_values) AS metadata
      FROM (
        SELECT m.event_id, m.metadata_type,
               JSON_ARRAYAGG(m.metadata_value ORDER BY m.position) AS metadata_values
        FROM eventmetadata m
        JOIN ev ON ev.event_id = m.event_id
        GROUP BY m.event_id, m.metadata_type
      ) em
      GROUP BY em.event_id
    )
    SELECT
      ev.event_id, ev.pubkey, ev.kind, ev.created_at, ev.content, ev.sig, ev.tenantid,
      COALESCE(tagAgg.tags, JSON_ARRAY())       AS tags,
      COALESCE(metaAgg.metadata, JSON_OBJECT()) AS metadata
    FROM ev
    LEFT JOIN tagAgg  ON ev.event_id = tagAgg.event_id
    LEFT JOIN metaAgg ON ev.event_id = metaAgg.event_id;
  `;

  const dbResult = await dbSimpleSelect("events", query, "", params);
  if (!dbResult) return [];

  type EventRow = {
    event_id: string;
    pubkey: string;
    kind: number;
    created_at: number;
    content: string;
    sig: string;
    tenantid?: string;
    tags?: string;
    metadata?: string;
  };

  const rows: EventRow[] = JSON.parse(JSON.stringify(dbResult));

  const events: MetadataEvent[] = rows.map((row) => ({
    id: row.event_id,
    pubkey: row.pubkey,
    kind: row.kind,
    created_at: row.created_at,
    content: row.content,
    sig: row.sig,
    tags: row.tags
      ? safeJSONParse(row.tags, []).map((tag: any[]) => {
          const [name, value, extra] = tag;
          let rest: string[] = [];
          if (typeof extra === "string" && extra.trim().startsWith("[")) {
            try { rest = JSON.parse(extra); } catch { rest = [extra]; }
          } else if (extra) {
            rest = [extra];
          }
          return [name, value, ...rest];
        })
      : [],
    tenantid: Number(row.tenantid) || 0,
    metadata: row.metadata ? safeJSONParse(row.metadata, undefined) : undefined,
  }));

  return events;
};


// Archive: events older than eventStore.memoryHorizon are only in the DB.

const ARCHIVE_MAX_LIMIT = 500;
const ARCHIVE_MAX_VALUES = 256;
// A filter with only tags (no ids or authors) walks eventtags: keep it small.
const ARCHIVE_MAX_TAG_ONLY_VALUES = 20;
const ARCHIVE_STATEMENT_SECONDS = 3;
// 4 queries at once, and one per client so a single client can't hold them all.
const archiveSlots = createSlots(4);
const archiveClientSlots: Map<string, Slots> = new Map();

const isTagKey = (filter: Filter, key: string): boolean =>
  key.startsWith("#") && key.length === 2 && Array.isArray((filter as Record<string, unknown>)[key]);

const isArchiveFilterSelective = (filter: Filter): boolean => {
  if (filter.search) return false;
  if (filter.ids && filter.ids.length > 0) return true;
  if (filter.authors && filter.authors.length > 0) return true;
  const tagValues = Object.keys(filter)
    .filter(k => isTagKey(filter, k))
    .reduce((n, k) => n + ((filter as Record<string, unknown[]>)[k]).length, 0);
  return tagValues > 0 && tagValues <= ARCHIVE_MAX_TAG_ONLY_VALUES;
};

/**
 * Reads from the DB the events matching a filter that the in-memory store can't answer.
 * Only selective filters (ids, authors or a few tag values) reach the DB, with a capped
 * limit and a statement timeout. Slots are global and per client; waits up to waitMs for
 * one and returns null if none frees up (the caller can't tell "nothing" from "skipped" otherwise).
 */
const getArchivedEventsDB = async (filter: Filter, createdBefore: number, limit: number, tenantid?: number, client: string = "", waitMs: number = 0): Promise<MetadataEvent[] | null> => {

  if (!isArchiveFilterSelective(filter)) return [];

  const safeLimit = Math.min(Math.max(Number(limit) || 0, 0), ARCHIVE_MAX_LIMIT);
  if (safeLimit === 0) return [];

  let where = "";
  const params: (string | number)[] = [];

  if (filter.ids && filter.ids.length > 0) {
    const ids = filter.ids.filter(isHex64).slice(0, ARCHIVE_MAX_VALUES);
    if (ids.length === 0) return [];
    where += ` AND e.event_id IN (${ids.map(() => "?").join(",")})`;
    params.push(...ids);
  }
  if (filter.authors && filter.authors.length > 0) {
    const authors = filter.authors.filter(isHex64).slice(0, ARCHIVE_MAX_VALUES);
    if (authors.length === 0) return [];
    where += ` AND e.pubkey IN (${authors.map(() => "?").join(",")})`;
    params.push(...authors);
  }
  if (filter.kinds && filter.kinds.length > 0) {
    const kinds = filter.kinds.filter(k => Number.isInteger(k) && k >= 0).slice(0, ARCHIVE_MAX_VALUES);
    if (kinds.length === 0) return [];
    where += ` AND e.kind IN (${kinds.map(() => "?").join(",")})`;
    params.push(...kinds);
  }
  for (const key of Object.keys(filter)) {
    if (!isTagKey(filter, key)) continue;
    const values = ((filter as Record<string, unknown>)[key] as unknown[]).filter(v => typeof v === "string" && v.length <= 512).slice(0, ARCHIVE_MAX_VALUES) as string[];
    if (values.length === 0) return [];
    where += ` AND e.event_id IN (SELECT et.event_id FROM eventtags et WHERE et.tag_name = ? AND et.tag_value IN (${values.map(() => "?").join(",")}))`;
    params.push(key.substring(1), ...values);
  }
  if (filter.since !== undefined && isU32(filter.since)) {
    where += ` AND e.created_at >= ?`;
    params.push(filter.since);
  }
  const until = filter.until !== undefined && isU32(filter.until) ? Math.min(filter.until, createdBefore - 1) : createdBefore - 1;
  where += ` AND e.created_at <= ?`;
  params.push(until);
  if (tenantid !== undefined) {
    where += ` AND e.tenantid = ?`;
    params.push(tenantid);
  }

  let clientSlots = archiveClientSlots.get(client);
  if (!clientSlots) {
    clientSlots = createSlots(1);
    archiveClientSlots.set(client, clientSlots);
  }
  const started = Date.now();
  if (!await clientSlots.acquire(waitMs)) {
    logger.debug(`getArchivedEventsDB - Client ${client} already has an archive query running, skipping`);
    if (clientSlots.idle()) archiveClientSlots.delete(client);
    return null;
  }
  try {
    if (!await archiveSlots.acquire(waitMs - (Date.now() - started))) {
      logger.debug(`getArchivedEventsDB - Too many archive queries running, skipping`);
      return null;
    }
    try {
      return await selectEventsDB(where, params, safeLimit, ARCHIVE_STATEMENT_SECONDS);
    } catch (error) {
      logger.debug(`getArchivedEventsDB - Error reading archived events: ${error}`);
      return null;
    } finally {
      archiveSlots.release();
    }
  } finally {
    clientSlots.release();
    if (clientSlots.idle()) archiveClientSlots.delete(client);
  }
};

/**
 * Loads events by id straight from the DB, whatever their age (used by NIP-09 deletions).
 */
const getEventsByIdDB = async (ids: string[], tenantid?: number): Promise<MetadataEvent[]> => {
  const validIds = ids.filter(isHex64).slice(0, ARCHIVE_MAX_VALUES);
  if (validIds.length === 0) return [];
  let where = ` AND e.event_id IN (${validIds.map(() => "?").join(",")})`;
  const params: (string | number)[] = [...validIds];
  if (tenantid !== undefined) {
    where += ` AND e.tenantid = ?`;
    params.push(tenantid);
  }
  return selectEventsDB(where, params, validIds.length, ARCHIVE_STATEMENT_SECONDS);
};

const isEventStoredDB = async (id: string): Promise<boolean> => {
  if (!isHex64(id)) return false;
  const result = await dbSimpleSelect("events", "SELECT 1 AS found FROM events WHERE event_id = ? LIMIT 1", "", [id]);
  return !!result;
};

/**
 * Newest created_at stored for a replaceable pubkey + kind, or null if there is none.
 */
const getNewestReplaceableDB = async (pubkey: string, kind: number, tenantid?: number): Promise<number | null> => {
  const params: (string | number)[] = [pubkey, kind];
  let query = "SELECT MAX(created_at) AS newest FROM events WHERE pubkey = ? AND kind = ? AND active = 1";
  if (tenantid !== undefined) {
    query += " AND tenantid = ?";
    params.push(tenantid);
  }
  const result: unknown = await dbSimpleSelect("events", query, "", params);
  const newest = Array.isArray(result) && result[0] ? Number((result[0] as { newest: unknown }).newest) : NaN;
  return Number.isFinite(newest) && newest > 0 ? newest : null;
};

/**
 * Deactivates the stored versions of a replaceable event older than the one just accepted.
 */
const deactivateSupersededDB = async (event: MetadataEvent, tenantid?: number): Promise<number> => {
  try {
    const pool = await connect("deactivateSupersededDB");
    let query = "UPDATE events SET active = 0, comments = 'superseded' WHERE pubkey = ? AND kind = ? AND active = 1 AND created_at < ? AND event_id <> ?";
    const params: (string | number)[] = [event.pubkey, event.kind, event.created_at, event.id];
    if (tenantid !== undefined) {
      query += " AND tenantid = ?";
      params.push(tenantid);
    }
    const [result] = await pool.execute(query, params);
    return (result as ResultSetHeader).affectedRows || 0;
  } catch (error) {
    logger.error(`deactivateSupersededDB - Error deactivating superseded events: ${error}`);
    return 0;
  }
};

const VANISH_BATCH = 1000;
const vanishRunning: Set<string> = new Set();

/**
 * NIP-62: removes from the DB every event of a pubkey older than the request, including
 * the ones no longer held in memory, with their tags and metadata. Deletes in small
 * batches so a big account doesn't hold locks on the events table for long.
 */
const vanishPubkeyDB = async (pubkey: string, before: number, tenantid?: number): Promise<number> => {
  const key = `${tenantid ?? ""}:${pubkey}`;
  if (vanishRunning.has(key)) return 0;
  vanishRunning.add(key);
  let deleted = 0;
  try {
    const pool = await connect("vanishPubkeyDB");
    let select = "SELECT event_id FROM events WHERE pubkey = ? AND created_at < ? AND kind NOT IN (5, 62)";
    const params: (string | number)[] = [pubkey, before];
    if (tenantid !== undefined) {
      select += " AND tenantid = ?";
      params.push(tenantid);
    }
    select += ` LIMIT ${VANISH_BATCH}`;

    let more = true;
    while (more) {
      const [rows] = await pool.execute(select, params);
      const ids = (rows as { event_id: string }[]).map(r => r.event_id);
      if (ids.length === 0) break;
      more = ids.length === VANISH_BATCH;
      const placeholders = ids.map(() => "?").join(",");
      await pool.execute(`DELETE FROM eventtags WHERE event_id IN (${placeholders})`, ids);
      await pool.execute(`DELETE FROM eventmetadata WHERE event_id IN (${placeholders})`, ids);
      const [result] = await pool.execute(`DELETE FROM events WHERE event_id IN (${placeholders})`, ids);
      deleted += (result as ResultSetHeader).affectedRows || 0;
      if (more) await new Promise(resolve => setTimeout(resolve, 50));
    }
    logger.info(`vanishPubkeyDB - Deleted ${deleted} events of ${pubkey}`);
  } catch (error) {
    logger.error(`vanishPubkeyDB - Error deleting events of ${pubkey} after ${deleted}: ${error}`);
  } finally {
    vanishRunning.delete(key);
  }
  return deleted;
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
      now,
      e.tenantid,
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
      "received_at",
      "tenantid"
    ];
  
    const insertedRows = await dbBulkInsert("events", eventColumns, eventValues);
    if (insertedRows !== eventsToStore.length) {
      logger.debug(`storeEvents - Not all events inserted. Expected: ${eventsToStore.length}, Inserted: ${insertedRows}`);
    }
  
    // Store tags
    const allTagValues: [string, string, string, number, string | null][] = [];
    eventsToStore.forEach(e => {
      if (e.tags && e.tags.length > 0) {
        e.tags.forEach((tag: string[], index: number) => {
          const tagName = tag[0];
          const tagValue = tag[1] || "";
          const extraValues = tag.length > 2 ? JSON.stringify(tag.slice(2)) : null;
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
      // No foreign keys: the tags and metadata rows would stay behind
      await dbDelete("eventtags", ["event_id"], [event.id]);
      await dbDelete("eventmetadata", ["event_id"], [event.id]);
    } else {
      dbResult = await dbUpdate("events", { active: "0" }, ["event_id"], [event.id]);
      // Skip the comment update if the row is already gone
      if (dbResult) {
        await dbUpdate("events", { comments: comments }, ["event_id"], [event.id]);
      }
    }

    if (dbResult) {
      affectedCount++;
    } else {
      // Already cleaned up via another path; just drop the in-memory ref.
      logger.debug(`deleteEvents - Event ${event.id} already gone from DB, dropping from store`);
    }

    // Always clear the in-memory references — whether the DB had the row or
    // not, the event is no longer something we should track.
    eventStore.eventIndex.delete(event.id);
    eventStore.pending.delete(event.id);
    eventStore.pendingDelete.delete(event.id);
    eventStore.globalIds.delete(event.id);
    // globalPubkeys stays: the pubkey may still have other events in memory, and
    // dropping it would make REQs by that author skip memory entirely.
    eventStore.globalExpirable.delete(event.id);
  }

  return affectedCount;
};

export { storeEvents, initEvents, deleteEvents, getArchivedEventsDB, getEventsByIdDB, isEventStoredDB, getNewestReplaceableDB, deactivateSupersededDB, vanishPubkeyDB, getMemoryHorizon, indexReplaceable, getReplaceableIds };