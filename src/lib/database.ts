import { createPool, Pool,RowDataPacket } from "mysql2/promise";
import config from "config";
import { logger } from "./logger.js";
import { newFieldcompatibility, databaseTables} from "../interfaces/database.js";
import { updateLocalConfigKey } from "./config.js";
import { exit } from "process";
import { npubEncode } from "nostr-tools/nip19";
import { generateCredentials } from "./authorization.js";
import app from "../app.js";
import { accounts } from "../interfaces/payments.js";
import { addNewUsername } from "./register.js";
import { getNewDate } from "./utils.js";

let pool: Pool;
let retry :number = 0;
async function connect(source:string): Promise<Pool> {

	if (pool) {
		return pool;
	}

	const DatabaseHost :string = process.env.DATABASE_HOST || config.get('database.host');
	const DatabaseUser :string = process.env.DATABASE_USER || config.get('database.user');
	const DatabasePassword :string = process.env.DATABASE_PASSWORD || config.get('database.password');
	const Database :string = process.env.DATABASE_DATABASE || config.get('database.database');

	try{
		const connection = await createPool({
			host: DatabaseHost,
			user: DatabaseUser,
			password: DatabasePassword,
			database: Database,
			waitForConnections: true,
			connectionLimit: 100,

			});
			await connection.getConnection();
			logger.debug("Created new connection thread to database", source)
			retry = 0;
			return connection;
	}catch (error) {
			logger.fatal(`There is a problem connecting to mysql server, is mysql-server package installed on your system? : ${error}`);
			retry++;
			if (retry === 3){
				logger.fatal("Mariadb server is not responding, please check your configuration");
				process.exit(1);
			}
			logger.fatal("Retrying connection to database in 10 seconds", "retry:", retry + "/3");
			await new Promise(resolve => setTimeout(resolve, 10000));
			const conn_retry = await connect(source);
			if (conn_retry != undefined){
				return conn_retry;
			}
			process.exit(1);
	}

}

async function populateTables(resetTables: boolean): Promise<boolean> {
    if (await resetTables) {
        // Put database.droptables to false for next run
        if (!await updateLocalConfigKey("database.droptables", "false")){
            logger.error("Error updating database.droptables in config file, exiting program to avoid data corruption");
            exit(1);
        }

        const conn = await connect("populateTables");
        try {
            for (const table of databaseTables) {
                logger.info("Dropping table:", Object.keys(table).toString());
                const DropTableStatement = "DROP TABLE IF EXISTS " + Object.keys(table).toString() + ";";
                await conn.query(DropTableStatement);
            }
        } catch (error) {
            conn.end();
            logger.error("Error dropping tables", error);
            return false;
        }
    }

    // Check tables consistency
    for (const table of databaseTables) {
        for (const structure of Object.values(table)) {
            for (const [key, value] of Object.entries(structure as object)) {
                if (key == "constructor") {continue;}

                let after_column :string = "";
                if (Object.keys(structure).indexOf(key,0) != 0){
                    after_column = Object.entries(structure)[Object.keys(structure).indexOf(key,0)-1][0];
                }
                const check = await checkDatabaseConsistency(Object.keys(table).toString(), key, value, after_column);
                if (!check) {
                    logger.fatal("Error checking database table domains");
                    process.exit(1);
                }
            }
        }
    }
    return true;
}


