import { Request, Response } from "express";

import { connect } from "../lib/database.js";
import { logger } from "../lib/logger.js";
import { ParseAuthEvent } from "../lib/nostr/NIP98.js";
import { IsAuthorizedPubkey } from "../lib/authorization.js";

const QueryAvailiableDomains = async (): Promise<JSON[]> => {
	//Query database for available domains
	try {
		const conn = await connect();
		const rows = await conn.execute("SELECT domain from domains");
		if (rows[0] !== undefined) {
			conn.end();

			return JSON.parse(JSON.stringify(rows[0]));
		}
		conn.end();

		return JSON.parse(JSON.stringify({ "available domains": "No domains available" }));
	} catch (error) {
		logger.error(error);

		return JSON.parse(JSON.stringify({ description: "Internal server error" }));
	}
};

const QueryAvailiableUsers = async (domain:string): Promise<JSON[]> => {

	//Query database for available users from a domain
	try {
		const db = await connect();
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
		const AvailableDomains = await QueryAvailiableDomains();
		if (AvailableDomains[0] !== undefined) {
			logger.info("RES -> Domain list ", "|", req.socket.remoteAddress);

			return res.status(200).send({ domains: AvailableDomains });
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

export { AvailableDomains, QueryAvailiableDomains, AvailableUsers };
