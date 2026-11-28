import { logger } from "../logger.js";

const migrateOldFields = async (table:string, oldField:string, newField:string): Promise<boolean> => {
	
    const { connect } = await import("./core.js");
	const pool = await connect("migrateOldFields");
	try{
		const [dbFileStatusUpdate] = await pool.execute(
			"UPDATE " + table + " set " + newField + " = " + oldField + " where " + oldField + " is not null"
		);
		if (!dbFileStatusUpdate) {
			logger.error(`migrationOldFields - Error migrating data from old fields, table: ${table} | Old field: ${oldField} -> New field : ${newField}`);
			return false;
		}
		logger.warn(`migrationOldFields - Migrated all data from old fields, table: ${table} | Old field: ${oldField} -> New field : ${newField}`);
		return true;
	}catch (error) {
		logger.error(`migrationOldFields - Error migrating data from old fields, table: ${table} | Old field: ${oldField} -> New field : ${newField} with error: ${error}`);
		return false;
	}
}

const deleteOldFields = async (table:string, oldField:string): Promise<boolean> => {

	//Drop oldField from table
    const { connect } = await import("./core.js");
	const pool = await connect("deleteOldFields");
	try{
		const [dbFileStatusUpdate] = await pool.execute(
			"ALTER TABLE " + table + " DROP " + oldField
		);
		if (!dbFileStatusUpdate) {
			logger.error(`deleteOldFields - Error deleting old fields, table: ${table} | Old field: ${oldField}`);
			return false;
		}
		logger.warn(`deleteOldFields - Deleted old fields, table: ${table} | Old field: ${oldField}`);
		return true;

	} catch (error) {
		logger.error(`deleteOldFields - Error deleting old fields, table: ${table} | Old field: ${oldField} with error: ${error}`);
		return false;
	}
}

// Tables with more rows than this (information_schema estimate) get their indexes built or
// dropped in the background, so the server starts while MariaDB works.
const BIG_TABLE_ROWS = 1000000;
// How long an ALTER waits for the metadata lock. Queries on the table queue behind a waiting
// ALTER, so this is also the longest stall it can cause.
const INDEX_LOCK_WAIT_SECONDS = 30;
const INDEX_RETRY_MS = 2 * 60 * 1000;
const INDEX_MAX_ATTEMPTS = 15;
const INDEX_POLL_MS = 60 * 1000;
// ER_ALTER_OPERATION_NOT_SUPPORTED and ER_ALTER_OPERATION_NOT_SUPPORTED_REASON
const ALTER_NOT_SUPPORTED = [1845, 1846];

interface TableStats {
	rows: number;
	engine: string;
}

interface IndexJob {
	table: string;
	name: string;
	action: "add" | "drop";
	statement: string;
	// Name of the jobstate row that has to be done before this runs; empty for none.
	afterJob: string;
	attempts: number;
	nextTry: number;
}

const indexJobs: IndexJob[] = [];
let indexRunnerActive = false;
let indexJobRunning = "";

/**
 * Name of the index an `_indexes` definition creates, or null when it can't be read.
 * @param indexDef - e.g. "UNIQUE INDEX idx_name (col_a, col_b(100))".
 */
