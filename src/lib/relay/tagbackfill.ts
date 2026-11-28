import { ResultSetHeader } from "mysql2/promise";
import { connect } from "../database/core.js";
import { isIndexJobRunning } from "../database/tables.js";
import { isModuleEnabled } from "../config/core.js";
import { logger } from "../logger.js";
import { eventStore } from "../../interfaces/relay.js";

// Fills eventtags.created_at on the rows written before the column existed, walking the table
// by id in small batches. Progress lives in the jobstate row below, so a restart carries on
// where it stopped. To stop it by hand:
//   UPDATE jobstate SET paused = 1 WHERE name = 'eventtags_created_at';
const TAG_BACKFILL_JOB = "eventtags_created_at";
const TAG_CREATED_INDEX = "idx_tag_created";

const BATCH_MAX = 20000;
const BATCH_MIN = 1000;
const BATCH_SLOW_MS = 2000;
const BATCH_FAST_MS = 500;
const BATCH_STATEMENT_SECONDS = 10;
const SLEEP_MIN_MS = 1000;
const PAUSE_MS = 15000;
const LAG_SLICE_MS = 100;
const LAG_MAX_MS = 250;
const LOG_EVERY_MS = 60 * 1000;
const INDEX_POLL_MS = 60 * 1000;
const MAX_FAILURES = 10;
// ER_BINLOG_STMT_MODE_AND_ROW_ENGINE: READ COMMITTED can't be used with statement binlogs.
const ER_BINLOG_STMT_MODE = 1665;

interface TagBackfillState {
  // Rows up to this id are done.
  lastId: number;
  // Where this run stops: MAX(id) when it started. Rows after it are written with created_at.
  maxId: number;
  // Rows filled, and rows left NULL because their event is gone.
  updated: number;
  orphans: number;
  startedAt: number;
  finishedAt: number;
}

interface TagBackfillLoad {
  // The relay store has finished loading from the DB.
  loaded: boolean;
  // jobstate.paused, set by hand.
  paused: boolean;
  // An index is being built or dropped on eventtags.
  indexBuilding: boolean;
  // Worst event loop delay seen since the last batch, in ms.
  lagMs: number;
}

let backfillRunning = false;
let backfillDone = false;
let indexReady = false;
let indexPolling = false;
let prefixWarned = false;
let readCommitted = true;

const emptyState = (): TagBackfillState => ({ lastId: 0, maxId: 0, updated: 0, orphans: 0, startedAt: 0, finishedAt: 0 });

/**
 * Reads the state saved in jobstate.state. Anything missing or broken starts from zero.
 * @param raw - The JSON stored in the row, or null.
 */
const parseBackfillState = (raw: unknown): TagBackfillState => {
  const state = emptyState();
  let saved: Record<string, unknown> = {};
  try {
    const parsed = typeof raw === "string" && raw !== "" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object") saved = parsed as Record<string, unknown>;
  } catch {
    return state;
  }
  for (const key of Object.keys(state) as (keyof TagBackfillState)[]) {
    const value = Number(saved[key]);
    if (Number.isFinite(value) && value >= 0) state[key] = Math.floor(value);
  }
  return state;
};

/**
 * Why the backfill has to wait right now, or "" when it can run its next batch.
 */
const backfillPauseReason = (load: TagBackfillLoad): string => {
  if (load.paused) return "paused by hand (jobstate.paused)";
  if (!load.loaded) return "the relay store is still loading";
  if (load.indexBuilding) return "an index is being built on eventtags";
  if (load.lagMs > LAG_MAX_MS) return `event loop lag ${Math.round(load.lagMs)} ms`;
  return "";
};

/**
 * Rows for the next batch: half after a slow or failed one, double after a fast one.
 * @param current - Size of the batch that just ran.
 * @param elapsedMs - How long its UPDATE took.
 * @param failed - Whether it failed (timeout, lock wait).
 */
const nextBatchSize = (current: number, elapsedMs: number, failed: boolean = false): number => {
  if (failed || elapsedMs > BATCH_SLOW_MS) return Math.max(BATCH_MIN, Math.floor(current / 2));
  if (elapsedMs < BATCH_FAST_MS) return Math.min(BATCH_MAX, current * 2);
  return Math.min(BATCH_MAX, Math.max(BATCH_MIN, current));
};

/**
 * Pause after a batch: twice what it took, so the DB spends at most a third of the time on it.
 */
const batchSleepMs = (elapsedMs: number): number => Math.max(SLEEP_MIN_MS, Math.round(elapsedMs * 2));

/**
 * The id range (from, to] of the next batch, or null when the run has reached its end.
 */
const nextBatchRange = (state: TagBackfillState, batchSize: number): { from: number, to: number } | null => {
  if (state.lastId >= state.maxId) return null;
  return { from: state.lastId, to: Math.min(state.lastId + Math.max(1, batchSize), state.maxId) };
};

