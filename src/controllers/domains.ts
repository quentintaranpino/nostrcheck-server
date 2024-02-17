import { Request, Response } from "express";

import { logger } from "../lib/logger.js";
import { parseAuthHeader} from "../lib/authorization.js";
import { ResultMessagev2 } from "../interfaces/server.js";
import { redisClient } from "../lib/redis.js";
import { getClientIp } from "../lib/server.js";
import { QueryAvailiableDomains, QueryAvailiableUsers } from "../lib/domains.js";
import { dbUpdate, dbSelect } from "../lib/database.js";
import { registeredTableFields } from "../interfaces/database.js";

const AvailableDomains = async (req: Request, res: Response): Promise<Response> => {

	logger.info("REQ -> Domain list ", "|", getClientIp(req));

     // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "AvailableDomains", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

	try {
		const AvailableDomains = await QueryAvailiableDomains();
		if (AvailableDomains !== undefined) {
			logger.info("RES -> Domain list ", "|", getClientIp(req));

			return res.status(200).send({AvailableDomains, "authkey" : EventHeader.authkey});
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

    // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "AvailableUsers", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

	try {
		const AvailableUsers = await QueryAvailiableUsers(req.params.domain);
		if (AvailableUsers == undefined) {
			logger.warn("RES -> Empty user list ", "|", getClientIp(req));
			return res.status(404).send({ [req.params.domain]: "No users available" });
		}

		logger.info("RES -> User list ", "|", getClientIp(req));
		return res.status(200).send({ [req.params.domain]: AvailableUsers, "authkey" : EventHeader.authkey});
		
	} catch (error) {
		logger.error(error);

		return res.status(500).send({ description: "Internal server error" });
	}
};

const UpdateUserDomain = async (req: Request, res: Response): Promise<Response> => {

	const servername = req.hostname;
	const domain = req.params.domain;

	// Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "UpdateUserDomain", false);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

	//If domain is null return 400
	if (!domain || domain.trim() == "") {

		logger.info("REQ Update user domain ->", servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  "domain not specified  |", getClientIp(req));
		logger.warn(
			"RES Update user domain -> 400 Bad request - domain parameter not specified",
			"|",
			getClientIp(req)
		);

		const result: ResultMessagev2 = {
			status: "error",
			message: "Bad request - You have to specify the 'domain' parameter",
		};

		return res.status(400).send(result);
	}

	//If domain is too long (>50) return 400
	if (domain.length > 50) {

		logger.info("REQ Update user domain ->", servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain.substring(0,50) + "...", "|", getClientIp(req));
		logger.warn("RES Update user domain -> 400 Bad request - domain too long", "|", getClientIp(req));

		const result: ResultMessagev2 = {
			status: "error",
			message: "Bad request - Domain is too long",
		};

		return res.status(400).send(result);
	}

	logger.info("REQ Update user domain ->", servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain, "|", getClientIp(req));

	//Query if domain exist
	const CurrentDomains = await QueryAvailiableDomains();
	logger.debug("Current domains: ", CurrentDomains.join(", "));
	if (!CurrentDomains.includes(domain)) {
		logger.warn("RES Update user domain -> 404  not found, domain not found", "|", getClientIp(req));

		const result: ResultMessagev2 = {
			status: "error",
			message: "Domain not found",
		};

		return res.status(404).send(result);
	}

	try {
		const updateUserDomain = await dbUpdate("registered","domain",domain,"hex",EventHeader.pubkey);
		if (!updateUserDomain) {
			logger.warn("RES Update user domain -> 404  not found, can't update user domain", "|", getClientIp(req));
			const result: ResultMessagev2 = {
				status: "error",
				message: "Can't update user domain, contact administrator",
			};
			return res.status(404).send(result);
		}
	}
	catch (error) {
		logger.error(error);
		const result: ResultMessagev2 = {
			status: "error",
			message: "Internal server error",
		};
		return res.status(500).send(result);
	}

	//select username and domain from database for redis cache delete
	const selectUsername = await dbSelect("SELECT username FROM registered WHERE hex = ?", "username", [EventHeader.pubkey],registeredTableFields);
	const selectDomain = await dbSelect("SELECT domain FROM registered WHERE hex = ?", "domain", [EventHeader.pubkey],registeredTableFields);
	if (selectUsername != undefined && selectDomain != undefined) {
		const deletecache = await redisClient.del(selectUsername + "-" + selectDomain);
		if (deletecache != 0) {
			logger.debug("Update user domain ->", EventHeader.pubkey, "|", "Redis cache cleared");
		}
	}

	logger.info("RES Update user domain ->", servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain, "|", "User domain updated", "|", getClientIp(req));
	const result: ResultMessagev2 = {
		status: "success",
		message: `User domain for pubkey ${EventHeader.pubkey} updated`,
	};
	return res.status(200).send(result);
};

export { AvailableDomains, AvailableUsers, UpdateUserDomain };
