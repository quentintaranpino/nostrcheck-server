import { createPool, Pool } from "mysql2/promise";
import config from "config";
import { logger } from "./logger.js";
import { ConvertFilesOpions } from "../interfaces/media.js";
import crypto from "crypto";
import fs from "fs";
import { CreateMagnet } from "./torrent.js";

//Check database integrity
const dbtables = populateTables(config.get('database.droptables')); // true = reset tables
if (!dbtables) {
	logger.fatal("Error creating database tables");
	process.exit(1);
}

async function connect(): Promise<Pool> {

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
			return connection;
	}catch (error) {
			logger.fatal(`There is a problem connecting to mysql server, is mysql-server package installed on your system? : ${error}`);
			process.exit(1);
	}

};

async function populateTables(resetTables: boolean): Promise<boolean> {
	if (resetTables) {
		const conn = await connect();
		logger.info("Dropping table registered");
		const RegisteredTableDropStatement = "DROP TABLE IF EXISTS registered;";
		await conn.query(RegisteredTableDropStatement);

		logger.info("Dropping table domains");
		const DomainsTableDropStatement = "DROP TABLE IF EXISTS domains;";
		await conn.query(DomainsTableDropStatement);

		logger.info("Dropping table mediafiles");
		const mediafilesTableDropStatement = "DROP TABLE IF EXISTS mediafiles;";
		await conn.query(mediafilesTableDropStatement);

		conn.end();
	}

	const conn = await connect();

	//Create registered table
	const ExistRegisteredTableStatement = "SHOW TABLES FROM `nostrcheck` LIKE 'registered';";
	const [ExistRegisteredTable] = await conn.query(ExistRegisteredTableStatement);
	const rowstempExistRegisteredTable = JSON.parse(JSON.stringify(ExistRegisteredTable));
	if (rowstempExistRegisteredTable[0] == undefined) {
		const RegisteredTableCreateStatement: string =
			"CREATE TABLE IF NOT EXISTS registered (" +
			"id int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY," +
			"pubkey varchar(64) NOT NULL," +
			"hex varchar(64) NOT NULL," +
			"username varchar(50) NOT NULL," +
			"password varchar(100) NOT NULL," +
			"domain varchar(50) NOT NULL," +
			"active boolean NOT NULL DEFAULT 0," +
			"date datetime NOT NULL," +
			"allowed boolean NOT NULL DEFAULT 0," +
			"apikey varchar(64)," +
			"comments varchar(150)" +
			") ENGINE=InnoDB DEFAULT CHARSET=latin1;";

		logger.info("Creating table registered");
		await conn.query(RegisteredTableCreateStatement);
	}
	
	//Create domains table
	const ExistDomainsTableStatement = "SHOW TABLES FROM `nostrcheck` LIKE 'domains';";
	const [ExistDomainsTable] = await conn.query(ExistDomainsTableStatement);
	const rowstempExistDomainsTable = JSON.parse(JSON.stringify(ExistDomainsTable));
	if (rowstempExistDomainsTable[0] == undefined) {
		const DomainsTableCreateStatement: string =
			"CREATE TABLE IF NOT EXISTS domains (" +
			"id int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY," +
			"domain varchar(50) NOT NULL," +
			"active boolean NOT NULL DEFAULT 0," +
			"comments varchar(150)" +
			") ENGINE=InnoDB DEFAULT CHARSET=latin1;";
		logger.info("Creating table domains");
		await conn.query(DomainsTableCreateStatement);

		logger.info("Populating default domains");
		const InsertDomainsTableStatement =
			"INSERT INTO domains (domain, active, comments) VALUES (?,?,?);";
		await conn.execute(InsertDomainsTableStatement, ["nostrcheck.me", 1, "Default domain"]);
		await conn.execute(InsertDomainsTableStatement, ["nostr-check.me", 1, ""]);
		await conn.execute(InsertDomainsTableStatement, ["nostriches.club", 1, ""]);
		await conn.execute(InsertDomainsTableStatement, ["plebchain.club", 1, ""]);
		if (!InsertDomainsTableStatement) {
			logger.fatal("Error inserting default domains to database");
		}
	}

	//Create mediafiles table
	const ExistmediafilesTableStatement = "SHOW TABLES FROM `nostrcheck` LIKE 'mediafiles';";
	const [ExistmediafilesTable] = await conn.query(ExistmediafilesTableStatement);
	const rowstempExistmediafilesTable = JSON.parse(JSON.stringify(ExistmediafilesTable));
	if (rowstempExistmediafilesTable[0] == undefined) {
		const mediafilesTableCreateStatement: string =
			"CREATE TABLE IF NOT EXISTS mediafiles (" +
			"id int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY," +
			"pubkey varchar(64) NOT NULL," +
			"filename varchar(128) NOT NULL," +
			"original_hash varchar(64)," +
			"hash varchar(64)," +
			"status varchar(10) NOT NULL," +
			"visibility boolean NOT NULL DEFAULT 0," +
			"date datetime NOT NULL," +
			"ip_address varchar(64) NOT NULL," +
			"magnet varchar (512),"	+
			"comments varchar(150)" +
			") ENGINE=InnoDB DEFAULT CHARSET=latin1;";
		logger.info("Creating table mediafiles");
		await conn.query(mediafilesTableCreateStatement);
	}

	//Create mediatags table
	const ExistmediatagsTableStatement = "SHOW TABLES FROM `nostrcheck` LIKE 'mediatags';";
	const [ExistmediatagsTable] = await conn.query(ExistmediatagsTableStatement);
	const rowstempExistmediatagsTable = JSON.parse(JSON.stringify(ExistmediatagsTable));
	if (rowstempExistmediatagsTable[0] == undefined) {
		const mediatagsTableCreateStatement: string =
			"CREATE TABLE IF NOT EXISTS mediatags (" +
			"id int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY," +
			"fileid int(11) NOT NULL," +
			"tag varchar(64) NOT NULL" +
			") ENGINE=InnoDB DEFAULT CHARSET=latin1;";
		logger.info("Creating table mediatags");
		await conn.query(mediatagsTableCreateStatement);
	}

	//Create lightning address table
	const ExistLightningTableStatement = "SHOW TABLES FROM `nostrcheck` LIKE 'lightning';";
	const [ExistLightningTable] = await conn.query(ExistLightningTableStatement);
	const rowstempExistLightningTable = JSON.parse(JSON.stringify(ExistLightningTable));
	if (rowstempExistLightningTable[0] == undefined) {
		const LightningTableCreateStatement: string =
			"CREATE TABLE IF NOT EXISTS lightning (" +
			"id int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY," +
			"pubkey varchar(64) NOT NULL," +
			"lightningaddress varchar(50) NOT NULL," +
			"comments varchar(150)" +
			") ENGINE=InnoDB DEFAULT CHARSET=latin1;";

		logger.info("Creating table lightning");
		await conn.query(LightningTableCreateStatement);
	}
	
	conn.end();

	return true;
}

