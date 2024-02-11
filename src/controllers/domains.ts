import { Request, Response } from "express";

import { connect } from "../lib/database.js";
import { logger } from "../lib/logger.js";
import { ParseAuthEvent } from "../lib/nostr/NIP98.js";
import { checkAuthkey } from "../lib/authorization.js";
import { AvailableDomainsResult } from "../interfaces/domains.js";
import { ResultMessage, ResultMessagev2 } from "../interfaces/server.js";
import { redisClient } from "../lib/redis.js";
import { getClientIp } from "../lib/server.js";

const QueryAvailiableDomains = async (): Promise<AvailableDomainsResult> => {
	//Query database for available domains
	try {
		const conn = await connect("QueryAvailiableDomains");
		const rows = await conn.execute("SELECT * from domains");
		const rowstemp = JSON.parse(JSON.stringify(rows));
		conn.end();
		if (rowstemp !== undefined) {
			const result:AvailableDomainsResult = {
				domains:rowstemp[0],
			};
			return result;
		}

		return JSON.parse(JSON.stringify({ "available domains": "No domains available" }));
	} catch (error) {
		logger.error(error);

		return JSON.parse(JSON.stringify({ description: "Internal server error" }));
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

const AvailableDomains = async (req: Request, res: Response): Promise<Response> => {

	logger.info("REQ -> Domain list ", "|", getClientIp(req));

	// Check header has authorization token
	const authorized = await checkAuthkey(req)
	if ( authorized.status != "success") {
		const result : ResultMessagev2 = {
			status: "error",
			message: "Unauthorized"
			};
		logger.error("RES -> Unauthorized" + " | " + getClientIp(req));
		return res.status(401).send(result);
	}

	try {
		const AvailableDomains: AvailableDomainsResult = await QueryAvailiableDomains();
		if (AvailableDomains !== undefined) {
			logger.info("RES -> Domain list ", "|", getClientIp(req));

			return res.status(200).send({AvailableDomains, "authkey" : authorized.authkey});
		}
		logger.warn("RES -> Domain list ", "|", getClientIp(req));

		return res.status(404).send({ "available domains": "No domains available" });
	} catch (error) {
		logger.error(error);

		return res.status(500).send({ description: "Internal server error" });
	}
};

const AvailableUsers = async (req: Request, res: Response): Promise<Response> => {

	logger.info("REQ -> User list from domain:", req.params.domain, "|", getClientIp(req));

	// Check header has authorization token
	const authorized = await checkAuthkey(req)
	if ( authorized.status != "success") {
		const result : ResultMessagev2 = {
			status: "error",
			message: "Unauthorized"
			};
		logger.error("RES -> Unauthorized" + " | " + getClientIp(req));
		return res.status(401).send(result);
	}

	try {
		const AvailableUsers = await QueryAvailiableUsers(req.params.domain);
		if (AvailableUsers == undefined) {
			logger.warn("RES -> Empty user list ", "|", getClientIp(req));
			return res.status(404).send({ [req.params.domain]: "No users available" });
		}

		logger.info("RES -> User list ", "|", getClientIp(req));
		return res.status(200).send({ [req.params.domain]: AvailableUsers, "authkey" : authorized.authkey});
		
	} catch (error) {
		logger.error(error);

		return res.status(500).send({ description: "Internal server error" });
	}
};

const UpdateUserDomain = async (req: Request, res: Response): Promise<Response> => {

	const servername = req.hostname;
	const domain = req.params.domain;

	//Check if event authorization header is valid (NIP98) or if apikey is valid (v0)
	const EventHeader = await ParseAuthEvent(req);
	if (!EventHeader.result) {return res.status(401).send({"result": EventHeader.result, "description" : EventHeader.description});}

	//If domain is null return 400
	if (!domain || domain.trim() == "") {

		logger.info("REQ Update user domain ->", servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  "domain not specified  |", getClientIp(req));
		logger.warn(
			"RES Update user domain -> 400 Bad request - domain parameter not specified",
			"|",
			getClientIp(req)
		);

		const result: ResultMessage = {
			result: false,
			description: "Bad request - You have to specify the 'domain' parameter",
		};

		return res.status(400).send(result);
	}

	//If domain is too long (>50) return 400
	if (domain.length > 50) {

		logger.info("REQ Update user domain ->", servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain.substring(0,50) + "...", "|", getClientIp(req));
		logger.warn("RES Update user domain -> 400 Bad request - domain too long", "|", getClientIp(req));

		const result: ResultMessage = {
			result: false,
			description: "Bad request - Domain is too long",
		};

		return res.status(400).send(result);
	}

	//Query if domain exist
	const CurrentDomains : AvailableDomainsResult = await QueryAvailiableDomains();

	logger.debug("Current domains: ", CurrentDomains);

	try {
		const conn = await connect("UpdateUserDomain");
		const [rows] = await conn.execute(
			"UPDATE registered SET domain = ? WHERE hex = ?",
			[domain, EventHeader.pubkey]
		);
		const rowstemp = JSON.parse(JSON.stringify(rows));
		conn.end();
		if (rowstemp.affectedRows == 0) {
			
			logger.warn("RES Update user domain -> 404  not found, can't update user domain", "|", getClientIp(req));

			const result: ResultMessage = {
				result: false,
				description: "Can't update user domain, contact administrator",
			};

			return res.status(404).send(result);
		}

	}
	catch (error) {
		logger.error(error);

		const result: ResultMessage = {
			result: false,
			description: "Internal server error",
		};

		return res.status(500).send(result);
	}

	//select domain from database
	const conn = await connect("UpdateUserDomain");
	const [rows] = await conn.execute(
		"SELECT username, domain FROM registered WHERE hex = ?",
		[EventHeader.pubkey]
	);
	const rowstemp = JSON.parse(JSON.stringify(rows));
	conn.end();
	if (rowstemp[0] != undefined) {

		//Delete redis cache
		const deletecache = await redisClient.del(rowstemp[0].username + "-" + rowstemp[0].domain);
		if (deletecache != 0) {
			logger.info("Update user domain ->", EventHeader.pubkey, "|", "Redis cache cleared");
		}
	}

	logger.info("RES Update user domain ->", servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain, "|", "User domain updated", "|", getClientIp(req));

	const result: ResultMessage = {
		result: true,
		description: `User domain for pubkey ${EventHeader.pubkey} updated`,
	};

	return res.status(200).send(result);

};


export { AvailableDomains, QueryAvailiableDomains, AvailableUsers, UpdateUserDomain };
