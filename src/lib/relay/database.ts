import crypto from "crypto";
import { Event, Filter } from "nostr-tools";
import { Pool, ResultSetHeader } from "mysql2/promise";
import { connect, dbBulkInsert, dbDelete, dbSimpleSelect, dbUpdate} from "../database/core.js";
import { logger } from "../logger.js";
import { CHUNK_SIZE, EventIndex, MetadataEvent, eventStore } from "../../interfaces/relay.js";
import { decompressEvent, encodeChunk } from "./utils.js";
import { createSlots, safeJSONParse, Slots } from "../utils.js";
import { getConfig, isModuleEnabled } from "../config/core.js";
import { isAddressable, isReplaceable } from "../nostr/NIP01.js";
import { EventAddress, getEventAddress } from "../nostr/NIP09.js";
import { cacheDeleted, isDeletedCached, isDeletedRecently } from "./deletions.js";
import { cacheVanishLookup, getCachedVanish, getLocalVanish } from "./vanish.js";
import { ARCHIVE_MAX_VALUES, DrivingTag, TAG_WALK_ROUNDS, archiveUntil, buildArchiveWhere, buildTagCandidatesQuery, buildTagIdsQuery, getArchiveHint, isHex64, isTagKey, isTagWalkDone, isU32, pickDrivingTag, tagWalkLimit } from "./archivequery.js";
import { isTagCreatedReady, suspendTagCreated } from "./tagbackfill.js";

/**
 * created_at below which events live only in the DB: now minus relay.memoryDays, or 0
 * (everything in memory) when memoryDays is 0.
 */
const getMemoryHorizon = (): number => {
  const memoryDays = Number(getConfig(null, ["relay", "memoryDays"]));
  return memoryDays > 0 ? Math.floor(Date.now() / 1000) - memoryDays * 86400 : 0;
};

const getDTag = (tags: string[][]): string => tags.find(tag => tag[0] === "d")?.[1] ?? "";

// Addressable keys include the d tag; they are hashed so the index stays small in memory.
const replaceableKey = (pubkey: string, kind: number, d: string): string =>
  isAddressable(kind)
    ? `${kind}:${crypto.createHash("sha1").update(`${pubkey}:${kind}:${d}`).digest("base64").slice(0, 16)}`
    : `${pubkey}:${kind}`;

/**
 * Remembers a replaceable event by pubkey + kind (+ d tag for addressables), so handleEvent
 * finds the stored version without walking the whole eventIndex. Ids that leave eventIndex
 * are pruned on lookup.
 */
const indexReplaceable = (id: string, pubkey: string, kind: number, d: string = "") => {
  if (!isReplaceable(kind) && !isAddressable(kind)) return;
  const key = replaceableKey(pubkey, kind, d);
  let ids = eventStore.replaceableIndex.get(key);
  if (!ids) {
    ids = new Set();
    eventStore.replaceableIndex.set(key, ids);
  }
  ids.add(id);
};

/**
 * Ids of the replaceable events of a pubkey + kind (+ d tag for addressables) still in eventIndex.
 */