// Sleeps in short slices and returns the worst delay of the event loop over them.
const sleepMeasuringLag = async (ms: number): Promise<number> => {
  let worst = 0;
  let left = ms;
  while (left > 0) {
    const slice = Math.min(LAG_SLICE_MS, left);
    const started = performance.now();
    await new Promise(resolve => setTimeout(resolve, slice));
    worst = Math.max(worst, performance.now() - started - slice);
    left -= slice;
  }
  return worst;
};

const readJob = async (): Promise<{ paused: boolean, done: boolean, state: TagBackfillState } | null> => {
  const pool = await connect("tagBackfill");
  const [rows] = await pool.execute("SELECT paused, done, state FROM jobstate WHERE name = ?", [TAG_BACKFILL_JOB]);
  const row = (rows as { paused: number, done: number, state: string | null }[])[0];
  if (!row) return null;
  return { paused: Number(row.paused) == 1, done: Number(row.done) == 1, state: parseBackfillState(row.state) };
};

const saveJob = async (state: TagBackfillState, done: boolean): Promise<void> => {
  const pool = await connect("tagBackfill");
  await pool.execute("UPDATE jobstate SET state = ?, done = ? WHERE name = ?", [JSON.stringify(state), done ? 1 : 0, TAG_BACKFILL_JOB]);
};

// One batch: copies events.created_at to the tag rows of an id range that don't have it yet.
// READ COMMITTED keeps it from locking the gap after the last id (where new tags are inserted)
// and the events rows it reads.
const runBatch = async (from: number, to: number): Promise<{ updated: number, orphans: number }> => {
  const pool = await connect("tagBackfill");
  const conn = await pool.getConnection();
  try {
    if (readCommitted) await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    const [result] = await conn.query(
      `SET STATEMENT max_statement_time = ${BATCH_STATEMENT_SECONDS} FOR
       UPDATE eventtags et FORCE INDEX (PRIMARY) STRAIGHT_JOIN events e ON e.event_id = et.event_id
       SET et.created_at = e.created_at
       WHERE et.id > ? AND et.id <= ? AND et.created_at IS NULL`, [from, to]);
    const [left] = await conn.query(
      "SELECT COUNT(*) AS c FROM eventtags FORCE INDEX (PRIMARY) WHERE id > ? AND id <= ? AND created_at IS NULL", [from, to]);
    return { updated: (result as ResultSetHeader).affectedRows || 0, orphans: Number((left as { c: number }[])[0]?.c) || 0 };
  } finally {
    conn.release();
  }
};

// Once the backfill is done, waits for idx_tag_created to show up (it is built in the
// background after the job) and only then lets the archive use it.
const pollTagCreatedIndex = async (): Promise<void> => {
  if (indexPolling || indexReady) return;
  indexPolling = true;
  try {
    while (!indexReady) {
      try {
        const pool = await connect("tagBackfill");
        const [rows] = await pool.execute("SHOW INDEXES FROM eventtags WHERE Key_name = ?", [TAG_CREATED_INDEX]);
        const parts = Array.isArray(rows) ? rows as { Column_name: string, Sub_part: number | null }[] : [];
        // A prefix on tag_value (an old definition, or one the server cut to fit the row
        // format) can't be read in created_at order: the archive stays on the old query.
        if (parts.some(part => part.Sub_part != null)) {
          if (!prefixWarned) logger.warn(`pollTagCreatedIndex - ${TAG_CREATED_INDEX} indexes a prefix, not the whole tag_value. Tag filters stay on the old archive query until it is dropped and built again`);
          prefixWarned = true;
        } else if (parts.length > 0) {
          indexReady = true;
          logger.info(`pollTagCreatedIndex - ${TAG_CREATED_INDEX} is in place, tag filters on the archive now read from it`);
          break;
        }
      } catch (error) {
        logger.debug(`pollTagCreatedIndex - Error looking for ${TAG_CREATED_INDEX}: ${error}`);
      }
      await new Promise(resolve => setTimeout(resolve, INDEX_POLL_MS));
    }
  } finally {
    indexPolling = false;
  }
};

