import { createPool, Pool,RowDataPacket } from "mysql2/promise";
import config from "config";
import { logger } from "./logger.js";
import { 
	newFieldcompatibility, 
	domainsTableFields, 
	lightningTableFields, 
	mediafilesTableFields, 
	mediatagsTableFields, 
	registeredTableFields,
	databaseTables} from "../interfaces/database.js";
import { updateLocalConfigKey } from "./config.js";
import { exit } from "process";
import { npubEncode } from "nostr-tools/nip19";
import { generateNewPassword } from "./authorization.js";

let retry :number = 0;
async function connect(source:string): Promise<Pool> {

	const DatabaseHost :string 		 = config.get('database.host');
	const DatabaseUser :string  	 = config.get('database.user');
	const DatabasePassword :string 	 = config.get('database.password');
	const Database :string  		 = config.get('database.database');


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
			let conn_retry = await connect(source);
			if (conn_retry != undefined){
				return conn_retry;
			}
			process.exit(1);
	}

};
async function populateTables(resetTables: boolean): Promise<boolean> {
    if (await resetTables) {
        // Put database.droptables to false for next run
        if (!await updateLocalConfigKey("database.droptables", false)){
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

const dbUpdate = async (tableName :string, selectFieldName: string, selectFieldValue: string, whereFieldName :string, whereFieldValue: string): Promise<boolean> =>{

	const conn = await connect("dbFileFieldUpdate: " + selectFieldName + " | Table: " + tableName);
	try{
		const [dbFileFieldUpdate] = await conn.execute(
			"UPDATE " + tableName + " set " + selectFieldName + " = ? where " + whereFieldName + " = ?",
			[selectFieldValue, whereFieldValue]
		);
		if (!dbFileFieldUpdate) {
			logger.error("Error updating " + tableName + " table | " + whereFieldName + " :", whereFieldValue +  " | " + selectFieldName + " :", selectFieldValue);
			conn.end();
			return false;
		}
		conn.end();
		return true
	}catch (error) {
		logger.error("Error updating " + tableName + " table | " + whereFieldName + " :", whereFieldValue +  " | " + selectFieldName + " :", selectFieldValue);
		conn.end();
		return false;
	}
}

const dbInsert = async (tableName :string, fields: string[], values: string[]): Promise<boolean> =>{
	const conn = await connect("dbInsert:" + tableName);
	try{
		const [dbFileInsert] = await conn.execute(
			"INSERT INTO " + tableName + " (" + fields.join(", ") + ") VALUES (" + Array(fields.length).fill("?").join(", ") + ")",
			values
		);
		if (!dbFileInsert) {
			logger.error("Error inserting data into " + tableName + " table");
			conn.end();
			return false;
		}
		conn.end();
		return true;
	}catch (error) {
		logger.error("Error inserting data into " + tableName + " table");
		conn.end();
		return false;
	}
}

const dbSelect = async (query: string, queryField :string, whereFields: string[], table: RowDataPacket): Promise<string> => {
	try {
		const conn = await connect("dbSimpleSelect: " + query + " | Fields: " + whereFields.join(", "));
		const [rows] = await conn.query<typeof table[]>(query, whereFields);
		conn.end();
		return rows[0]?.[queryField] || "";
	} catch (error) {
		logger.error("Error getting " + queryField + " from database");
		return "";
	}
}

const dbSelectAllRecords = async (table:string, query:string): Promise<string> =>{
	try{
		const conenction = await connect("dbSelectAllRecords" + table);
		logger.debug("Getting all data from " + table + " table")
		const [dbResult] = await conenction.query(query);
		const rowstemp = JSON.parse(JSON.stringify(dbResult));
		conenction.end();
		if (rowstemp[0] == undefined) {
			return "";
		}else{
			return rowstemp;
		}
	}catch (error) {
		logger.error("Error getting all data from registered table from database");
		return "";
	}
	
}

async function dbSelectModuleData(module:string): Promise<string> {
	if (module == "nostraddress"){
		return await dbSelectAllRecords("registered", "SELECT id, username, pubkey, hex, domain, active, allowed, DATE_FORMAT(date, '%Y-%m-%d %H:%i') as date, comments FROM registered ORDER BY id DESC");
	}
	if (module == "media"){
		return await dbSelectAllRecords("mediafiles", 
		"SELECT mediafiles.id," +
		"(SELECT registered.username FROM registered WHERE mediafiles.pubkey = registered.hex LIMIT 1) as username, " +
		"(SELECT registered.pubkey FROM registered WHERE mediafiles.pubkey = registered.hex LIMIT 1) as pubkey, " +
		"mediafiles.pubkey as 'hex', " +
		"mediafiles.filename, " +
		"mediafiles.original_hash, " +
		"mediafiles.hash, " +
		"mediafiles.status, " +
		"mediafiles.active, " +
		"mediafiles.visibility, " +
		"ROUND(mediafiles.filesize / 1024 / 1024, 2) as 'filesize', " +
		"mediafiles.filesize, " +
		"DATE_FORMAT(mediafiles.date, '%Y-%m-%d %H:%i') as date, " +
		"mediafiles.comments, " +
		"mediafiles.checked " +
 		"FROM mediafiles " +
		"ORDER BY id DESC;");
	}
	if (module == "lightning"){
		return await dbSelectAllRecords("lightning", "SELECT id, pubkey, lightningaddress, comments FROM lightning ORDER BY id DESC");
	}
	if (module == "domains"){
		return await dbSelectAllRecords("domains", "SELECT id, domain, active, comments FROM domains ORDER BY id DESC");
	}
	return "";
}

const showDBStats = async(): Promise<string> => {

	const conn = await connect("showDBStats");
	const result = [];

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
	};

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
	let resultstring = result.join('\r\n').toString();
	return resultstring;
}

const initDatabase = async (): Promise<void> => {

	//Check database integrity
	const dbtables = await populateTables(config.get('database.droptables')); // true = reset tables
	if (!dbtables) {
	logger.fatal("Error checking database integrity");
	process.exit(1);
	}

	// Check if public username exist on registered table and create it if not
	const publicUsername = await dbSelect("SELECT username", "username", ["public"], registeredTableFields);
	if (publicUsername == ""){
		logger.warn("Public username not found, creating it");
		const fields: string[] = ["pubkey", "hex", "username", "password", "domain", "active", "date", "allowed", "comments"];
		const values: string[] = [	npubEncode(config.get('server.pubkey')), 
									config.get('server.pubkey'), "public", 
									await generateNewPassword(), 
									config.get('server.host'), 
									"1", 
									new Date().toISOString().slice(0, 19).replace('T', ' '),
									"1", 
									"public username generated by server on first run"];
		const insert = await dbInsert("registered", fields, values);
		if (!insert){
			logger.fatal("Error creating public username");
			process.exit(1);
		}
		logger.info("Public username created");
	}

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
		showDBStats,
		initDatabase,
		dbSelectModuleData};
