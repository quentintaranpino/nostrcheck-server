import { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { parseAuthHeader} from "../lib/authorization.js";
import { ResultMessagev2 } from "../interfaces/server.js";
import { redisClient } from "../lib/redis.js";
import { getClientIp } from "../lib/utils.js";
import { getAvailableDomains, getAvailiableUsers } from "../lib/domains.js";
import { dbUpdate, dbSelect } from "../lib/database.js";
import { isModuleEnabled } from "../lib/config.js";
import app from "../app.js";
import { setAuthCookie } from "../lib/frontend.js";

const listAvailableDomains = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("domains", app)) {
        logger.warn("Attempt to access a non-active module:","domains","|","IP:", getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("REQ -> Available domains ", "|", getClientIp(req));

	const availableDomains = await getAvailableDomains();

	return res.status(200).send({
		availableDomains: availableDomains,
		minUsernameLength: app.get("config.register")["minUsernameLength"],
		maxUsernameLength: app.get("config.register")["maxUsernameLength"],
	});
};

const listAvailableUsers = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("domains", app)) {
        logger.warn("Attempt to access a non-active module:","domains","|","IP:", getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("REQ -> User list from domain:", req.params.domain, "|", getClientIp(req));

    // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "AvailableUsers", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}
	setAuthCookie(res, EventHeader.authkey);

	const availableUsers = await getAvailiableUsers(req.params.domain);
	return res.status(200).send({ [req.params.domain]: availableUsers});
	
};

const updateUserDomain = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("domains", app)) {
        logger.warn("Attempt to access a non-active module:","domains","|","IP:", getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	const servername = req.hostname;
	const domain = req.params.domain;

	// Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "UpdateUserDomain", false);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}
	setAuthCookie(res, EventHeader.authkey);

	//If domain is null return 400
	if (!domain || domain.trim() == "") {

		logger.info("REQ Update user domain ->", servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  "domain not specified  |", getClientIp(req));
		logger.info(
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
	const currentDomains = await getAvailableDomains();
	logger.debug("Current domains: ", Object.keys(currentDomains).join(", "));
	if (!Object.prototype.hasOwnProperty.call(currentDomains, domain)) {
		logger.warn("RES Update user domain -> 404  not found, domain not found", "|", getClientIp(req));
	
		const result: ResultMessagev2 = {
			status: "error",
			message: "Domain not found",
		};
	
		return res.status(404).send(result);
	}

	try {
		const updateUserDomain = await dbUpdate("registered","domain",domain,["hex"],[EventHeader.pubkey]);
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
	const selectUsername = await dbSelect("SELECT username FROM registered WHERE hex = ?", "username", [EventHeader.pubkey]) as string;
	const selectDomain = await dbSelect("SELECT domain FROM registered WHERE hex = ?", "domain", [EventHeader.pubkey]) as string;
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

export { listAvailableDomains, listAvailableUsers, updateUserDomain };
