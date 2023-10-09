import { Request, Response } from "express";

import { connect } from "../lib/database.js";
import { logger } from "../lib/logger.js";
import { ParseAuthEvent } from "../lib/nostr/NIP98.js";
import { IsAuthorizedPubkey } from "../lib/authorization.js";
import { AvailableDomainsResult } from "../interfaces/domains.js";
import { ResultMessage } from "../interfaces/server.js";
import { redisClient } from "../lib/redis.js";

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

	//Available domains endpoint
	logger.info("REQ -> Domain list ", "|", req.socket.remoteAddress);

	//Check if event authorization header is valid
	const EventHeader = await ParseAuthEvent(req);
	if (!EventHeader.result) {
		logger.warn(
			`RES -> 401 unauthorized  - ${EventHeader.description}`,
			"|",
			req.socket.remoteAddress
		);
		const result = {
			result: false,
			description: EventHeader.description,
		};

		return res.status(401).send(result);
	}

	//Check if pubkey is allowed to view available domains
	const allowed = IsAuthorizedPubkey(EventHeader.pubkey);
	if (!allowed) {
		logger.warn(
			`RES -> 401 unauthorized  - ${EventHeader.description}`,
			"|",
			req.socket.remoteAddress
		);

		const result = {
			result: false,
			description: "Pubkey is not allowed to view available domains",
		};

		return res.status(401).send(result);

	}

	try {
		const AvailableDomains: AvailableDomainsResult = await QueryAvailiableDomains();
		if (AvailableDomains !== undefined) {
			logger.info("RES -> Domain list ", "|", req.socket.remoteAddress);

			return res.status(200).send({AvailableDomains });
		}
		logger.warn("RES -> Domain list ", "|", req.socket.remoteAddress);

		return res.status(404).send({ "available domains": "No domains available" });
	} catch (error) {
		logger.error(error);

		return res.status(500).send({ description: "Internal server error" });
	}
};

const AvailableUsers = async (req: Request, res: Response): Promise<Response> => {

	//Available users from a domain endpoint
	logger.info("REQ -> User list from domain:", req.params.domain, "|", req.socket.remoteAddress);

	//Check if event authorization header is valid
	const EventHeader = await ParseAuthEvent(req);
	if (!EventHeader.result) {
		logger.warn(
			`RES -> 401 unauthorized  - ${EventHeader.description}`,
			"|",
			req.socket.remoteAddress
		);
		const result = {
			result: false,
			description: EventHeader.description,
		};

		return res.status(401).send(result);
	}

	//Check if pubkey is allowed to view available users
	const allowed = IsAuthorizedPubkey(EventHeader.pubkey);
	if (!allowed) {
		logger.warn(
			`RES -> 401 unauthorized  - ${EventHeader.description}`,
			"|",
			req.socket.remoteAddress
		);

		const result = {
			result: false,
			description: "Pubkey is not allowed to view available users",
		};

		return res.status(401).send(result);

	}

	try {
		const AvailableUsers = await QueryAvailiableUsers(req.params.domain);
		if (AvailableUsers == undefined) {
			logger.warn("RES -> Empty user list ", "|", req.socket.remoteAddress);
			return res.status(404).send({ [req.params.domain]: "No users available" });
		}

		logger.info("RES -> User list ", "|", req.socket.remoteAddress);
		return res.status(200).send({ [req.params.domain]: AvailableUsers });
		
	} catch (error) {
		logger.error(error);

		return res.status(500).send({ description: "Internal server error" });
	}
};

const UpdateUserDomain = async (req: Request, res: Response): Promise<any> => {

	const servername = req.hostname;
	const domain = req.params.domain;

	//Check if event authorization header is valid (NIP98) or if apikey is valid (v0)
	const EventHeader = await ParseAuthEvent(req);
	if (!EventHeader.result) {return res.status(401).send({"result": EventHeader.result, "description" : EventHeader.description});}

	//If domain is null return 400
	if (!domain || domain.trim() == "") {

		logger.info("REQ Update user domain ->", servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  "domain not specified  |", req.socket.remoteAddress);
		logger.warn(
			"RES Update user domain -> 400 Bad request - domain parameter not specified",
			"|",
			req.socket.remoteAddress
		);

		const result: ResultMessage = {
			result: false,
			description: "Bad request - You have to specify the 'domain' parameter",
		};

		return res.status(400).send(result);
	}

	//If domain is too long (>50) return 400
	if (domain.length > 50) {

		logger.info("REQ Update user domain ->", servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain.substring(0,50) + "...", "|", req.socket.remoteAddress);
		logger.warn("RES Update user domain -> 400 Bad request - domain too long", "|", req.socket.remoteAddress);

		const result: ResultMessage = {
			result: false,
			description: "Bad request - Domain is too long",
		};

		return res.status(400).send(result);
	}

	//Query if domain exist
	let CurrentDomains : AvailableDomainsResult = await QueryAvailiableDomains();

	logger.debug("Current domains: ", CurrentDomains);

	try {
		const conn = await connect("UpdateUserDomain");
		const [rows] = await conn.execute(
			"UPDATE registered SET domain = ? WHERE hex = ?",
			[domain, EventHeader.pubkey]
		);
		let rowstemp = JSON.parse(JSON.stringify(rows));
		conn.end();
		if (rowstemp.affectedRows == 0) {
			
			logger.warn("RES Update user domain -> 404  not found, can't update user domain", "|", req.socket.remoteAddress);

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
	let rowstemp = JSON.parse(JSON.stringify(rows));
	conn.end();
	if (rowstemp[0] != undefined) {

		//Delete redis cache
		const deletecache = await redisClient.del(rowstemp[0].username + "-" + rowstemp[0].domain);
		if (deletecache != 0) {
			logger.info("Update user domain ->", EventHeader.pubkey, "|", "Redis cache cleared");
		}
	}

	logger.info("RES Update user domain ->", servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain, "|", "User domain updated", "|", req.socket.remoteAddress);

	const result: ResultMessage = {
		result: true,
		description: `User domain for pubkey ${EventHeader.pubkey} updated`,
	};

	return res.status(200).send(result);

};


export { AvailableDomains, QueryAvailiableDomains, AvailableUsers, UpdateUserDomain };
