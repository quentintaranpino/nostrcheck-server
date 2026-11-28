import { Filter } from "nostr-tools";

// SQL for the archive (events only in the DB). Nothing here touches the DB, so it can be tested.

const ARCHIVE_MAX_VALUES = 256;
// Tag rows read per round when walking idx_tag_created, and how many rounds before giving up.
const TAG_WALK_MIN = 100;
const TAG_WALK_MAX = 2000;
const TAG_WALK_ROUNDS = 4;

const isU32 = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 0xFFFFFFFF;
const isHex64 = (s: unknown) => typeof s === "string" && /^[a-f0-9]{64}$/i.test(s);

const isTagKey = (filter: Filter, key: string): boolean =>
  key.startsWith("#") && key.length === 2 && Array.isArray((filter as Record<string, unknown>)[key]);

const tagValues = (filter: Filter, key: string): string[] =>
  ((filter as Record<string, unknown>)[key] as unknown[]).filter(v => typeof v === "string" && v.length <= 512).slice(0, ARCHIVE_MAX_VALUES) as string[];

interface ArchiveWhereOptions {
  // Tag key (e.g. "#t") left out of the WHERE: the caller already resolved it.
  skipTag?: string;
  // Event ids the caller got from eventtags; added on top of the filter's own conditions.
  eventIds?: string[];
}

interface DrivingTag {
  key: string;
  name: string;
  values: string[];
}

/**
 * Newest created_at an archive query may return: the filter's until, never past createdBefore.
 */
const archiveUntil = (filter: Filter, createdBefore: number): number =>
  filter.until !== undefined && isU32(filter.until) ? Math.min(filter.until, createdBefore - 1) : createdBefore - 1;

/**
 * Turns a filter into the WHERE of an events query (after `e.active = '1'`), for events created
 * before createdBefore. Null when a list in the filter has no usable value (nothing can match).
 */
const buildArchiveWhere = (filter: Filter, createdBefore: number, tenantid?: number, options: ArchiveWhereOptions = {}): { where: string, params: (string | number)[] } | null => {

  let where = "";
  const params: (string | number)[] = [];

  if (options.eventIds !== undefined) {
    const ids = options.eventIds.filter(isHex64);
    if (ids.length === 0) return null;
    where += ` AND e.event_id IN (${ids.map(() => "?").join(",")})`;
    params.push(...ids);
  }
  if (filter.ids && filter.ids.length > 0) {
    const ids = filter.ids.filter(isHex64).slice(0, ARCHIVE_MAX_VALUES);
    if (ids.length === 0) return null;
    where += ` AND e.event_id IN (${ids.map(() => "?").join(",")})`;
    params.push(...ids);
  }
  if (filter.authors && filter.authors.length > 0) {
    const authors = filter.authors.filter(isHex64).slice(0, ARCHIVE_MAX_VALUES);
    if (authors.length === 0) return null;
    where += ` AND e.pubkey IN (${authors.map(() => "?").join(",")})`;
    params.push(...authors);
  }
  if (filter.kinds && filter.kinds.length > 0) {
    const kinds = filter.kinds.filter(k => Number.isInteger(k) && k >= 0).slice(0, ARCHIVE_MAX_VALUES);
    if (kinds.length === 0) return null;
    where += ` AND e.kind IN (${kinds.map(() => "?").join(",")})`;
    params.push(...kinds);
  }
  for (const key of Object.keys(filter)) {
    if (!isTagKey(filter, key)) continue;
    const values = tagValues(filter, key);
    if (values.length === 0) return null;
    if (key === options.skipTag) continue;
    where += ` AND e.event_id IN (SELECT et.event_id FROM eventtags et WHERE et.tag_name = ? AND et.tag_value IN (${values.map(() => "?").join(",")}))`;
    params.push(key.substring(1), ...values);
  }
  if (filter.since !== undefined && isU32(filter.since)) {
    where += ` AND e.created_at >= ?`;
    params.push(filter.since);
  }
  where += ` AND e.created_at <= ?`;
  params.push(archiveUntil(filter, createdBefore));
  if (tenantid !== undefined) {
    where += ` AND e.tenantid = ?`;
    params.push(tenantid);
  }
  return { where, params };
};

/**
 * Index hint for `events e` in an archive query. With authors and no ids the optimizer has to
 * walk idx_pubkey_kind_created: left alone it has picked worse ones (1.9 s against 190 ms).
 */
const getArchiveHint = (filter: Filter): string => {
  if (filter.ids && filter.ids.length > 0) return "";
  if (filter.authors && filter.authors.length > 0) return "FORCE INDEX (idx_pubkey_kind_created)";
  return "";
};

/**
 * The tag an archive query can be driven from through idx_tag_created: only for filters
 * without ids or authors (those are selective enough on events). With several tags, the one
 * with fewer values; the others are checked on the events found.
 */
