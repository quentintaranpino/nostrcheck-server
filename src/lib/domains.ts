import { RowDataPacket } from "mysql2";
import { connect } from "./database.js";
import { logger } from "./logger.js";


const QueryAvailiableDomains = async (): Promise<string[]> => {
    // Query database for available domains
    try {
        const conn = await connect("QueryAvailiableDomains");
        const [rows] = await conn.execute("SELECT domain from domains");
        conn.end();
        const domains = (rows as RowDataPacket[]).map(row => row.domain);
		logger.debug("Current domains ->", domains.join(", "));
        return domains;
    } catch (error) {
        logger.error(error);
        return [];
    }
};

const QueryAvailiableUsers = async (domain:string): Promise<JSON[]> => {

	//Query database for available users from a domain
	try {
		const db = await connect("QueryAvailiableUsers");
		const [dbResult] = await db.query("SELECT username, hex FROM registered where domain = ?", [domain]);
		const rowstemp = JSON.parse(JSON.stringify(dbResult));
		if (rowstemp[0] == undefined) {
			logger.error(`No results for domain ${domain}`);
			return JSON.parse(JSON.stringify({result: 'false', description: 'No results for domain' }));
		}

		return (rowstemp);

	} catch (error) {
		logger.error(error);

		return JSON.parse(JSON.stringify({ description: "Internal server error" }));
	}

};

export { QueryAvailiableDomains, QueryAvailiableUsers };