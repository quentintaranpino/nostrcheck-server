import { mediaModerationFilters, mediaModerationSelectFields, ModuleDataTables, moduleDataSelectFields, moduleDataWhereFields } from "../interfaces/admin.js";
import { dbMultiSelect, dbSelect, dbSimpleSelect } from "./database/core.js";
import { logger } from "./logger.js";

const dbCountModuleData = async (module: string, field = ""): Promise<number> => {
	const table = ModuleDataTables[module];
	if (!table) {return 0;}
	if (field) {return Number(await dbSelect(`SELECT COUNT(${field}) FROM ${table} WHERE ${field} = '1' `, `COUNT(${field})`, [])) || 0;}
    return Number(await dbSelect(`SELECT COUNT(*) FROM ${table}`, "COUNT(*)", [])) || 0;
}


const dbCountMonthModuleData = async (module: string, field: string): Promise<object> => {
	return dbCountBucketModuleData(module, field, "month");
};

/**
 * Counts rows grouped by time bucket (week / month / year).
 * - week: last 52 ISO weeks
 * - month: last 60 months (5 years)
 * - year: all years present in the table
 * The field can be either a datetime column or a unix timestamp (s or ms).
 */
const dbCountBucketModuleData = async (module: string, field: string, bucket: "week" | "month" | "year" = "month"): Promise<object> => {

	const table = ModuleDataTables[module];
	if (!table) return {};

	const formatByBucket: Record<string, { fmt: string; limit: number }> = {
		week:  { fmt: "%x-%v", limit: 52 },
		month: { fmt: "%Y-%m", limit: 60 },
		year:  { fmt: "%Y",    limit: 100 },
	};
	const { fmt, limit } = formatByBucket[bucket] || formatByBucket.month;

	const data = await dbMultiSelect(
		[
		`COUNT(*) as 'count'`,
		`DATE_FORMAT(
			IF(
				CAST(${field} AS CHAR) REGEXP '^[0-9]+$',
				IF(${field} > 9999999999, FROM_UNIXTIME(${field} / 1000), FROM_UNIXTIME(${field})),
				${field}
			),
			'${fmt}') as bucket`
		],
		`${table}`,
		`1=1 GROUP BY bucket ORDER BY bucket DESC LIMIT ${limit}`,
		[],
		false
	);

	return data;
};

async function dbSelectModuleData(module:string, offset:number, limit:number, order:string = "DESC", sort:string, search:string, filter: any): Promise<{ total: number; totalNotFiltered: number; rows: string | never[]; }>{

	const table = ModuleDataTables[module];
	if (!table) {return {total: 0, totalNotFiltered: 0, rows: []}}

	let {fieldsLogic, fromLogic, whereLogic, sortLogic, limitLogic} = {fieldsLogic: "", fromLogic: "", whereLogic: "WHERE (1=1) ", sortLogic: "", limitLogic: ""};

	fieldsLogic = moduleDataSelectFields[module];
	fromLogic = `FROM ${table}`;
    if (search) {
        const fieldsArray = moduleDataWhereFields[module].join(',').split(',');
        const fields = fieldsArray.map(field => `COALESCE(${field.trim()}, '')`).join(", ");
        whereLogic += `AND CONCAT(${fields}) LIKE "%${search}%"`;
    } else {
        whereLogic = "WHERE (1=1) ";
    }
	sort? sortLogic = `ORDER BY ${sort} ${order}`: sortLogic = `ORDER BY ${table}.id ${order}`;
	limitLogic = `LIMIT ${offset} , ${limit}`;

	if (filter && filter.length > 0){
		for (const item of filter) {
			if (item.field && item.value) {
				item.value.startsWith("!") ? whereLogic += ` AND ${item.field} != '${item.value.split("!")[1]}'` : whereLogic += ` AND ${item.field} = '${item.value}'`;
			}
		}
	}

	logger.debug(`dbSelectModuleData - executing query: SELECT ${fieldsLogic} ${fromLogic} ${whereLogic} ${sortLogic} ${limitLogic}`);
	logger.debug(`dbSelectModuleData - executing query: SELECT COUNT(*) as total FROM (SELECT ${fieldsLogic} ${fromLogic}) as ${table} ${whereLogic}`);

	const total = await dbSimpleSelect(table, `SELECT COUNT(*) as total FROM (SELECT ${fieldsLogic} ${fromLogic}) as ${table} ${whereLogic}`);
	const totalNotFiltered =  await dbCountModuleData(module);
	const data = await dbSimpleSelect(table, `SELECT * FROM (SELECT ${fieldsLogic} ${fromLogic}) as ${table} ${whereLogic} ${sortLogic} ${limitLogic}`);

	const result = {
		total: total? JSON.parse(JSON.stringify(total[0])).total : 0,
		totalNotFiltered: totalNotFiltered,
		rows: data || []
	}

	return result;
}