const getReplaceableIds = (pubkey: string, kind: number, d: string = ""): string[] => {
  const key = replaceableKey(pubkey, kind, d);
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

            indexReplaceable(event.id, event.pubkey, event.kind, isAddressable(event.kind) ? getDTag(event.tags) : "");
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
 * @param options.hint - Index hint for `events e`.
 * @param options.throwOnError - Throw instead of returning [] when the query fails, so the
 * caller can tell a timeout from "no rows".
 */
const selectEventsDB = async (where: string, params: (string | number)[], limit: number, maxStatementSeconds: number = 0, options: { hint?: string, throwOnError?: boolean } = {}): Promise<MetadataEvent[]> => {

  const statementVars = ["group_concat_max_len = 8388608"];
  if (maxStatementSeconds > 0) statementVars.push(`max_statement_time = ${Number(maxStatementSeconds)}`);

  const query = `
    SET STATEMENT ${statementVars.join(", ")} FOR
    WITH ev AS (
      SELECT e.event_id, e.pubkey, e.kind, e.created_at, e.content, e.sig, e.tenantid
      FROM events e ${options.hint || ""}
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

  let dbResult: unknown;
  if (options.throwOnError) {
    const pool = await connect("selectEventsDB");
    [dbResult] = await pool.execute(query, params);
  } else {
    dbResult = await dbSimpleSelect("events", query, "", params);
  }
  if (!dbResult || !Array.isArray(dbResult) || dbResult.length === 0) return [];

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
// A filter with only tags (no ids or authors) walks eventtags: keep it small.
const ARCHIVE_MAX_TAG_ONLY_VALUES = 20;
const ARCHIVE_STATEMENT_SECONDS = 3;
const NEG_STATEMENT_SECONDS = 5;
// 4 queries at once, and one per client so a single client can't hold them all.
const archiveSlots = createSlots(4);
const archiveClientSlots: Map<string, Slots> = new Map();

// ER_KEY_DOES_NOT_EXITS: an index named in a hint is not there.
const ER_KEY_DOES_NOT_EXIST = 1176;
let authorHintUsable = true;

// Runs an archive query with the index hint for its filter. If the index isn't there
// (an install still building it), the hint is dropped for the rest of the process.
const withArchiveHint = async <T>(filter: Filter, run: (hint: string) => Promise<T>): Promise<T> => {
  const hint = authorHintUsable ? getArchiveHint(filter) : "";
  try {
    return await run(hint);
  } catch (error) {
    if (hint === "" || (error as { errno?: number })?.errno !== ER_KEY_DOES_NOT_EXIST) throw error;
    authorHintUsable = false;
    logger.warn(`withArchiveHint - Index hint not usable, archive queries go on without it: ${error}`);
    return run("");
  }
};

/**
 * Archive query for a filter led by a tag, once eventtags.created_at is filled and indexed.
 * Reads the newest tag rows from idx_tag_created, loads their events with the rest of the
 * filter applied, and goes further back in rounds while too few pass it.
 * @returns The events, or null when it couldn't settle the answer in its rounds (the caller
 * then runs the old query). Throws on a DB error or when it runs out of time.
 */
const selectByTagCreated = async (filter: Filter, tag: DrivingTag, createdBefore: number, limit: number, tenantid?: number): Promise<MetadataEvent[] | null> => {

  const since = filter.since !== undefined && isU32(filter.since) ? filter.since : 0;
  const deadline = Date.now() + ARCHIVE_STATEMENT_SECONDS * 1000;
  const pool = await connect("selectByTagCreated");
  const seen = new Set<string>();
  const found: MetadataEvent[] = [];
  const newestFirst = (a: MetadataEvent, b: MetadataEvent) => b.created_at - a.created_at || (a.id < b.id ? 1 : -1);
  let cursor = archiveUntil(filter, createdBefore);

  for (let round = 0; round < TAG_WALK_ROUNDS; round++) {
    const want = tagWalkLimit(limit, round);
    const candidatesQuery = buildTagCandidatesQuery(tag, since, cursor, want, ARCHIVE_STATEMENT_SECONDS);
    let candidates: { event_id: string, created_at: number }[];
    try {
      const [rows] = await pool.execute(candidatesQuery.query, candidatesQuery.params);
      candidates = rows as { event_id: string, created_at: number }[];
    } catch (error) {
      if ((error as { errno?: number })?.errno !== ER_KEY_DOES_NOT_EXIST) throw error;
      suspendTagCreated(String(error));
      return null;
    }

    const fresh: string[] = [];
    for (const candidate of candidates) {
      if (seen.has(candidate.event_id)) continue;
      seen.add(candidate.event_id);
      fresh.push(candidate.event_id);
    }
    if (fresh.length > 0) {
      const clause = buildArchiveWhere(filter, createdBefore, tenantid, { skipTag: tag.key, eventIds: fresh });
      if (!clause) return [];
      found.push(...await selectEventsDB(clause.where, clause.params, limit, ARCHIVE_STATEMENT_SECONDS, { throwOnError: true }));
      found.sort(newestFirst);
    }

    const exhausted = candidates.length < want;
    const boundary = exhausted ? 0 : Number(candidates[candidates.length - 1].created_at);
    if (isTagWalkDone(found.map(e => e.created_at), limit, exhausted, boundary)) return found.slice(0, limit);
    // A whole round of rows already seen (more tag rows in one second than a round reads),
    // or no time left.
    if (fresh.length === 0 || Date.now() > deadline) break;
    cursor = boundary;
  }

  if (found.length >= limit) return found.slice(0, limit);
  // Out of time: the old query would only spend as much again on the same tag.
  if (Date.now() > deadline) throw new Error(`tag walk on #${tag.name} ran out of time after ${seen.size} tag rows`);
  logger.debug(`selectByTagCreated - #${tag.name}: ${found.length} of ${limit} events after ${seen.size} tag rows, using the old query`);
  return null;
};

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
 * Whether the archive query for a filter reads everything the filter asks for: it reaches
 * the DB at all (selective) and none of its lists is cut to ARCHIVE_MAX_VALUES.
 */
const isArchiveFilterExact = (filter: Filter): boolean =>
  isArchiveFilterSelective(filter) &&
  Object.values(filter).every(value => !Array.isArray(value) || value.length <= ARCHIVE_MAX_VALUES);

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

  const clause = buildArchiveWhere(filter, createdBefore, tenantid);
  if (!clause) return [];

  return withArchiveSlots(client, waitMs, null, async () => {
    try {
      const tag = isTagCreatedReady() ? pickDrivingTag(filter) : null;
      if (tag) {
        const events = await selectByTagCreated(filter, tag, createdBefore, safeLimit, tenantid);
        if (events) return events;
      }
      return await withArchiveHint(filter, hint =>
        selectEventsDB(clause.where, clause.params, safeLimit, ARCHIVE_STATEMENT_SECONDS, { hint, throwOnError: true }));
    } catch (error) {
      logger.debug(`getArchivedEventsDB - Error reading archived events: ${error}`);
      return null;
    }
  });
};

