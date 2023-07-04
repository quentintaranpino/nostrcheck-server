import { createPool, Pool } from "mysql2/promise";
import config from "config";
import { logger } from "./logger.js";

//Check database integrity
const dbtables = populateTables(config.get('database.droptables')); // true = reset tables
if (!dbtables) {
	logger.fatal("Error creating database tables");
	process.exit(1);
}

export async function connect(): Promise<Pool> {

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

export async function populateTables(resetTables: boolean): Promise<boolean> {
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

	//Create registered table
	const conn = await connect();

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
			"hash varchar(64)," +
			"status varchar(10) NOT NULL," +
			"visibility boolean NOT NULL DEFAULT 0," +
			"date datetime NOT NULL," +
			"ip_address varchar(64) NOT NULL," +
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


	conn.end();

	return true;
}