const parseIndexName = (indexDef: string): string | null => {
	const match = indexDef.match(/INDEX\s+`?([^\s`(]+)`?\s*\(/i);
	return match ? match[1] : null;
}

/**
 * Whether an index can be added or dropped with ALGORITHM=INPLACE, LOCK=NONE: InnoDB only,
 * and not FULLTEXT or SPATIAL, which need a lock.
 * @param engine - Storage engine of the table.
 * @param indexDef - The index definition; empty for a drop.
 */
const isOnlineIndex = (engine: string, indexDef: string = ""): boolean =>
	String(engine).toLowerCase() == "innodb" && !/^\s*(FULLTEXT|SPATIAL)\b/i.test(indexDef);

/**
 * ALTER that adds an index, online when the engine allows it.
 */
const buildAddIndexStatement = (table: string, indexDef: string, online: boolean): string =>
	`ALTER TABLE \`${table}\` ADD ${indexDef}${online ? ", ALGORITHM=INPLACE, LOCK=NONE" : ""}`;

/**
 * ALTER that drops an index, online when the engine allows it.
 */
const buildDropIndexStatement = (table: string, indexName: string, online: boolean): string =>
	`ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\`${online ? ", ALGORITHM=INPLACE, LOCK=NONE" : ""}`;

/**
 * Picks the next background index job: the first one whose retry time has come and whose
 * gate (the job it waits for) is open. Null when every job has to wait.
 * @param jobs - Queue, in order.
 * @param now - Date.now().
 * @param doneJobs - Names of the jobstate rows that are done.
 */
const pickIndexJob = (jobs: IndexJob[], now: number, doneJobs: Set<string>): IndexJob | null => {
	for (const job of jobs) {
		if (job.nextTry > now) continue;
		if (job.afterJob != "" && !doneJobs.has(job.afterJob)) continue;
		return job;
	}
	return null;
}

/**
 * Whether a background index build or drop is running on a table right now (any table when
 * none is given). Bulk updates should wait for it: they fill the online ALTER log.
 */
const isIndexJobRunning = (table: string = ""): boolean =>
	indexJobRunning != "" && (table == "" || indexJobRunning == table);

const getTableStats = async (table: string): Promise<TableStats> => {
	const { connect } = await import("./core.js");
	const pool = await connect(`getTableStats | table: ${table}`);
	const [rows] = await pool.execute(
		"SELECT TABLE_ROWS AS tableRows, ENGINE AS engine FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
		[table]
	);
	const row = (rows as any[])[0];
	return { rows: Number(row?.tableRows) || 0, engine: String(row?.engine || "") };
}

const indexExists = async (table: string, indexName: string): Promise<boolean> => {
	const { connect } = await import("./core.js");
	const pool = await connect(`indexExists | table: ${table}`);
	const [rows] = await pool.execute(`SHOW INDEXES FROM \`${table}\` WHERE Key_name = ?`, [indexName]);
	return Array.isArray(rows) && rows.length > 0;
}

// Runs an ALTER on its own connection with a short metadata lock wait, so a long query on the
// table makes the ALTER give up instead of stalling everything queued behind it.
const runIndexStatement = async (statement: string): Promise<void> => {
	const { connect } = await import("./core.js");
	const pool = await connect("runIndexStatement");
	const conn = await pool.getConnection();
	try {
		await conn.query(`SET SESSION lock_wait_timeout = ${INDEX_LOCK_WAIT_SECONDS}`);
		await conn.query(statement);
	} finally {
		try { await conn.query("SET SESSION lock_wait_timeout = DEFAULT"); } catch { /* connection gone */ }
		conn.release();
	}
}

const getDoneJobs = async (): Promise<Set<string>> => {
	const done = new Set<string>();
	try {
		const { connect } = await import("./core.js");
		const pool = await connect("getDoneJobs");
		const [rows] = await pool.execute("SELECT name FROM jobstate WHERE done = 1");
		(rows as { name: string }[]).forEach(row => done.add(row.name));
	} catch (error) {
		logger.debug(`getDoneJobs - Error reading jobstate: ${error}`);
	}
	return done;
}

// Works through the background index jobs one at a time. A job that fails is tried again
// later: the index is looked up by name first, so an ALTER that an earlier process left
// running on the server (or that was rolled back half-built) is simply waited for or redone.
const runIndexJobs = async (): Promise<void> => {
	if (indexRunnerActive) return;
	indexRunnerActive = true;
	try {
		while (indexJobs.length > 0) {
			const gated = indexJobs.some(job => job.afterJob != "");
			const job = pickIndexJob(indexJobs, Date.now(), gated ? await getDoneJobs() : new Set());
			if (!job) {
				await new Promise(resolve => setTimeout(resolve, INDEX_POLL_MS));
				continue;
			}
			const remove = () => { const i = indexJobs.indexOf(job); if (i != -1) indexJobs.splice(i, 1); };
			const label = `${job.action} index ${job.name} on ${job.table}`;
			try {
				const exists = await indexExists(job.table, job.name);
				if (exists == (job.action == "add")) {
					if (job.attempts > 0) logger.info(`runIndexJobs - ${label}: already done`);
					remove();
					continue;
				}
				job.attempts++;
				logger.info(`runIndexJobs - ${label}: started in the background (attempt ${job.attempts}) => ${job.statement}`);
				const started = Date.now();
				indexJobRunning = job.table;
				try {
					await runIndexStatement(job.statement);
				} finally {
					indexJobRunning = "";
				}
				logger.info(`runIndexJobs - ${label}: finished in ${Math.round((Date.now() - started) / 1000)} s`);
				remove();
			} catch (error) {
				if (job.attempts >= INDEX_MAX_ATTEMPTS) {
					logger.error(`runIndexJobs - ${label}: giving up until the next start after ${job.attempts} attempts: ${error}`);
					remove();
				} else {
					logger.error(`runIndexJobs - ${label}: failed, trying again in ${INDEX_RETRY_MS / 1000} s: ${error}`);
					job.nextTry = Date.now() + INDEX_RETRY_MS;
				}
			}
		}
	} finally {
		indexRunnerActive = false;
	}
}

const enqueueIndexJob = (job: Omit<IndexJob, "attempts" | "nextTry">): void => {
	if (indexJobs.some(j => j.table == job.table && j.name == job.name && j.action == job.action)) return;
	indexJobs.push({ ...job, attempts: 0, nextTry: 0 });
	logger.info(`enqueueIndexJob - ${job.action} index ${job.name} on ${job.table} queued for the background${job.afterJob != "" ? ` (after job ${job.afterJob})` : ""}`);
	runIndexJobs().catch(error => logger.error(`runIndexJobs - Background index runner stopped: ${error}`));
}

// Runs an index ALTER now. A small table that can't take the online clauses gets the plain one.
const runIndexNow = async (table: string, statement: string, fallback: string): Promise<void> => {
	try {
		await runIndexStatement(statement);
	} catch (error) {
		if (statement == fallback || !ALTER_NOT_SUPPORTED.includes((error as { errno?: number })?.errno ?? 0)) throw error;
		logger.warn(`runIndexNow - Online ALTER not supported on ${table}, running it without: ${error}`);
		await runIndexStatement(fallback);
	}
}

/**
 * Creates the indexes of a table that are missing, online (ALGORITHM=INPLACE, LOCK=NONE) when
 * the engine allows it. Small tables are done before returning; on a table over
 * BIG_TABLE_ROWS the work is queued and runs in the background, one index at a time.
 * A failure is logged and never stops the startup: the index is looked up again by name on
 * the next start.
 * @param {string} tableName - The name of the table to check and create indexes for.
 * @param {string[]} indexes - An array of strings representing the index definitions to create.
 * @param {Record<string, string>} afterJob - Index name => jobstate row that has to be done
 * before the index is built on a big table (e.g. a backfill of one of its columns).
 * @returns {Promise<boolean>} False when some index could not be created.
 * @async
 */
async function checkAndCreateIndexes(tableName: string, indexes: string[], afterJob: Record<string, string> = {}): Promise<boolean> {

	let allOk = true;
	let stats: TableStats | null = null;
	for (const indexDef of indexes) {
		const indexName = parseIndexName(indexDef);
		if (!indexName) {
			logger.warn(`checkAndCreateIndexes - Skipping invalid index definition '${indexDef}' on table '${tableName}'`);
			continue;
		}
		try {
			if (await indexExists(tableName, indexName)) continue;
			if (!stats) stats = await getTableStats(tableName);
			const online = isOnlineIndex(stats.engine, indexDef);
			const statement = buildAddIndexStatement(tableName, indexDef, online);
			if (stats.rows > BIG_TABLE_ROWS) {
				enqueueIndexJob({ table: tableName, name: indexName, action: "add", statement, afterJob: afterJob[indexName] || "" });
				continue;
			}
			logger.info(`checkAndCreateIndexes - Creating index on table ${tableName} => ${statement}`);
			await runIndexNow(tableName, statement, buildAddIndexStatement(tableName, indexDef, false));
		} catch (error) {
			logger.error(`checkAndCreateIndexes - Error creating index ${indexName} on table ${tableName}: ${error}`);
			allOk = false;
		}
	}
	return allOk;
}

/**
 * Drops the indexes a table declares obsolete (`_dropIndexes`), if they are still there.
 * Same rules as checkAndCreateIndexes: online, in the background on big tables, never fatal.
 * An index that `_indexes` still declares is left alone.
 * @param {string} tableName - The name of the table.
 * @param {string[]} indexNames - Names of the indexes to drop.
 * @param {string[]} declared - The `_indexes` definitions of the table.
 * @returns {Promise<boolean>} False when some index could not be dropped.
 * @async
 */
async function checkAndDropIndexes(tableName: string, indexNames: string[], declared: string[] = []): Promise<boolean> {

	let allOk = true;
	let stats: TableStats | null = null;
	const declaredNames = declared.map(parseIndexName);
	for (const indexName of indexNames) {
		if (!/^\w+$/.test(indexName) || indexName.toUpperCase() == "PRIMARY") {
			logger.warn(`checkAndDropIndexes - Skipping invalid index name '${indexName}' on table '${tableName}'`);
			continue;
		}
		if (declaredNames.includes(indexName)) {
			logger.warn(`checkAndDropIndexes - Index ${indexName} on table ${tableName} is both declared and marked to drop, keeping it`);
			continue;
		}
		try {
			if (!await indexExists(tableName, indexName)) continue;
			if (!stats) stats = await getTableStats(tableName);
			const statement = buildDropIndexStatement(tableName, indexName, isOnlineIndex(stats.engine));
			if (stats.rows > BIG_TABLE_ROWS) {
				enqueueIndexJob({ table: tableName, name: indexName, action: "drop", statement, afterJob: "" });
				continue;
			}
			logger.info(`checkAndDropIndexes - Dropping obsolete index on table ${tableName} => ${statement}`);
			await runIndexNow(tableName, statement, buildDropIndexStatement(tableName, indexName, false));
		} catch (error) {
			logger.error(`checkAndDropIndexes - Error dropping index ${indexName} on table ${tableName}: ${error}`);
			allOk = false;
		}
	}
	return allOk;
}

async function checkDatabaseConsistency(table: string, column_name:string, type:string, after_column:string): Promise<boolean> {

	//Check if table exist
	const CheckTableExistStatement: string =
	"SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES " +
	"WHERE (table_name = ?) " +
	"AND (table_schema = DATABASE())";

    const { connect } = await import("./core.js");
	const pool = await connect("checkDatabaseConsistency | Table: " + table + " | Column: " + column_name, );

	try{
		const [CheckTable] = await pool.execute(CheckTableExistStatement, [table]);
		const rowstempCheckTable = JSON.parse(JSON.stringify(CheckTable));
		if (rowstempCheckTable[0]['COUNT(*)'] == 0) {
			logger.debug("Table not found:", table);
			logger.info("Creating table:", table);
			const CreateTableStatement: string =
				"CREATE TABLE IF NOT EXISTS " + table + " (" + column_name + " " + type + ");";
			await pool.execute(CreateTableStatement);
			if (!CreateTableStatement) {
				logger.error("Error creating table:", table);
				return false;
			}
			return true;
		}
	} catch (error) {
		logger.error("Error checking table consistency", error);
		return false;
	} 

	const CheckTableColumnsStatement: string =
	"SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS " +
	"WHERE (table_name = ?) " +
	"AND (table_schema = DATABASE()) " +
	"AND (column_name = ?)";

	//If exist, we insert before the specified column
	if (after_column != "") {after_column = " AFTER " + after_column;}

	try{
		const [CheckTable] = await pool.execute(CheckTableColumnsStatement, [table, column_name]);
		const rowstempCheckTable = JSON.parse(JSON.stringify(CheckTable));
		if (rowstempCheckTable[0]['COUNT(*)'] == 0) {
			logger.debug("Column not found in table:", table, "column:", column_name);
			logger.info("Creating column:", column_name, "in table:", table);
			const AlterTableStatement: string =
				"ALTER TABLE " + table + " ADD " + column_name + " " + type + after_column;
			// On a big table the column has to be added without rebuilding it. If MariaDB can't
			// do it instantly, it is added online instead of locking the table for the copy.
			const stats = await getTableStats(table);
			if (stats.rows > BIG_TABLE_ROWS && isOnlineIndex(stats.engine)) {
				try {
					await pool.execute(AlterTableStatement + ", ALGORITHM=INSTANT");
				} catch (error) {
					if (!ALTER_NOT_SUPPORTED.includes((error as { errno?: number })?.errno ?? 0)) throw error;
					logger.warn(`checkDatabaseConsistency - Column ${column_name} can't be added instantly to ${table}, rebuilding the table online: ${error}`);
					await pool.execute(AlterTableStatement + ", ALGORITHM=INPLACE, LOCK=NONE");
				}
			} else {
				await pool.execute(AlterTableStatement);
			}

			// Check if the new column is a migration from an old column, migrate data and delete old column.
			let result = false;
			const { newFieldcompatibility} = await import("../../interfaces/database.js");
			for (let i = 0; i < newFieldcompatibility.length; i++) {
				if (newFieldcompatibility[i].newfield == column_name){
					result = await migrateOldFields(table, newFieldcompatibility[i].oldField, newFieldcompatibility[i].newfield);
				}
				if (result){
					result = await deleteOldFields(table, newFieldcompatibility[i].oldField);
				}
			}

			if (!AlterTableStatement) {
				logger.error("Error creating column:", column_name, "in table:", table);
				return false;
			}
			return true;
		}
		return true;
	} catch (error) {
		logger.error("Error checking table consistency", error);
		return false;
	} 
}

async function populateTables(): Promise<boolean> {

	const { databaseTables } = await import("../../interfaces/database.js");
    for (const table of databaseTables) {
        for (const structure of Object.values(table)) {
            for (const [key, value] of Object.entries(structure as object)) {
				if (key == "constructor") {continue;}

				// Index work never stops the startup: what fails is logged and tried again on the next one.
				if (key === "_indexes") {
					const indexes = value as string[];
					const tableName = Object.keys(table).toString();
					const afterJob = ((structure as Record<string, unknown>)["_indexAfterJob"] || {}) as Record<string, string>;
					const result = await checkAndCreateIndexes(tableName, indexes, afterJob);
					if (!result) logger.error("Failed creating indexes on table:", tableName);
					continue;
				}

				if (key === "_dropIndexes") {
					const tableName = Object.keys(table).toString();
					const declared = ((structure as Record<string, unknown>)["_indexes"] || []) as string[];
					const result = await checkAndDropIndexes(tableName, value as string[], declared);
					if (!result) logger.error("Failed dropping obsolete indexes on table:", tableName);
					continue;
				}

				if (key.startsWith("_")) {continue;}

                let after_column :string = "";
                if (Object.keys(structure).indexOf(key,0) != 0){
                    after_column = Object.entries(structure)[Object.keys(structure).indexOf(key,0)-1][0];
                }
                const check = await checkDatabaseConsistency(Object.keys(table).toString(), key, value, after_column);
                if (!check) {
                    logger.error("Error checking database table domains");
                    process.exit(1);
                }
            }
        }
    }
    return true;
}


/**
 * Declarative column migrations applied at boot. populateTables() only creates
 * missing columns; this registry handles type changes on existing columns.
 * Add new entries here when a column's spec changes — the migration is
 * idempotent so reboots are no-ops once applied.
 *
 * - expectedType: the lowercase DATA_TYPE returned by INFORMATION_SCHEMA.COLUMNS
 *                 (e.g. "bigint", "int", "varchar"). The migration triggers
 *                 when the live type differs from this.
 * - fullSpec:     used verbatim in `ALTER TABLE … MODIFY <column> <fullSpec>`.
 * - preCleanup:   optional SQL run before the ALTER (e.g. NULL→0 fixups
 *                 needed when the new type adds NOT NULL).
 */
interface ColumnMigration {
	table: string;
	column: string;
	expectedType: string;
	fullSpec: string;
	preCleanup?: string;
	description: string;
}

const columnMigrations: ColumnMigration[] = [
	{
		table: "mediafiles",
		column: "filesize",
		expectedType: "bigint",
		fullSpec: "BIGINT UNSIGNED NOT NULL DEFAULT 0",
		preCleanup: "UPDATE mediafiles SET filesize = '0' WHERE filesize IS NULL OR filesize = '' OR filesize NOT REGEXP '^[0-9]+$'",
		description: "VARCHAR(15) → BIGINT UNSIGNED (lexicographic comparisons silently broke numeric queries)",
	},
];

const ensureColumnType = async (m: ColumnMigration): Promise<boolean> => {

	const { connect } = await import("./core.js");
	const pool = await connect(`ensureColumnType | ${m.table}.${m.column}`);
	try {
		const [rows] = await pool.execute(
			`SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
			 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
			[m.table, m.column]
		);
		const dataType = (rows as any[])[0]?.DATA_TYPE?.toLowerCase();
		if (!dataType) return true;                   // column not present yet, populateTables will create it
		if (dataType === m.expectedType) return true; // already migrated

		logger.warn(`ensureColumnType - ${m.table}.${m.column}: '${dataType}' → '${m.expectedType}' (${m.description})`);

		if (m.preCleanup) {
			const [r] = await pool.execute(m.preCleanup);
			const cleaned = (r as any).affectedRows || 0;
			if (cleaned > 0) logger.warn(`ensureColumnType - ${m.table}.${m.column}: cleaned ${cleaned} rows before ALTER`);
		}

		await pool.execute(`ALTER TABLE \`${m.table}\` MODIFY \`${m.column}\` ${m.fullSpec}`);
		logger.info(`ensureColumnType - ${m.table}.${m.column} migrated to ${m.fullSpec}`);
		return true;
	} catch (error) {
		logger.error(`ensureColumnType - ${m.table}.${m.column}: ${error}`);
		return false;
	}
}

const applyColumnMigrations = async (): Promise<boolean> => {
	for (const m of columnMigrations) {
		const ok = await ensureColumnType(m);
		if (!ok) return false;
	}
	return true;
}

const fixOldMimeType = async (): Promise<boolean> => {

    const { connect } = await import("./core.js");
	const pool = await connect("fixOldMimeType");
	try{
		const [dbFileStatusUpdate] = await pool.execute(
			`UPDATE mediafiles
			SET mimetype = 
				CASE 
					WHEN filename LIKE '%.png' THEN 'image/png'
					WHEN filename LIKE '%.jpg' OR filename LIKE '%.jpeg' THEN 'image/jpeg'
					WHEN filename LIKE '%.webp' THEN 'image/webp'
					WHEN filename LIKE '%.mp4' THEN 'video/mp4'
					WHEN filename LIKE '%.webm' THEN 'video/webm'
					ELSE mimetype 
				END
			WHERE mimetype <> 
				CASE 
					WHEN filename LIKE '%.png' THEN 'image/png'
					WHEN filename LIKE '%.jpg' OR filename LIKE '%.jpeg' THEN 'image/jpeg'
					WHEN filename LIKE '%.webp' THEN 'image/webp'
					WHEN filename LIKE '%.mp4' THEN 'video/mp4'
					WHEN filename LIKE '%.webm' THEN 'video/webm'
					ELSE mimetype
				END;
			`
		);
		if (!dbFileStatusUpdate) {
			logger.error(`fixOldMimeType - Error fixing old mimetypes from mediafiles table`);
			return false;
		}
		const result = dbFileStatusUpdate as any as { affectedRows: number };
		if (result.affectedRows > 0) logger.info(`fixOldMimeType - Fixed old mimetypes from mediafiles table`);
		return true;
	}catch (error) {
		logger.error(`fixOldMimeType - Error fixing old mimetypes from mediafiles table with error: ${error}`);
		return false;
	}
}

/**
 * Backfills the nsfw flag for installations that predate the column.
 *
 * Before the flag existed, "reviewed but not in the shop window" was expressed
 * as checked = 1 AND visibility = 0, so that pair is what becomes nsfw = 1.
 *
 * visibility is deliberately left untouched. Some of those files are hidden
 * because the uploader hid them from their own client (PUT /media/:id/visibility/0),
 * and flipping them back to visible would be overriding a user's preference
 * without being asked. The new flag already produces the intended effect on its
 * own, so the old value can simply stay as it is.
 *
 * Idempotent: the WHERE excludes rows that already carry the flag, so a second
 * boot updates nothing.
 */
const backfillNsfwFlag = async (): Promise<boolean> => {

	const { connect } = await import("./core.js");
	const pool = await connect("backfillNsfwFlag");
	try {
		const [dbNsfwUpdate] = await pool.execute(
			`UPDATE mediafiles
			SET nsfw = 1
			WHERE nsfw <> 1
			AND checked = 1
			AND visibility = 0`
		);
		if (!dbNsfwUpdate) {
			logger.error(`backfillNsfwFlag - Error backfilling the nsfw flag on mediafiles table`);
			return false;
		}
		const result = dbNsfwUpdate as any as { affectedRows: number };
		if (result.affectedRows > 0) logger.info(`backfillNsfwFlag - Flagged ${result.affectedRows} file(s) as nsfw from the old checked + not visible pair`);
		return true;
	} catch (error) {
		logger.error(`backfillNsfwFlag - Error backfilling the nsfw flag on mediafiles table with error: ${error}`);
		return false;
	}
}

const initDatabase = async (): Promise<void> => {

	//Check database integrity
	const dbtables = await populateTables();
	if (!dbtables) {
		logger.error(`initDatabase - Error checking database integrity. Exiting.`);
		process.exit(1);
	}

	// Type migrations on existing columns (populateTables only creates missing columns).
	const migrationsOk = await applyColumnMigrations();
	if (!migrationsOk) {
		logger.error(`initDatabase - Error applying column migrations. Exiting.`);
		process.exit(1);
	}

	const { getConfig } = await import("../config/core.js");
	const serverHost = getConfig(null, ["server", "host"])
	const serverPubkey = getConfig(null, ["server", "pubkey"])

	// Check if default domain exist on domains table and create it if not.
    const { dbSelect, dbInsert } = await import("./core.js");
	const defaultDomain = await dbSelect("SELECT domain FROM domains WHERE domain = ?", "domain", [serverHost]) as string;
	if (defaultDomain == ""){
		logger.warn(`intiDatabase - Default domain not found, creating it (${serverHost})`);
		const fields: string[] = ["domain", "active", "comments"];
		const values: string[] = [serverHost, "1", "Default domain generated by server on first run"];
		const insert = await dbInsert("domains", fields, values);
		if (insert === 0){
			logger.error(`initDatabase - Error creating default domain (${serverHost}). Exiting.`);
			process.exit(1);
		}
		logger.info(`initDatabase - Default domain created (${serverHost})`);
	}

	// Check if public username exist on registered table and, if not, create it. Also it sends a DM to the pubkey with the credentials
	const publicUsername = await dbSelect("SELECT username FROM registered WHERE username = ?", "username", ["public"]) as string;

	if (publicUsername == "" || publicUsername == undefined || publicUsername == null){
		logger.warn(`initDatabase - Public username not found, creating it (${serverPubkey})`);

        const { addNewUsername } = await import("../register.js");
		const createPublicUser = await addNewUsername("public", serverPubkey, "", serverHost, "public username generated by server on first run", true, "", false, true, true);

		if (createPublicUser == 0){
			logger.error(`initDatabase - Error creating public username (${serverPubkey}). Exiting.`);
			process.exit(1);
		}
	}

	// Check if public lightning address exist on lightning table and create it if not.
	const publicLightning = await dbSelect("SELECT lightningaddress FROM lightning", "lightningaddress", []) as string;
	if (publicLightning == ""){
		logger.warn(`initDatabase - Public lightning address not found, creating it (${serverPubkey})`);
		const fields: string[] = ["pubkey", "lightningaddress", "comments"];
		const values: string[] = [serverPubkey, "YourRealLightningAddress", "Public lightning redirect generated by server on first run, edit this to recieve SATS on your wallet"];
		const insert = await dbInsert("lightning", fields, values);
		if (insert === 0){
			logger.error(`initDatabase - Error creating public lightning address (${serverPubkey}). Exiting.`);
			process.exit(1);
		}
		logger.info(`initDatabase - Public lightning address created (${serverPubkey})`);
	}

	// Check if standard accounts exist on accounts table and create it if not.
	const checkAccounts = await dbSelect("SELECT accountid FROM accounts ", "accountid", [], false) as string[]
    const { accounts } = await import("../../interfaces/payments.js");
	for (const account of accounts) {
		if (!checkAccounts.toString().includes(account.accountid.toString())) {
			logger.warn(`initDatabase - Standard account not found, creating it: ${account.accountname}`);
			const fields: string[] = ["accountid", "active", "accountname", "accounttype", "createddate", "comments"];
			const { getNewDate } = await import("../utils.js");
			const values: any[] = [account.accountid, "1", account.accountname, account.accounttype, getNewDate(), account.comments];
			const insert = await dbInsert("accounts", fields, values);
			if (insert === 0){
				logger.error(`initDatabase - Error creating standard account: ${account.accountname}`);
				process.exit(1);
			}
			logger.info(`initDatabase - Standard account created: ${account.accountname}`);
		}
	}

	// Fix old mimetype
	const fixMimetype =await fixOldMimeType();
	if (!fixMimetype){
		logger.error(`initDatabase - Error fixing old mimetype for mediafiles table. Exiting.`);
		process.exit(1);
	}

	// Backfill the nsfw flag. Runs after populateTables created the column, and
	// doesn't take the server down if it fails: the flag stays at its default and
	// the operator gets an error in the log, which beats refusing to boot.
	const backfillNsfw = await backfillNsfwFlag();
	if (!backfillNsfw) logger.error(`initDatabase - Error backfilling the nsfw flag for mediafiles table, moderation flags may be incomplete`);

	// Insert default media types if table is empty
    const { dbMultiSelect } = await import("./core.js");
	const existingFileTypes = await dbMultiSelect(["id"], "filetypes", "1 = 1", [], false);
	if (existingFileTypes.length === 0) {
        const { fileTypes } = await import("../../interfaces/media.js");
		const filetypeRecords = fileTypes.map(type => [
			1,
			type.originalMime,
			type.extension,
			type.convertedMime,
			type.convertedExtension || "",
			"" 
		]);
        const { dbBulkInsert } = await import("./core.js");
		const inserted = await dbBulkInsert(
			"filetypes",
			["active", "original_mime", "original_extension", "converted_mime", "converted_extension", "comments"],
			filetypeRecords
		);
	
		if (inserted === 0) {
			logger.error("initDatabase - Failed to insert default filetypes");
			process.exit(1);
		}
	
		logger.info(`initDatabase - Inserted ${inserted} default filetypes`);
	}

	// Delete rows from mediafiles where status <> 'success' or 'completed' or 'percentage' = '0'
	// This is to delete any media that is not processed or failed.
	const mediaToDelete = await dbMultiSelect(["id"], "mediafiles", "(status <> 'success' AND status <> 'completed')", [], false);
	if (mediaToDelete.length > 0) {
        const { dbDelete } = await import("./core.js");
		await dbDelete("mediafiles", ["status"], ["error"]);
		await dbDelete("mediafiles", ["status"], ["failed"]);
		await dbDelete("mediafiles", ["status"], ["processing"]);
	}
	
}


export { initDatabase, parseIndexName, isOnlineIndex, buildAddIndexStatement, buildDropIndexStatement, pickIndexJob, isIndexJobRunning, BIG_TABLE_ROWS };
export type { IndexJob };