// Runs fn holding a global archive slot and the client's own; `busy` when none frees up in waitMs.
const withArchiveSlots = async <T>(client: string, waitMs: number, busy: T, fn: () => Promise<T>): Promise<T> => {
  let clientSlots = archiveClientSlots.get(client);
  if (!clientSlots) {
    clientSlots = createSlots(1);
    archiveClientSlots.set(client, clientSlots);
  }
  const started = Date.now();
  if (!await clientSlots.acquire(waitMs)) {
    logger.debug(`withArchiveSlots - Client ${client} already has an archive query running, skipping`);
    if (clientSlots.idle()) archiveClientSlots.delete(client);
    return busy;
  }
  try {
    if (!await archiveSlots.acquire(waitMs - (Date.now() - started))) {
      logger.debug(`withArchiveSlots - Too many archive queries running, skipping`);
      return busy;
    }
    try {
      return await fn();
    } finally {
      archiveSlots.release();
    }
  } finally {
    clientSlots.release();
    if (clientSlots.idle()) archiveClientSlots.delete(client);
  }
};

/**
 * NIP-77: (created_at, id) of the stored events matching a filter, created before createdBefore.
 * No ORDER BY, so MySQL stops at limit rows; the caller treats limit rows as "too many".
 * Private kinds (4, 14, 1059) are left out. Null when the query couldn't run.
 */