async function checkDatabaseConsistency(table: string, column_name:string, type:string, after_column:string): Promise<boolean> {

	const conn = await connect("checkDatabaseConsistency | Table: " + table + " | Column: " + column_name, );

	//Check if table exist
	const CheckTableExistStatement: string =
	"SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES " +
	"WHERE (table_name = ?) " +
	"AND (table_schema = DATABASE())";

	try{
		const [CheckTable] = await conn.query(CheckTableExistStatement, [table]);
		const rowstempCheckTable = JSON.parse(JSON.stringify(CheckTable));
		if (rowstempCheckTable[0]['COUNT(*)'] == 0) {
			logger.warn("Table not found:", table);
			logger.info("Creating table:", table);
			const CreateTableStatement: string =
				"CREATE TABLE IF NOT EXISTS " + table + " (" + column_name + " " + type + ");";
			await conn.query(CreateTableStatement);
			conn.end();
			if (!CreateTableStatement) {
				logger.error("Error creating table:", table);
				return false;
			}
			return true;
		}
	}catch (error) {
		logger.error("Error checking table consistency", error);
		conn.end();
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
		const [CheckTable] = await conn.query(CheckTableColumnsStatement, [table, column_name]);
		const rowstempCheckTable = JSON.parse(JSON.stringify(CheckTable));
		if (rowstempCheckTable[0]['COUNT(*)'] == 0) {
			logger.warn("Column not found in table:", table, "column:", column_name);
			logger.info("Creating column:", column_name, "in table:", table);
			const AlterTableStatement: string =
				"ALTER TABLE " + table + " ADD " + column_name + " " + type + after_column + ";";
			await conn.query(AlterTableStatement);
			conn.end();

			// Check if the new column is a migration from an old column, migrate data and delete old column.
			let result = false;
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
		conn.end();
		return true;
	}catch (error) {
		logger.error("Error checking table consistency", error);
		conn.end();
		return false;
	}
}

/**
 * Updates a record in the database table.
 * 
 * @param tableName - The name of the table to update.
 * @param selectFieldName - The name of the field to update.
 * @param selectFieldValue - The new value for the field.
 * @param whereFieldName - Array of names of the fields to use in the WHERE clause.
 * @param whereFieldValue - Array of values of the fields to use in the WHERE clause.
 * @returns A Promise that resolves to a boolean indicating whether the update was successful.
 */
const dbUpdate = async (
	tableName: string,
	selectFieldName: string,
	selectFieldValue: any,
	whereFieldName: string[],
	whereFieldValue: any[]
  ): Promise<boolean> => {
	if (whereFieldName.length !== whereFieldValue.length) {
		logger.error('whereFieldName and whereFieldValue must have the same length');
		return false;
	}
  
	const conn = await connect("dbUpdate: " + selectFieldName + " | Table: " + tableName);
	try {
	  let whereClause = whereFieldName.map((field) => `${field} = ?`).join(' AND ');
	  const params = [selectFieldValue].concat(whereFieldValue);
	  const [dbFileFieldUpdate] : any[] = await conn.execute(
		`UPDATE ${tableName} SET ${selectFieldName} = ? WHERE ${whereClause}`,
		params
	);
	  if (!dbFileFieldUpdate) {
		logger.error("Error updating " + tableName + " table | " + whereFieldName.join(', ') + " :", whereFieldValue.join(', ') +  " | " + selectFieldName + " :", selectFieldValue);
		conn.end();
		return false;
	  }

	  if (dbFileFieldUpdate.affectedRows === 0) {
		logger.warn("No rows updated in " + tableName + " table | " + whereFieldName.join(', ') + " :", whereFieldValue.join(', ') +  " | " + selectFieldName + " :", selectFieldValue);
		conn.end();
		return false;
	  }

	  conn.end();
	  return true;
	} catch (error) {
	  logger.error("Error updating " + tableName + " table | " + whereFieldName.join(', ') + " :", whereFieldValue.join(', ') +  " | " + selectFieldName + " :", selectFieldValue);
	  conn.end();
	  return false;
	}
  };
  
/**
 * Inserts data into the specified table in the database.
 * 
 * @param tableName - The name of the table to insert data into.
 * @param fields - An array of field names in the table.
 * @param values - An array of values to insert into the table.
 * @returns A Promise that resolves to the ID of the inserted record, or 0 if an error occurred.
 */
const dbInsert = async (tableName: string, fields: string[], values: (string | number | boolean)[]): Promise<number> => {
	const conn = await connect("dbInsert:" + tableName);

	logger.debug("Inserting data into", tableName, "table with fields:", fields.join(", "), "and values:", values.join(", "));

	// Check if fields are not empty
	if (fields.length == 0){
		logger.error("Error inserting data into " + tableName + " table, fields are empty");
		conn.end();
		return 0;
	}

	try{
		const [dbFileInsert] = await conn.execute(
			"INSERT INTO " + tableName + " (" + fields.join(", ") + ") VALUES (" + Array(fields.length).fill("?").join(", ") + ")",
			values
		);
		if (!dbFileInsert) {
			logger.error("Error inserting data into " + tableName + " table");
			conn.end();
			return 0;
		}

		logger.debug("record inserted into", tableName, "table with id:", JSON.parse(JSON.stringify(dbFileInsert)).insertId )
		conn.end();
		return JSON.parse(JSON.stringify(dbFileInsert)).insertId;
	}catch (error) {
		logger.error("Error inserting data into " + tableName + " table");
		conn.end();
		return 0;
	}
}

/**
 * Executes a SELECT SQL query on a database and returns the specified field from the first row of the result.
 * @param {string} queryStatement - The SQL query to be executed.
 * @param {string} returnField - The field to be returned from the first row of the result.
 * @param {string[]} whereFields - The fields to be used in the WHERE clause of the SQL query.
 * @param {boolean} [onlyFirstResult=true] - A boolean indicating whether to return only the first result from the query or all results.
 * @returns {Promise<string>} A promise that resolves to the value of the specified return field from the first row of the result, or an empty string if an error occurs or if the result is empty.
 */
const dbSelect = async (queryStatement: string, returnField :string, whereFields: string[], onlyFirstResult = true): Promise<string | string[]> => {
    try {
        const conn = await connect("dbSimpleSelect: " + queryStatement + " | Fields: " + whereFields.join(", "));
        const [rows] = await conn.query<RowDataPacket[]>(queryStatement, whereFields);
        conn.end();
        if (onlyFirstResult){
            return rows[0]?.[returnField] as string || "";
        }
        const result = rows.map(row => row[returnField] as string);
        return result;
        
    } catch (error) {
        logger.debug(error)
        logger.error("Error getting " + returnField + " from database");
        return "";
    }
}

/**
/  * Executes a SELECT SQL query on a database and returns the specified fields from the result.
/  * @param {string[]} queryFields - The fields to be selected from the table.
/  * @param {string} fromStatement - The table (or tables) to select data from.
/  * @param {string} whereStatement - The WHERE and ORDER clause of the SQL query.
/  * @param {string[]} whereFields - The fields to be used in the WHERE clause of the SQL query.
/  * @param {boolean} [onlyFirstResult=true] - A boolean indicating whether to return only the first result from the query or all results.
/  * @returns {Promise<any[]>} A promise that resolves to an array of objects containing the specified fields from the result, or an empty array if an error occurs or if the result is empty.
*/
const dbMultiSelect = async (queryFields: string[], fromStatement: string, whereStatement: string, whereFields: any[], onlyFirstResult = true): Promise<any[]> => {

    if (queryFields.length === 0){
        logger.error("Error getting data from database, queryFields are empty");
        return [];
    }

    try {
        const conn = await connect("dbMultiSelect: " + queryFields.join(',') + " | Fields: " + whereFields.join(", "));
        const [rows] = await conn.query<RowDataPacket[]>(`SELECT ${queryFields.join(',')} FROM ${fromStatement} WHERE ${whereStatement}`, whereFields);
        conn.end();

        if (onlyFirstResult){
            if (rows.length > 0) {
                return [rows[0]];
            }
        } else {
            return rows;
        }
        return [];

    } catch (error) {
        logger.debug(error);
        logger.error("Error getting " + queryFields.join(',') + " from database");
        return [];
    }
}

/**
/* Executes a SELECT SQL query on a database and returns the result.
/* @param {string} table - The name of the table to select data from.
/* @param {string} query - The SQL query to be executed.
/* @returns {Promise<string>} A promise that resolves to the result of the query, or an empty string if an error occurs or if the result is empty.
 */
const dbSimpleSelect = async (table:string, query:string): Promise<string> =>{
	try{
		const conenction = await connect("dbSimpleSelect " + table);
		logger.debug("Executing query:", query, "on table:", table);
		const [dbResult] = await conenction.query(query);
		const rowstemp = JSON.parse(JSON.stringify(dbResult));
		conenction.end();
		if (rowstemp[0] == undefined || rowstemp[0] == "") {
			return "";
		}else{
			return rowstemp;
		}
	}catch (error) {
		logger.error(`Error getting data from ${table}`);
		return "";
	}
}

/**
 * Deletes records from a specified table in the database where the specified conditions are met.
 *
 * @param tableName - The name of the table from which records will be deleted.
 * @param whereFieldNames - An array of field names that will be used in the WHERE clause of the DELETE query.
 * @param whereFieldValues - An array of corresponding values for the field names in `whereFieldNames` that will be used in the WHERE clause of the DELETE query.
 * @returns A Promise that resolves to a boolean. The Promise will resolve to `true` if the deletion was successful, and `false` otherwise.
 */
const dbDelete = async (tableName :string, whereFieldNames :string[], whereFieldValues: string[]): Promise<boolean> =>{
	
	const conn = await connect("dbDelete:" + tableName);

	// Check if wherefieldValue is not empty
	if (whereFieldValues.length == 0){
		logger.error("Error deleting data from " + tableName + " table, whereFieldValue is empty");
		conn.end();
		return false;
	}

	try{
		const [dbFileDelete] = await conn.execute(
			"DELETE FROM " + tableName + " WHERE " + whereFieldNames.join(" = ? and ") + " = ?",
			[...whereFieldValues]
		);
		if (!dbFileDelete) {
			logger.error("Error deleting data from " + tableName + " table");
			conn.end();
			return false;
		}
		conn.end();
		return true;
	}catch (error) {
		logger.error("Error deleting data from " + tableName + " table");
		conn.end();
		return false;
	}
}

const showDBStats = async(): Promise<string> => {

	const conn = await connect("showDBStats");
	const result: string[] = [];

	//Show table registered rows
	const [dbRegisteredTable] = await conn.execute(
		"SELECT * FROM registered");
	if (!dbRegisteredTable) {
		logger.error("Error getting registered table rows");
	}
	let dbresult = JSON.parse(JSON.stringify(dbRegisteredTable));
	result.push(`Registered users: ${dbresult.length}`);
	dbresult = "";

	//Show table domains rows
	const [dbDomainsTable] = await conn.execute(
		"SELECT * FROM domains");
	if (!dbDomainsTable) {
		logger.error("Error getting domains table rows");
	}
	dbresult = JSON.parse(JSON.stringify(dbDomainsTable));
	result.push(`Configured domains: ${dbresult.length}`);
	dbresult = "";

	//Show table mediafiles rows
	const [dbmediafilesTable] = await conn.execute(
		"SELECT * FROM mediafiles");
	if (!dbmediafilesTable) {
		logger.error("Error getting mediafiles table rows");
	}
	dbresult = JSON.parse(JSON.stringify(dbmediafilesTable));
	result.push(`Uploaded files: ${dbresult.length}`);
	dbresult = "";

	//Show table mediafiles magnet rows
	if (config.get('torrent.enableTorrentSeeding')) {
	const [dbmediamagnetfilesTable] = await conn.execute(
		"SELECT DISTINCT filename, username FROM mediafiles inner join registered on mediafiles.pubkey = registered.hex where magnet is not null");
	if (!dbmediamagnetfilesTable) {
		logger.error("Error getting magnet links table rows");
	}
	dbresult = JSON.parse(JSON.stringify(dbmediamagnetfilesTable));
	result.push(`Magnet links: ${dbresult.length}`);
	dbresult = "";
	}

	//Show table mediatags rows
	const [dbmediatagsTable] = await conn.execute(
		"SELECT * FROM mediatags");
	if (!dbmediatagsTable) {
		logger.error("Error getting mediatags table rows");
	}
	dbresult =  JSON.parse(JSON.stringify(dbmediatagsTable));
	result.push(`Media tags: ${dbresult.length}`);
	dbresult = "";

	//Show table lightning rows
	const [dbLightningTable] = await conn.execute(
		"SELECT * FROM lightning");
	if (!dbLightningTable) {
		logger.error("Error getting lightning table rows");
	}
	dbresult = JSON.parse(JSON.stringify(dbLightningTable));
	result.push(`Lightning redirections: ${dbresult.length}`);
	
	conn.end();
	const resultstring = result.join('\r\n').toString();
	return resultstring;
}

const initDatabase = async (): Promise<void> => {

	//Check database integrity
	const dbtables = await populateTables(config.get('database.droptables')); // true = reset tables
	if (!dbtables) {
	logger.fatal("Error checking database integrity");
	process.exit(1);
	}

	// Check if default domain exist on domains table and create it if not.
	const defaultDomain = await dbSelect("SELECT domain FROM domains WHERE domain = ?", "domain", [app.get("config.server")["host"]]) as string;
	if (defaultDomain == ""){
		logger.warn("Default domain not found, creating it");
		const fields: string[] = ["domain", "active", "comments"];
		const values: string[] = [app.get("config.server")["host"], "1", "Default domain generated by server on first run"];
		const insert = await dbInsert("domains", fields, values);
		if (insert === 0){
			logger.fatal("Error creating default domain");
			process.exit(1);
		}
		logger.info("Default domain created");
	}

	// Check if public username exist on registered table and, if not, create it. Also it sends a DM to the pubkey with the credentials
	const publicUsername = await dbSelect("SELECT username FROM registered WHERE username = ?", "username", ["public"]) as string;

	if (publicUsername == "" || publicUsername == undefined || publicUsername == null){
		logger.warn("Public username not found, creating it...");

		const createPublicUser = await addNewUsername("public", app.get("config.server")["pubkey"], "", config.get('server.host'), "public username generated by server on first run", true);

		if (createPublicUser == 0){
			logger.fatal("Error creating public username");
			process.exit(1);
		}
		app.set("firstUse", true); 
	}

	// Check if public lightning address exist on lightning table and create it if not.
	const publicLightning = await dbSelect("SELECT lightningaddress FROM lightning", "lightningaddress", []) as string;
	if (publicLightning == ""){
		logger.warn("Public lightning address not found, creating it");
		const fields: string[] = ["pubkey", "lightningaddress", "comments"];
		const values: string[] = [app.get("config.server")["pubkey"], "YourRealLightningAddress", "Public lightning redirect generated by server on first run, edit this to recieve SATS on your wallet"];
		const insert = await dbInsert("lightning", fields, values);
		if (insert === 0){
			logger.fatal("Error creating public lightning address");
			process.exit(1);
		}
		logger.info("Public lightning address created");
	}

	// Check if standard accounts exist on accounts table and create it if not.
	let checkAccounts = await dbSelect("SELECT accountid FROM accounts ", "accountid", [], false) as string[]
	accounts.forEach(async (account) => {
		// Log the current accountid and checkAccounts array
		logger.info("Current accountid:", account.accountid.toString());
		logger.info("checkAccounts:", checkAccounts.toString());
	
		if (!checkAccounts.toString().includes(account.accountid.toString())){
			logger.warn("Standard account not found, creating it:", account.accountname);
			const fields: string[] = ["accountid", "active", "accountname", "accounttype", "createddate", "comments"];
			const values: any[] = [account.accountid, "1",  account.accountname, account.accounttype, getNewDate(), account.comments];
			const insert = await dbInsert("accounts", fields, values);
			if (insert === 0){
				logger.fatal("Error creating standard account");
				process.exit(1);
			}
			logger.info("Standard account created");
		}
	});

	// Clear all authkeys from registered table
	const conn = await connect("initDatabase");
	logger.debug("Clearing all authkeys from registered table");
	await conn.execute("UPDATE registered SET authkey = NULL ");
	conn.end();
}

const migrateOldFields = async (table:string, oldField:string, newField:string): Promise<boolean> => {
	
	const conn = await connect("migrateOldFields");
	try{
		const [dbFileStatusUpdate] = await conn.execute(
			"UPDATE " + table + " set " + newField + " = " + oldField + " where " + oldField + " is not null"
		);
		if (!dbFileStatusUpdate) {
			logger.error("Error migrating old fields");
			conn.end();
			return false;
		}
		logger.warn("Migrated all data from old fields, table:", table, "| Old field:", oldField, "-> New field :", newField);
		conn.end();
		return true;
	}catch (error) {
		logger.error("Error migrating old fields");
		conn.end();
		return false;
	}
}

const deleteOldFields = async (table:string, oldField:string): Promise<boolean> => {

	//Drop oldField from table
	const conn = await connect("deleteOldFields");
	try{
		const [dbFileStatusUpdate] = await conn.execute(
			"ALTER TABLE " + table + " DROP " + oldField
		);
		if (!dbFileStatusUpdate) {
			logger.error("Error deleting old fields");
			conn.end();
			return false;
		}
		logger.warn("Deleted old fields, table:", table, "| Old field:", oldField);
		conn.end();
		return true;

	}catch (error) {
		logger.error("Error deleting old fields");
		conn.end();
		return false;
	}
}


export {
		connect, 
		populateTables,
		dbSelect,
		dbUpdate,
		dbDelete,
		dbMultiSelect,
		dbSimpleSelect,
		dbInsert,
		showDBStats,
		initDatabase,
		};
