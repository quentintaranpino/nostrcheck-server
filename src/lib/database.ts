import { createPool, Pool } from "mysql2/promise";
import config from "config";
import { logger } from "./logger.js";
import { ProcessingFileData } from "../interfaces/media.js";
import crypto from "crypto";
import fs from "fs";
import { CreateMagnet } from "./torrent.js";
import { 
	DatabaseTables, 
	DomainsTableFields, 
	LightningTableFields, 
	MediafilesTableFields, 
	MediatagsTableFields, 
	RegisteredTableFields} from "../interfaces/database.js";

//Check database integrity
const dbtables = await populateTables(config.get('database.droptables')); // true = reset tables
if (!dbtables) {
	logger.fatal("Error checking database integrity");
	process.exit(1);
}

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
			return connection;
	}catch (error) {
			logger.fatal(`There is a problem connecting to mysql server, is mysql-server package installed on your system? : ${error}`);
			process.exit(1);
	}

};

async function populateTables(resetTables: boolean): Promise<boolean> {
	
	if (resetTables) {
		const conn = await connect("populateTables");
		try{
		for (let i = 0; i < DatabaseTables.length; i++) {
			logger.info("Dropping table:", DatabaseTables[i]);
			const DropTableStatement = "DROP TABLE IF EXISTS " + DatabaseTables[i] + ";";
			await conn.query(DropTableStatement);
		}
		conn.end();
		}catch (error) {
			logger.error("Error dropping tables", error);
			conn.end();
			return false;
		}
	}
		
	//Check tables consistency
	for (let i = 0; i < DatabaseTables.length; i++) {

		//domains table
		if (DatabaseTables[i] == "domains") {
			for (const [key, value] of Object.entries(DomainsTableFields)) {

				let after_column :string = "";
				if (Object.keys(DomainsTableFields).indexOf(key,0) != 0){
					after_column = Object.entries(DomainsTableFields)[Object.keys(DomainsTableFields).indexOf(key,0)-1][0];
				}
				const check = await checkDatabaseConsistency(DatabaseTables[i], key, value, after_column);
				if (!check) {
					logger.fatal("Error checking database table domains");
					process.exit(1);
				}
			}
		}
		//lightning table
		if (DatabaseTables[i] == "lightning") {
			for (const [key, value] of Object.entries(LightningTableFields)) {

				let after_column :string = "";
				if (Object.keys(LightningTableFields).indexOf(key,0) != 0){
					after_column = Object.entries(LightningTableFields)[Object.keys(LightningTableFields).indexOf(key,0)-1][0];
				}
				const check = await checkDatabaseConsistency(DatabaseTables[i], key, value, after_column);
				if (!check) {
					logger.fatal("Error checking database table lightning");
					process.exit(1);
				}
			}
		}
		//mediafiles table
		if (DatabaseTables[i] == "mediafiles") {
			for (const [key, value] of Object.entries(MediafilesTableFields)) {

				let after_column :string = "";
				if (Object.keys(MediafilesTableFields).indexOf(key,0) != 0){
					after_column = Object.entries(MediafilesTableFields)[Object.keys(MediafilesTableFields).indexOf(key,0)-1][0];
				}
				const check = await checkDatabaseConsistency(DatabaseTables[i], key, value, after_column);

				if (!check) {
					logger.fatal("Error checking database table mediafiles");
					process.exit(1);
				}
			}
		}
		//mediatags table
		if (DatabaseTables[i] == "mediatags") {
			for (const [key, value] of Object.entries(MediatagsTableFields)) {

				let after_column :string = "";
				if (Object.keys(MediatagsTableFields).indexOf(key,0) != 0){
					after_column = Object.entries(MediatagsTableFields)[Object.keys(MediatagsTableFields).indexOf(key,0)-1][0];
				}
				const check = await checkDatabaseConsistency(DatabaseTables[i], key, value, after_column);
				if (!check) {
					logger.fatal("Error checking database table mediatags");
					process.exit(1);
				}
			}
		}
		
		//registered table
		if (DatabaseTables[i] == "registered") {
			for (const [key, value] of Object.entries(RegisteredTableFields)) {

				let after_column :string = "";
				if (Object.keys(RegisteredTableFields).indexOf(key,0) != 0){
					after_column = Object.entries(RegisteredTableFields)[Object.keys(RegisteredTableFields).indexOf(key,0)-1][0];
				}
				const check = await checkDatabaseConsistency(DatabaseTables[i], key, value, after_column);
				if (!check) {
					logger.fatal("Error checking database table registered");
					process.exit(1);
				}
			}
		}
	}

	return true;
}