const getArchivedIdsDB = async (filter: Filter, createdBefore: number, limit: number, tenantid: number | undefined, client: string, waitMs: number): Promise<{ id: string, pubkey: string, created_at: number }[] | null> => {
  const clause = buildArchiveWhere(filter, createdBefore, tenantid);
  if (!clause) return [];
  return withArchiveSlots(client, waitMs, null, async () => {
    try {
      const pool = await connect("getArchivedIdsDB");
      const toRecords = (rows: unknown) =>
        (rows as { event_id: string, pubkey: string, created_at: number }[]).map(row => ({ id: row.event_id, pubkey: row.pubkey, created_at: Number(row.created_at) }));

      // Tag filters walk idx_tag_created first, so since and until cut the tag rows read.
      const tag = isTagCreatedReady() ? pickDrivingTag(filter) : null;
      const tagClause = tag ? buildArchiveWhere(filter, createdBefore, tenantid, { skipTag: tag.key }) : null;
      if (tag && tagClause) {
        const since = filter.since !== undefined && isU32(filter.since) ? filter.since : 0;
        const tagQuery = buildTagIdsQuery(tag, since, archiveUntil(filter, createdBefore), tagClause.where, limit, NEG_STATEMENT_SECONDS);
        try {
          const [rows] = await pool.execute(tagQuery.query, [...tagQuery.params, ...tagClause.params]);
          return toRecords(rows);
        } catch (error) {
          if ((error as { errno?: number })?.errno !== ER_KEY_DOES_NOT_EXIST) throw error;
          suspendTagCreated(String(error));
        }
      }

      return await withArchiveHint(filter, async hint => {
        const query = `SET STATEMENT max_statement_time = ${NEG_STATEMENT_SECONDS} FOR
          SELECT e.event_id, e.pubkey, e.created_at FROM events e ${hint}
          WHERE e.active = '1' AND e.kind NOT IN (4, 14, 1059) ${clause.where}
          LIMIT ${Number(limit)}`;
        const [rows] = await pool.execute(query, clause.params);
        return toRecords(rows);
      });
    } catch (error) {
      logger.debug(`getArchivedIdsDB - Error reading event ids: ${error}`);
      return null;
    }
  });
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

const DELETION_STATEMENT_SECONDS = 1;
const ADDRESS_DELETE_MAX = 500;

/**
 * NIP-09: whether the author of an event already asked to delete it, so it is not taken back.
 * A kind 5 from the same pubkey has to carry its id in an `e` tag, or its address in an `a`
 * tag with a created_at not older than the event's. Looks at the deletions still waiting for
 * the flush, then at the DB (eventtags by tag_name + tag_value). On a DB error or timeout the
 * event is let through.
 * @param event - The incoming event.
 * @param tenantid - Only deletions stored for this tenant count (isolated mode).
 */
const isEventDeletedDB = async (event: MetadataEvent, tenantid?: number): Promise<boolean> => {
  if (!isHex64(event.id) || !isHex64(event.pubkey)) return false;
  if (isDeletedRecently(event, tenantid) || isDeletedCached(event.id, tenantid)) return true;

  const tenantWhere = tenantid !== undefined ? " AND e.tenantid = ?" : "";
  const tenantParams = tenantid !== undefined ? [tenantid] : [];
  const address = getEventAddress(event);

  let query = `SET STATEMENT max_statement_time = ${DELETION_STATEMENT_SECONDS} FOR
    SELECT t.tag_name, t.tag_value FROM eventtags t JOIN events e ON e.event_id = t.event_id
    WHERE t.tag_name = 'e' AND t.tag_value = ? AND e.kind = 5 AND e.pubkey = ?${tenantWhere}`;
  const params: (string | number)[] = [event.id, event.pubkey, ...tenantParams];
  if (address !== null) {
    query += `
    UNION ALL
    SELECT t.tag_name, t.tag_value FROM eventtags t JOIN events e ON e.event_id = t.event_id
    WHERE t.tag_name = 'a' AND t.tag_value = ? AND e.kind = 5 AND e.pubkey = ? AND e.created_at >= ?${tenantWhere}`;
    params.push(address, event.pubkey, event.created_at, ...tenantParams);
  }
  query += " LIMIT 20";

  const result: unknown = await dbSimpleSelect("eventtags", query, "", params);
  if (!Array.isArray(result)) return false;
  // The column collation ignores case: 'E' tags and addresses that differ only in case match too.
  const deleted = (result as { tag_name: string, tag_value: string }[]).some(row =>
    (row.tag_name === "e" && row.tag_value === event.id) || (row.tag_name === "a" && row.tag_value === address));
  if (deleted) cacheDeleted(event.id, tenantid);
  return deleted;
};

// Removes events with their tags and metadata (there are no foreign keys).
const deleteEventRowsDB = async (pool: Pool, ids: string[]): Promise<number> => {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  await pool.execute(`DELETE FROM eventtags WHERE event_id IN (${placeholders})`, ids);
  await pool.execute(`DELETE FROM eventmetadata WHERE event_id IN (${placeholders})`, ids);
  const [result] = await pool.execute(`DELETE FROM events WHERE event_id IN (${placeholders})`, ids);
  return (result as ResultSetHeader).affectedRows || 0;
};

/**
 * NIP-09 deletion by address (`a` tag): removes from the DB every stored version of a
 * replaceable or addressable event up to the deletion's created_at, superseded ones included.
 * Walks the author's events of that kind (idx_pubkey_kind_created) and reads their d tag.
 * @param address - Kind, pubkey and d identifier.
 * @param until - created_at of the deletion request.
 * @param tenantid - Only this tenant's events (isolated mode).
 * @returns The number of events deleted.
 */
const deleteAddressDB = async (address: EventAddress, until: number, tenantid?: number): Promise<number> => {
  if (!isHex64(address.pubkey) || !isU32(until)) return 0;
  try {
    const pool = await connect("deleteAddressDB");
    const params: (string | number)[] = [address.pubkey, address.kind, until];
    let where = "e.pubkey = ? AND e.kind = ? AND e.created_at <= ?";
    if (tenantid !== undefined) {
      where += " AND e.tenantid = ?";
      params.push(tenantid);
    }
    let ids: string[];
    if (isAddressable(address.kind)) {
      const [rows] = await pool.execute(`SET STATEMENT max_statement_time = ${ARCHIVE_STATEMENT_SECONDS} FOR
        SELECT e.event_id, (SELECT t.tag_value FROM eventtags t WHERE t.event_id = e.event_id AND t.tag_name = 'd' ORDER BY t.position LIMIT 1) AS d
        FROM events e WHERE ${where}
        HAVING COALESCE(d, '') = ?
        LIMIT ${ADDRESS_DELETE_MAX}`, [...params, address.d]);
      // Compared again here: the collation would also take "Post" for "post".
      ids = (rows as { event_id: string, d: string | null }[]).filter(r => (r.d ?? "") === address.d).map(r => r.event_id);
    } else {
      const [rows] = await pool.execute(`SELECT e.event_id FROM events e WHERE ${where} LIMIT ${ADDRESS_DELETE_MAX}`, params);
      ids = (rows as { event_id: string }[]).map(r => r.event_id);
    }
    const deleted = await deleteEventRowsDB(pool, ids);
    if (deleted > 0) logger.debug(`deleteAddressDB - Deleted ${deleted} versions of ${address.kind}:${address.pubkey}:${address.d}`);
    return deleted;
  } catch (error) {
    logger.error(`deleteAddressDB - Error deleting ${address.kind}:${address.pubkey}:${address.d}: ${error}`);
    return 0;
  }
};

const VANISH_BATCH = 1000;
const VANISH_STATEMENT_SECONDS = 30;
const vanishRunning: Set<string> = new Set();

/**
 * NIP-62: removes from the DB every event of a pubkey up to the request (its NIP-09
 * deletions too, but not its requests to vanish) and the gift wraps (kind 1059) addressed
 * to it, with their tags and metadata, whether or not they are still held in memory.
 * Events of other authors that only mention the pubkey stay. Deletes in small batches so a
 * big account doesn't hold locks on the events table for long.
 * @param pubkey - The pubkey that asked to vanish.
 * @param until - created_at of the request.
 * @param tenantid - Only this tenant's events (isolated mode).
 * @returns The number of events deleted.
 */
const vanishPubkeyDB = async (pubkey: string, until: number, tenantid?: number): Promise<number> => {
  const key = `${tenantid ?? ""}:${pubkey}`;
  if (vanishRunning.has(key)) return 0;
  vanishRunning.add(key);
  let deleted = 0;
  try {
    const pool = await connect("vanishPubkeyDB");
    const tenantWhere = tenantid !== undefined ? " AND e.tenantid = ?" : "";
    const params: (string | number)[] = tenantid !== undefined ? [pubkey, until, tenantid] : [pubkey, until];
    const selects = [
      `SELECT e.event_id FROM events e WHERE e.pubkey = ? AND e.created_at <= ? AND e.kind <> 62${tenantWhere} LIMIT ${VANISH_BATCH}`,
      // Gift wraps to the pubkey: walks its p tags, which can be many for a well known account.
      `SET STATEMENT max_statement_time = ${VANISH_STATEMENT_SECONDS} FOR
       SELECT e.event_id FROM eventtags t JOIN events e ON e.event_id = t.event_id
       WHERE t.tag_name = 'p' AND t.tag_value = ? AND e.kind = 1059 AND e.created_at <= ?${tenantWhere} LIMIT ${VANISH_BATCH}`,
    ];

    for (const select of selects) {
      let more = true;
      while (more) {
        const [rows] = await pool.execute(select, params);
        const ids = (rows as { event_id: string }[]).map(r => r.event_id);
        if (ids.length === 0) break;
        more = ids.length === VANISH_BATCH;
        deleted += await deleteEventRowsDB(pool, ids);
        if (more) await new Promise(resolve => setTimeout(resolve, 50));
      }
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
 * NIP-62: created_at of the newest request to vanish stored for a pubkey, 0 if it has none.
 * Events of that pubkey up to it must not come back. Cached per pubkey; a miss is a MAX over
 * idx_pubkey_kind_created. On a DB error only the requests seen by this process count.
 * @param pubkey - The pubkey of an incoming event (or the recipient of a gift wrap).
 * @param tenantid - Only requests stored for this tenant count (isolated mode).
 */
const getVanishedUntil = async (pubkey: string, tenantid?: number): Promise<number> => {
  const cached = getCachedVanish(pubkey, tenantid);
  if (cached !== null) return cached;
  if (!isHex64(pubkey)) return 0;
  try {
    const pool = await connect("getVanishedUntil");
    const params: (string | number)[] = [pubkey];
    let query = "SELECT MAX(created_at) AS newest FROM events WHERE pubkey = ? AND kind = 62";
    if (tenantid !== undefined) {
      query += " AND tenantid = ?";
      params.push(tenantid);
    }
    const [rows] = await pool.execute(query, params);
    const newest = Number((rows as { newest: unknown }[])[0]?.newest) || 0;
    cacheVanishLookup(pubkey, newest, tenantid);
    return Math.max(newest, getLocalVanish(pubkey, tenantid));
  } catch (error) {
    logger.error(`getVanishedUntil - Error reading the requests to vanish of ${pubkey}: ${error}`);
    return getLocalVanish(pubkey, tenantid);
  }
};

/**
 * Which of these event ids are already stored. On a DB error returns an empty set, so
 * the insert goes ahead as before.
 */
const getStoredEventIds = async (ids: string[]): Promise<Set<string>> => {
  const found = new Set<string>();
  if (ids.length === 0) return found;
  try {
    const pool = await connect("getStoredEventIds");
    for (let i = 0; i < ids.length; i += 1000) {
      const batch = ids.slice(i, i + 1000);
      const [rows] = await pool.execute(`SELECT event_id FROM events WHERE event_id IN (${batch.map(() => "?").join(",")})`, batch);
      (rows as { event_id: string }[]).forEach(r => found.add(r.event_id));
    }
  } catch (error) {
    logger.error(`getStoredEventIds - Error checking stored events: ${error}`);
  }
  return found;
};

/**
 * Inserts one or more events (and their tags) into the database using bulk insert.
 * @param {Event | Event[]} eventsInput - Event or array of events to store.
 * @returns {Promise<number>}
 */
const storeEvents = async (eventsInput: MetadataEvent | MetadataEvent[]): Promise<number> => {

    const events: MetadataEvent[] = Array.isArray(eventsInput) ? eventsInput : [eventsInput];
    const filteredEvents  = events.filter(e => e && !(e.kind >= 20000 && e.kind < 30000));
    const decodedEvents = await Promise.all(filteredEvents.map(decompressEvent));

    // An event already in the DB (re-sent after being deactivated or dropped from memory)
    // is skipped by INSERT IGNORE, but its tags and metadata were inserted again every time.
    const stored = await getStoredEventIds(decodedEvents.map(e => e.id));
    const eventsToStore = decodedEvents.filter(e => !stored.has(e.id));

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
    const allTagValues: [string, string, string, number, string | null, number][] = [];
    eventsToStore.forEach(e => {
      if (e.tags && e.tags.length > 0) {
        e.tags.forEach((tag: string[], index: number) => {
          const tagName = tag[0];
          const tagValue = tag[1] || "";
          const extraValues = tag.length > 2 ? JSON.stringify(tag.slice(2)) : null;
          allTagValues.push([e.id, tagName, tagValue, index, extraValues, e.created_at]);
        });
      }
    });
  
    if (allTagValues.length > 0) {
      // created_at is copied to every tag row: idx_tag_created reads the newest events of a tag from it.
      const tagColumns = ["event_id", "tag_name", "tag_value", "position", "extra_values", "created_at"];
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

export { getDTag, storeEvents, initEvents, deleteEvents, getArchivedEventsDB, getArchivedIdsDB, isArchiveFilterSelective, isArchiveFilterExact, ARCHIVE_MAX_LIMIT, getEventsByIdDB, isEventStoredDB, getNewestReplaceableDB, deactivateSupersededDB, isEventDeletedDB, deleteAddressDB, vanishPubkeyDB, getVanishedUntil, getMemoryHorizon, indexReplaceable, getReplaceableIds };