const runBackfill = async (): Promise<void> => {

  const pool = await connect("tagBackfill");
  await pool.execute("INSERT IGNORE INTO jobstate (name, state) VALUES (?, ?)", [TAG_BACKFILL_JOB, JSON.stringify(emptyState())]);
  const job = await readJob();
  if (!job) throw new Error("jobstate row not found");
  const state = job.state;

  backfillDone = job.done;
  if (backfillDone) pollTagCreatedIndex().catch(() => undefined);

  // Every start walks up to the newest row. After a finished run that is only the rows written
  // since the last start, all with created_at, unless an older version ran in between.
  const [maxRows] = await pool.execute("SELECT MAX(id) AS maxId FROM eventtags");
  const maxId = Number((maxRows as { maxId: number | null }[])[0]?.maxId) || 0;
  if (maxId > state.maxId) state.maxId = maxId;
  if (state.startedAt == 0) state.startedAt = Math.floor(Date.now() / 1000);

  if (state.lastId < state.maxId) {
    logger.info(`runBackfill - Filling eventtags.created_at from id ${state.lastId} to ${state.maxId}${job.done ? " (rows added since the last start)" : ""}`);
  }

  let batchSize = BATCH_MAX;
  let lagMs = 0;
  let failures = 0;
  let lastLog = Date.now();
  let lastReason = "";

  for (;;) {
    const range = nextBatchRange(state, batchSize);
    if (!range) break;

    let paused = false;
    try {
      paused = (await readJob())?.paused == true;
    } catch (error) {
      logger.debug(`runBackfill - Error reading jobstate: ${error}`);
    }
    const reason = backfillPauseReason({ loaded: eventStore.relayEventsLoaded == true, paused, indexBuilding: isIndexJobRunning("eventtags"), lagMs });
    if (reason != "") {
      if (reason != lastReason) logger.info(`runBackfill - Waiting at id ${state.lastId}: ${reason}`);
      lastReason = reason;
      lagMs = await sleepMeasuringLag(PAUSE_MS);
      continue;
    }
    if (lastReason != "") logger.info(`runBackfill - Carrying on from id ${state.lastId}`);
    lastReason = "";

    const started = Date.now();
    try {
      const result = await runBatch(range.from, range.to);
      const elapsed = Date.now() - started;
      state.lastId = range.to;
      state.updated += result.updated;
      state.orphans += result.orphans;
      failures = 0;
      await saveJob(state, backfillDone);
      batchSize = nextBatchSize(batchSize, elapsed);
      if (Date.now() - lastLog >= LOG_EVERY_MS) {
        lastLog = Date.now();
        const percent = state.maxId > 0 ? (state.lastId / state.maxId * 100).toFixed(1) : "100";
        logger.info(`runBackfill - eventtags.created_at ${percent}% (id ${state.lastId} of ${state.maxId}), ${state.updated} rows filled, ${state.orphans} without event, last batch ${elapsed} ms, next ${batchSize} rows`);
      }
      lagMs = await sleepMeasuringLag(batchSleepMs(elapsed));
    } catch (error) {
      if (readCommitted && (error as { errno?: number })?.errno == ER_BINLOG_STMT_MODE) {
        readCommitted = false;
        logger.warn(`runBackfill - READ COMMITTED not allowed with this binlog format, using the default isolation`);
        continue;
      }
      failures++;
      batchSize = nextBatchSize(batchSize, Date.now() - started, true);
      if (failures >= MAX_FAILURES) {
        logger.error(`runBackfill - Stopping at id ${state.lastId} until the next start after ${failures} failed batches: ${error}`);
        return;
      }
      logger.warn(`runBackfill - Batch ${range.from}-${range.to} failed (${failures}), next one with ${batchSize} rows: ${error}`);
      lagMs = await sleepMeasuringLag(PAUSE_MS);
    }
  }

  if (!backfillDone) {
    state.finishedAt = Math.floor(Date.now() / 1000);
    await saveJob(state, true);
    backfillDone = true;
    logger.info(`runBackfill - eventtags.created_at is filled up to id ${state.maxId}: ${state.updated} rows filled, ${state.orphans} left without event, in ${state.finishedAt - state.startedAt} s. ${TAG_CREATED_INDEX} can be built now`);
  } else {
    await saveJob(state, true);
  }
  pollTagCreatedIndex().catch(() => undefined);
};

/**
 * Starts the eventtags.created_at backfill in the background (once per process). It waits
 * while the relay store loads, while an index is built on eventtags, when the event loop is
 * slow and when jobstate.paused is set; a failure is logged and it stops until the next start.
 */
const startTagBackfill = (): void => {
  if (backfillRunning || !isModuleEnabled("relay", "")) return;
  backfillRunning = true;
  runBackfill()
    .catch(error => logger.error(`startTagBackfill - Backfill of eventtags.created_at stopped: ${error}`))
    .finally(() => { backfillRunning = false; });
};

/**
 * Whether tag filters can be answered from idx_tag_created: every old row has its created_at
 * (the backfill is done) and the index exists.
 */
const isTagCreatedReady = (): boolean => backfillDone && indexReady;

/**
 * Stops the archive from using idx_tag_created after a query on it failed (the index was
 * dropped by hand, say) and looks for it again in the background.
 */
const suspendTagCreated = (reason: string): void => {
  if (!indexReady) return;
  indexReady = false;
  logger.warn(`suspendTagCreated - Tag filters go back to the old archive query: ${reason}`);
  pollTagCreatedIndex().catch(() => undefined);
};

export { startTagBackfill, isTagCreatedReady, suspendTagCreated, parseBackfillState, backfillPauseReason, nextBatchSize, batchSleepMs, nextBatchRange, TAG_BACKFILL_JOB, TAG_CREATED_INDEX, BATCH_MAX, BATCH_MIN };
export type { TagBackfillState };