const pickDrivingTag = (filter: Filter): DrivingTag | null => {
  if (filter.ids && filter.ids.length > 0) return null;
  if (filter.authors && filter.authors.length > 0) return null;
  let driving: DrivingTag | null = null;
  for (const key of Object.keys(filter)) {
    if (!isTagKey(filter, key)) continue;
    const values = Array.from(new Set(tagValues(filter, key)));
    // A tag without usable values matches nothing: buildArchiveWhere deals with it.
    if (values.length === 0) return null;
    if (!driving || values.length < driving.values.length) driving = { key, name: key.substring(1), values };
  }
  return driving;
};

const tagCandidatesBranch = (since: number, limit: number): string =>
  `SELECT et.event_id, et.created_at FROM eventtags et FORCE INDEX (idx_tag_created)
   WHERE et.tag_name = ? AND et.tag_value = ? AND et.created_at <= ?${since > 0 ? " AND et.created_at >= ?" : ""}
   ORDER BY et.created_at DESC LIMIT ${Number(limit)}`;

/**
 * The newest `limit` tag rows of a tag, read from idx_tag_created (tag_name, tag_value,
 * created_at). One branch per value, each an index range read backwards that stops at
 * `limit` rows, so a popular value costs the same as a rare one.
 * @param tag - Tag name and values.
 * @param since - Lower created_at bound, 0 for none.
 * @param until - Upper created_at bound (inclusive).
 * @param limit - Rows wanted.
 * @param maxStatementSeconds - Statement timeout.
 */
const buildTagCandidatesQuery = (tag: DrivingTag, since: number, until: number, limit: number, maxStatementSeconds: number): { query: string, params: (string | number)[] } => {
  const params: (string | number)[] = [];
  for (const value of tag.values) {
    params.push(tag.name, value, until);
    if (since > 0) params.push(since);
  }
  const prefix = `SET STATEMENT max_statement_time = ${Number(maxStatementSeconds)} FOR `;
  const branch = tagCandidatesBranch(since, limit);
  if (tag.values.length === 1) return { query: prefix + branch, params };
  const query = `${prefix}SELECT c.event_id, c.created_at FROM (
   ${tag.values.map(() => `(${branch})`).join("\n   UNION ALL\n   ")}
   ) c ORDER BY c.created_at DESC LIMIT ${Number(limit)}`;
  return { query, params };
};

/**
 * NIP-77 / NIP-45: ids of the events of a tag, walking idx_tag_created first so since and
 * until cut the tag rows read. `where` is the rest of the filter over `events e`.
 */
const buildTagIdsQuery = (tag: DrivingTag, since: number, until: number, where: string, limit: number, maxStatementSeconds: number): { query: string, params: (string | number)[] } => {
  const params: (string | number)[] = [tag.name, ...tag.values, until];
  if (since > 0) params.push(since);
  const query = `SET STATEMENT max_statement_time = ${Number(maxStatementSeconds)} FOR
    SELECT DISTINCT e.event_id, e.pubkey, e.created_at
    FROM eventtags et FORCE INDEX (idx_tag_created)
    STRAIGHT_JOIN events e ON e.event_id = et.event_id
    WHERE et.tag_name = ? AND et.tag_value IN (${tag.values.map(() => "?").join(",")})
    AND et.created_at <= ?${since > 0 ? " AND et.created_at >= ?" : ""}
    AND e.active = '1' AND e.kind NOT IN (4, 14, 1059) ${where}
    LIMIT ${Number(limit)}`;
  return { query, params };
};

/**
 * Tag rows to read in a round of the walk: twice the events wanted to begin with (some won't
 * pass the other conditions of the filter), four times more on each round, up to TAG_WALK_MAX.
 */
const tagWalkLimit = (wanted: number, round: number): number =>
  Math.min(TAG_WALK_MAX, Math.max(TAG_WALK_MIN, wanted * 2) * Math.pow(4, round));

/**
 * Whether the walk has what the query asked for: the tag has no more rows, or there are
 * `wanted` events newer than the oldest tag row read (older rows can't get ahead of them).
 * @param createdAts - created_at of the events found so far, newest first.
 * @param wanted - Events asked for.
 * @param exhausted - The last round returned fewer tag rows than it asked for.
 * @param boundary - created_at of the oldest tag row read.
 */
const isTagWalkDone = (createdAts: number[], wanted: number, exhausted: boolean, boundary: number): boolean =>
  exhausted || (createdAts.length >= wanted && createdAts[wanted - 1] > boundary);

export { ARCHIVE_MAX_VALUES, TAG_WALK_MAX, TAG_WALK_MIN, TAG_WALK_ROUNDS, isU32, isHex64, isTagKey, archiveUntil, buildArchiveWhere, getArchiveHint, pickDrivingTag, buildTagCandidatesQuery, buildTagIdsQuery, tagWalkLimit, isTagWalkDone };
export type { DrivingTag, ArchiveWhereOptions };