async function dbFileStatusUpdate(status: string, options: ConvertFilesOpions): Promise<boolean> {

	const conn = await connect();
	const [dbFileStatusUpdate] = await conn.execute(
		"UPDATE mediafiles set status = ? where id = ?",
		[status, options.id]
	);
	if (!dbFileStatusUpdate) {
		logger.error("Error updating mediafiles table, id:", options.id, "status:", status);
		conn.end();
		return false;
	}

	conn.end();
	return true

}

async function dbFileVisibilityUpdate(visibility: boolean, options: ConvertFilesOpions): Promise<boolean> {

	const conn = await connect();
	const [dbFileStatusUpdate] = await conn.execute(
		"UPDATE mediafiles set visibility = ? where id = ?",
		[visibility, options.id]
	);
	if (!dbFileStatusUpdate) {
		logger.error("Error updating mediafiles table, id:", options.id, "visibility:", visibility);
		conn.end();
		return false;
	}

	conn.end();
	return true

}

async function dbFileHashupdate(filepath:string, options: ConvertFilesOpions): Promise<boolean>{

	let hash = '';
	try{
		logger.info("Generating file hash for file:", filepath)
		hash = crypto
				.createHash("sha256")
				.update(fs.readFileSync(filepath))
				.digest("hex");
		logger.info("File hash:", hash);
		}
	catch (error) {
		logger.error("Error getting file hash", error);
		return false;
	}

	const conn = await connect();
	const [dbFileHashUpdate] = await conn.execute(
		"UPDATE mediafiles set hash = ? where id = ?",
		[hash, options.id]
	);
	if (!dbFileHashUpdate) {
		logger.error("Error updating mediafiles table (hash), id:", options.id, "hash:", hash);
		conn.end();
		return false;
	}
	conn.end();
	return true
}

async function dbFileMagnetUpdate(MediaPath: string, options: ConvertFilesOpions): Promise<boolean> {
	
	try{
		const magnet = await CreateMagnet(MediaPath);

		const conn = await connect();
		const [dbFileMagnetUpdate] = await conn.execute(
			"UPDATE mediafiles set magnet = ? where id = ?",
			[magnet, options.id]
		);
		if (!dbFileMagnetUpdate) {
			logger.error("Error updating mediafiles table, id:", options.id, "magnet:", magnet);
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

	const dbPubkey = await connect();
	const [dbResult] = await dbPubkey.query("SELECT username FROM registered WHERE hex = ?", [pubkey]);
	const rowstemp = JSON.parse(JSON.stringify(dbResult));

	if (rowstemp[0] == undefined) {
		return "";	
	}else{
		return rowstemp[0]['username'];
	}
}

async function showDBStats(){

	const conn = await connect();
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
		 dbFileMagnetUpdate, 
		 dbSelectUsername,
		 showDBStats};