// An active ban on a mediafiles row. Used both to select the banned bucket and
// to keep banned files out of the pending one.
const mediaBannedExists = "EXISTS (SELECT 1 FROM banned WHERE banned.originid = mediafiles.id AND banned.origintable = 'mediafiles' AND banned.active = '1')";

/**
 * Builds the WHERE clause for the moderation gallery.
 * Every value the operator can type (mimetype, pubkey) travels as a bound
 * parameter, the status only ever picks a hardcoded clause. dbSelectModuleData
 * concatenates its filters into the SQL and we don't want to widen that.
 *
 * @param filters - status bucket, mimetype ("image/webp" or "image/*") and pubkey.
 * @returns The clause and its bound parameters.
 */
const mediaModerationWhere = (filters: mediaModerationFilters): { clause: string; params: (string | number)[] } => {

	const clauses: string[] = [];
	const params: (string | number)[] = [];

	switch (filters.status) {
		case "pending":
			// A ban is a decision already taken, so it leaves the queue. Done
			// here rather than by forcing checked = 1 on ban: checked means "the
			// classifier or the operator reviewed this" and writing it from the
			// ban path would falsify that for every other consumer of the column.
			clauses.push("mediafiles.checked <> 1 AND NOT " + mediaBannedExists);
			break;
		case "checked":
			// Deliberately every reviewed file, nsfw ones included. "checked" is
			// the column and it means reviewed, nothing more; splitting it here
			// would make this view disagree with the hosted files table and hide
			// files from the very list the reviewer uses to audit their own work.
			// The nsfw bucket below is the way to look at that subset, and the
			// gallery badges each tile so the two never look alike.
			clauses.push("mediafiles.checked = 1");
			break;
		case "nsfw":
			// Its own flag now, so the uploader's visibility switch no longer
			// leaks into this bucket.
			clauses.push("mediafiles.nsfw = 1");
			break;
		case "active":
			clauses.push("mediafiles.active = 1");
			break;
		case "inactive":
			clauses.push("mediafiles.active <> 1");
			break;
		case "banned":
			clauses.push(mediaBannedExists);
			break;
		default:
			break;
	}

	if (filters.mimetype != "") {
		if (filters.mimetype.endsWith("/*")) {
			clauses.push("mediafiles.mimetype LIKE ?");
			params.push(filters.mimetype.replace("/*", "/%"));
		} else {
			clauses.push("mediafiles.mimetype = ?");
			params.push(filters.mimetype);
		}
	}

	if (filters.pubkey != "") {
		clauses.push("mediafiles.pubkey = ?");
		params.push(filters.pubkey);
	}

	return { clause: clauses.length > 0 ? clauses.join(" AND ") : "1=1", params };
};

/**
 * Reads a page of files for the moderation gallery.
 *
 * Pages by id cursor, not by offset: the operator is changing the very flags
 * the filter selects on, so an OFFSET window would slide and skip files that
 * were never looked at. Sorted by id only (never by a user supplied column)
 * and capped at 200 rows per call.
 *
 * @param filters - status bucket, mimetype and pubkey.
 * @param cursor - Last id of the previous page, 0 for the first page.
 * @param limit - Rows to return (1-200).
 * @param order - "ASC" or "DESC", anything else falls back to "DESC".
 * @returns Total matching rows and the requested page.
 */
const dbSelectMediaModerationData = async (filters: mediaModerationFilters, cursor: number, limit: number, order: string): Promise<{ total: number; rows: Record<string, unknown>[] }> => {

	const { clause, params } = mediaModerationWhere(filters);
	const safeCursor = Number.isFinite(cursor) && cursor > 0 ? Math.floor(cursor) : 0;
	const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? Math.floor(limit) : 60, 1), 200);
	const safeOrder = order && order.toUpperCase() === "ASC" ? "ASC" : "DESC";

	let pageClause = clause;
	const pageParams = [...params];
	if (safeCursor > 0) {
		pageClause += safeOrder === "ASC" ? " AND mediafiles.id > ?" : " AND mediafiles.id < ?";
		pageParams.push(safeCursor);
	}

	const totalResult = await dbMultiSelect(["COUNT(*) as total"], "mediafiles", clause, params, true);
	const rows = await dbMultiSelect(mediaModerationSelectFields,
									"mediafiles",
									`${pageClause} ORDER BY mediafiles.id ${safeOrder}`,
									pageParams,
									false,
									`LIMIT ${safeLimit}`);

	logger.debug(`dbSelectMediaModerationData - status: ${filters.status} | mimetype: ${filters.mimetype} | pubkey: ${filters.pubkey} | cursor: ${safeCursor} | rows: ${rows.length}`);

	return { total: totalResult.length > 0 ? Number(totalResult[0].total) : 0, rows: rows || [] };
};

