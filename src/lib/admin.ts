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
			clauses.push("mediafiles.checked <> 1");
			break;
		case "checked":
			clauses.push("mediafiles.checked = 1");
			break;
		case "active":
			clauses.push("mediafiles.active = 1");
			break;
		case "inactive":
			clauses.push("mediafiles.active <> 1");
			break;
		case "banned":
			clauses.push("EXISTS (SELECT 1 FROM banned WHERE banned.originid = mediafiles.id AND banned.origintable = 'mediafiles' AND banned.active = '1')");
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

export { dbCountModuleData, dbSelectModuleData, dbCountMonthModuleData, dbCountBucketModuleData, dbSelectMediaModerationData, dbSelectMediaModerationFacets };