async function checkDatabaseConsistency(table: string, column_name:string, type:string, after_column:string): Promise<boolean> {

	const conn = await connect("checkDatabaseConsistency");

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

async function dbFileStatusUpdate(status: string, options: ProcessingFileData): Promise<boolean> {

	const conn = await connect("dbFileStatusUpdate");
	try{
		const [dbFileStatusUpdate] = await conn.execute(
			"UPDATE mediafiles set status = ? where id = ?",
			[status, options.fileid]
		);
		if (!dbFileStatusUpdate) {
			logger.error("Error updating mediafiles table, id:", options.fileid, "status:", status);
			conn.end();
			return false;
		}
		conn.end();
		return true
	}catch (error) {
		logger.error("Error updating mediafiles table, id:", options.fileid, "status:", status);
		conn.end();
		return false;
	}

}

async function dbFilesizeUpdate(filesize: number, options: ProcessingFileData): Promise<boolean> {

	const conn = await connect("dbFileStatusUpdate");
	try{
		const [dbFilesizeUpdate] = await conn.execute(
			"UPDATE mediafiles set filesize = ? where id = ?",
			[filesize, options.fileid]
		);
		if (!dbFilesizeUpdate) {
			logger.error("Error updating filesize table, id:", options.fileid, "filesize:", filesize);
			conn.end();
			return false;
		}
		conn.end();
		return true
	}catch (error) {
		logger.error("Error updating mediafiles table, id:", options.fileid, "filesize:", filesize);
		conn.end();
		return false;
	}

}

async function dbFileDimensionsUpdate(width: number, height:number, options: ProcessingFileData): Promise<boolean> {

	const conn = await connect("dbFileDimensionsUpdate");
	try{
		const [dbFileStatusUpdate] = await conn.execute(
			"UPDATE mediafiles set dimensions = ? where id = ?",
			[width + "x" + height, options.fileid]
		);
		if (!dbFileStatusUpdate) {
			logger.error("Error updating mediafiles table, id:", options.fileid, "dimensions:", width + "x" + height);
			conn.end();
			return false;
		}
		conn.end();
		return true
	}catch (error) {
		logger.error("Error updating mediafiles table, id:", options.fileid, "dimensions:", width + "x" + height);
		conn.end();
		return false;
	}

}

async function dbFileVisibilityUpdate(visibility: boolean, options: ProcessingFileData): Promise<boolean> {

	const conn = await connect("dbFileVisibilityUpdate");
	try{
		const [dbFileStatusUpdate] = await conn.execute(
			"UPDATE mediafiles set visibility = ? where id = ?",
			[visibility, options.fileid]
		);
		if (!dbFileStatusUpdate) {
			logger.error("Error updating mediafiles table, id:", options.fileid, "visibility:", visibility);
			conn.end();
			return false;
		}
		conn.end();
		return true
	}catch (error) {
		logger.error("Error updating mediafiles table, id:", options.fileid, "visibility:", visibility);
		conn.end();
		return false;
	}

}

async function dbFileHashupdate(options: ProcessingFileData): Promise<boolean>{

	const conn = await connect("dbFileHashupdate");
	try{
		const [dbFileHashUpdate] = await conn.execute(
			"UPDATE mediafiles set hash = ? where id = ?",
			[options.hash, options.fileid]
		);
		if (!dbFileHashUpdate) {
			logger.error("Error updating mediafiles table (hash), id:", options.fileid, "hash:", options.hash);
			conn.end();
			return false;
		}
		conn.end();
		return true
	}catch (error) {
	logger.error("Error updating mediafiles table (hash), id:", options.fileid, "hash:", options.hash);
	conn.end();
	return false;
	}

}

async function dbFileblurhashupdate(blurhash:string, options: ProcessingFileData): Promise<boolean>{

	const conn = await connect("dbFileblurhashupdate");
	try{
		const [dbFileBlurHashUpdate] = await conn.execute(
			"UPDATE mediafiles set blurhash = ? where id = ?",
			[blurhash, options.fileid]
		);
		if (!dbFileBlurHashUpdate) {
			logger.error("Error updating mediafiles table, id:", options.fileid, "blurhash:", blurhash);
			conn.end();
			return false;
		}
		conn.end();
		return true
	}catch (error) {
		logger.error("Error updating mediafiles table, id:", options.fileid, "blurhash:", blurhash);
		conn.end();
		return false;
	}

}

async function dbFileMagnetUpdate(MediaPath: string, options: ProcessingFileData): Promise<boolean> {
	
	//Only create magnets for type media (not avatar or banner)
	if (options.media_type != "media"){return true;}

	try{
		await CreateMagnet(MediaPath, options);
		logger.debug("Magnet link:", options.magnet, "for file:", MediaPath, "id:", options.fileid)

		const conn = await connect("dbFileMagnetUpdate");
		const [dbFileMagnetUpdate] = await conn.execute(
			"UPDATE mediafiles set magnet = ? where id = ?",
			[options.magnet, options.fileid]
		);
		if (!dbFileMagnetUpdate) {
			logger.error("Error updating mediafiles table, id:", options.fileid, "magnet:", options.magnet);
			conn.end();
			return false;
		}
		conn.end();
	}catch (error) {
		return false;
	}
	return true
}

async function dbSelectUsername(pubkey: string): Promise<string> {

	const dbPubkey = await connect("dbSelectUsername");
	try{
		const [dbResult] = await dbPubkey.query("SELECT username FROM registered WHERE hex = ?", [pubkey]);
		const rowstemp = JSON.parse(JSON.stringify(dbResult));
		dbPubkey.end();
		if (rowstemp[0] == undefined) {
			return "";	
		}else{

			return rowstemp[0]['username'];
		}
	}catch (error) {
	logger.error("Error getting username from database");
	return "";
	}
	
}

async function showDBStats(){

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
	const [dbmediamagnetfilesTable] = await conn.execute(
		"SELECT DISTINCT filename, username FROM mediafiles inner join registered on mediafiles.pubkey = registered.hex where magnet is not null");
	if (!dbmediamagnetfilesTable) {
		logger.error("Error getting magnet links table rows");
	}
	dbresult = JSON.parse(JSON.stringify(dbmediamagnetfilesTable));
	result.push(`Magnet links: ${dbresult.length}`);
	dbresult = "";

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

	console.log(
		result.join('\r\n'),'\n');
}

export { connect, 
		 populateTables,
		 dbFileStatusUpdate, 
		 dbFileVisibilityUpdate, 
		 dbFileHashupdate, 
		 dbFileblurhashupdate,
		 dbFileMagnetUpdate, 
		 dbSelectUsername,
		 showDBStats,
		 dbFileDimensionsUpdate,
		 dbFilesizeUpdate};
