import { createPool, Pool } from "mysql2/promise";
import { logger } from "./logger";

export async function connect(): Promise<Pool> {
	const connection = await createPool({
		host: "localhost",
		user: "root",
		password: "root",
		database: "nostrcheck",
		waitForConnections: true,
		connectionLimit: 10,
	});

	return connection;
}

export async function populateTables(resetTables : boolean): Promise<boolean>{

	if (resetTables){
	//Drop registered table
	const conn = await connect();
	logger.info("Dropping table registered");
	let RegisteredTableDropStatement : string =	"DROP TABLE IF EXISTS registered;"
	await conn.query(RegisteredTableDropStatement);
	conn.end();
	}

	//Create registered table
	const conn = await connect();
	let ExistRegisteredTableStatement : string = "SHOW TABLES FROM `nostrcheck` LIKE 'registered';"
	logger.info("Checking if table registered exist")
	const [ExistRegisteredTable] = await conn.query(ExistRegisteredTableStatement);
	const rowstemp = JSON.parse(JSON.stringify(ExistRegisteredTable));
	if(rowstemp[0] == undefined){

		let RegisteredTableCreateStatement : string =
		"CREATE TABLE IF NOT EXISTS registered ("+
		"id int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,"+
		"pubkey varchar(64) NOT NULL,"+
		"hex varchar(64) NOT NULL,"+
		"username varchar(50) NOT NULL,"+
		"password varchar(100) NOT NULL,"+
		"domain varchar(50) NOT NULL,"+
		"active boolean NOT NULL DEFAULT 0,"+
		"date datetime NOT NULL,"+
		"comments varchar(150)"+
		") ENGINE=InnoDB DEFAULT CHARSET=latin1;"

		logger.info("Creating table registered");

		await conn.query(RegisteredTableCreateStatement);
		conn.end();
	}else{
		logger.info("Table registered alredy exist, skipping creation");
	}	

return true;
}