/**
 * Counts files per mimetype and per uploader inside a status bucket, so the
 * gallery toolbar can offer real options instead of a blank text field. The
 * uploader list is what makes the backlog tractable: a couple of pubkeys
 * usually hold most of it.
 *
 * @param filters - status bucket (mimetype and pubkey are ignored on purpose).
 * @returns Mimetypes and uploaders with their counts, most files first.
 */
const dbSelectMediaModerationFacets = async (filters: mediaModerationFilters): Promise<{ mimetypes: Record<string, unknown>[]; pubkeys: Record<string, unknown>[] }> => {

	const { clause, params } = mediaModerationWhere({ status: filters.status, mimetype: "", pubkey: "" });

	const mimetypes = await dbMultiSelect(["mediafiles.mimetype", "COUNT(*) as 'count'"],
										"mediafiles",
										`${clause} GROUP BY mediafiles.mimetype ORDER BY count DESC`,
										params,
										false,
										"LIMIT 40");

	// The username is resolved outside the GROUP BY (on the already aggregated
	// rows) so the grouped query stays plain COUNT and can't argue with
	// ONLY_FULL_GROUP_BY.
	const pubkeys = await dbMultiSelect(["uploaders.pubkey",
										"uploaders.count",
										"(SELECT registered.username FROM registered WHERE registered.hex = uploaders.pubkey LIMIT 1) as username"],
										`(SELECT mediafiles.pubkey, COUNT(*) as 'count' FROM mediafiles WHERE ${clause} GROUP BY mediafiles.pubkey ORDER BY count DESC LIMIT 20) as uploaders`,
										"1=1",
										params,
										false);

	return { mimetypes: mimetypes || [], pubkeys: pubkeys || [] };
};

// null = not probed yet. Installations that haven't migrated simply get no
// notification state instead of an error on every gallery page.
let auditlogTableAvailable: boolean | null = null;

/**
 * Bridge reader for delivery state, kept as the fallback for when
 * lib/audit/core.getNotificationStatusBulk can't be reached (the controller
 * prefers that helper and only lands here if the module isn't loadable). Same
 * shape: one entry per originid.
 *
 * Only notifiable rows count. An audit-only row (notified = 0) has no channel
 * and no status, and letting those in would drag every "worst status" down to
 * an empty string and paint "not notified" on files that never had anything to
 * notify.
 *
 * A record can have several notices (one per channel, plus retries), and the
 * interesting one is never the newest but the worst: a failure means the
 * operator believes they warned somebody and they didn't. So failed wins over
 * pending, and pending over sent. That is also the row a manual retry should
 * target, which is why the controller uses this to resolve the retry id even
 * when the audit layer supplied the status.
 *
 * If the auditlog table isn't there dbMultiSelect logs and returns an empty
 * array, which degrades to "no notification info" instead of breaking the
 * caller.
 *
 * @param origintable - Table the events point at (e.g. "mediafiles").
 * @param ids - Origin ids to look up.
 * @returns Map of originid to the notice that matters for it.
 */
const dbSelectNotificationStatusBulk = async (origintable: string, ids: number[]): Promise<Record<string, { id: number; status: string; attempts: number; lasterror: string }>> => {

	const result: Record<string, { id: number; status: string; attempts: number; lasterror: string }> = {};
	const safeIds = ids.filter(id => Number.isInteger(id) && id > 0);
	if (origintable === "" || safeIds.length === 0) return result;

	// Probe once per process instead of letting every page load fail against a
	// missing table and write an error line for it.
	if (auditlogTableAvailable === null) {
		const probe = await dbSimpleSelect("auditlog", "SHOW TABLES LIKE 'auditlog'");
		auditlogTableAvailable = probe !== "" && probe.length > 0;
		if (!auditlogTableAvailable) logger.info(`dbSelectNotificationStatusBulk - no auditlog table on this install, notification state stays empty`);
	}
	if (auditlogTableAvailable === false) return result;

	// auditlog.originid is a varchar: bind the ids as strings or MySQL casts the
	// column and idx_auditlog_origin_created stops being usable.
	const rows = await dbMultiSelect(["id", "originid", "status", "attempts", "lasterror"],
									"auditlog",
									`origintable = ? AND notified = 1 AND originid IN (${safeIds.map(() => "?").join(",")}) ORDER BY id DESC`,
									[origintable, ...safeIds.map(id => String(id))],
									false);

	const severity: { [key: string]: number } = { sent: 0, pending: 1, failed: 2 };
	for (const row of rows) {
		const key = String(row.originid);
		const current = result[key];
		const candidate = {
			id: Number(row.id),
			status: String(row.status || ""),
			attempts: Number(row.attempts) || 0,
			lasterror: String(row.lasterror || ""),
		};
		if (!current || (severity[candidate.status] || 0) > (severity[current.status] || 0)) result[key] = candidate;
	}

	return result;
};

export { dbCountModuleData, dbSelectModuleData, dbCountMonthModuleData, dbCountBucketModuleData, dbSelectMediaModerationData, dbSelectMediaModerationFacets, dbSelectNotificationStatusBulk };