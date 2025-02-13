import { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { parseAuthHeader} from "../lib/authorization.js";
import { ResultMessagev2 } from "../interfaces/server.js";
import { isIpAllowed } from "../lib/security/ips.js";
import { getAvailableDomains, getAvailiableUsers } from "../lib/domains.js";
import { dbUpdate, dbSelect } from "../lib/database.js";
import { isModuleEnabled } from "../lib/config.js";
import app from "../app.js";
import { setAuthCookie } from "../lib/frontend.js";
import { redisDel } from "../lib/redis.js";
import { loadLightningaddressEndpoint } from "../routes/lightningaddress.route.js";

const listAvailableDomains = async (req: Request, res: Response): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`listAvailableDomains - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("domains", app)) {
        logger.warn(`listAvailableDomains - Attempt to access a non-active module: domains | IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`listAvailableDomains - Request from:`, reqInfo.ip);

	const availableDomains = await getAvailableDomains();

	logger.info(`listAvailableDomains - Response:`, Object.keys(availableDomains).join(", "), "|", reqInfo.ip);

	return res.status(200).send({
		availableDomains: availableDomains,
		minUsernameLength: app.get("config.register")["minUsernameLength"],
		maxUsernameLength: app.get("config.register")["maxUsernameLength"],
	});
};

const listAvailableUsers = async (req: Request, res: Response): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`listAvailableUsers - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("domains", app)) {
        logger.warn(`listAvailableUsers - Attempt to access a non-active module: domains | IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`listAvailableUsers - Request from:`, reqInfo.ip);
	const availableUsers = await getAvailiableUsers(req.params.domain);
	logger.info(`listAvailableUsers - Response:`, req.params.domain, ":", availableUsers.length, "|", reqInfo.ip);
	return res.status(200).send({ [req.params.domain]: availableUsers});
	
};

const updateUserDomain = async (req: Request, res: Response): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`updateUserDomain - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("domains", app)) {
        logger.warn(`updateUserDomain - Attempt to access a non-active module: domains | IP:`, reqInfo.ip);
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

		logger.warn(`updateUserDomain - 400 Bad request - You have to specify the 'domain' parameter`, servername, " | pubkey:",  EventHeader.pubkey, "|", reqInfo.ip);

		const result: ResultMessagev2 = {
			status: "error",
			message: "Bad request - You have to specify the 'domain' parameter",
		};

		return res.status(400).send(result);
	}

	//If domain is too long (>50) return 400
	if (domain.length > 50) {

		logger.warn(`updateUserDomain - 400 Bad request - Domain is too long`, servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain, "|", reqInfo.ip);

		const result: ResultMessagev2 = {
			status: "error",
			message: "Bad request - Domain is too long",
		};

		return res.status(400).send(result);
	}

	logger.info(`updateUserDomain - Request from:`, servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain, "|", reqInfo.ip);

	//Query if domain exist
	const currentDomains = await getAvailableDomains();
	logger.debug("Current domains: ", Object.keys(currentDomains).join(", "));
	if (!Object.prototype.hasOwnProperty.call(currentDomains, domain)) {
		logger.warn(`updateUserDomain - 404 Domain not found`, servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain, "|", reqInfo.ip);
	
		const result: ResultMessagev2 = {
			status: "error",
			message: "Domain not found",
		};
	
		return res.status(404).send(result);
	}

	try {
		const updateUserDomain = await dbUpdate("registered",{"domain":domain},["hex"],[EventHeader.pubkey]);
		if (!updateUserDomain) {
			logger.warn(`updateUserDomain - 404 Can't update user domain`, servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain, "|", reqInfo.ip);
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
		logger.error(`updateUserDomain - 500 Internal server error`, servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain, "|", reqInfo.ip);
		return res.status(500).send(result);
	}

	//select username and domain from database for redis cache delete
	const selectUsername = await dbSelect("SELECT username FROM registered WHERE hex = ?", "username", [EventHeader.pubkey]) as string;
	const selectDomain = await dbSelect("SELECT domain FROM registered WHERE hex = ?", "domain", [EventHeader.pubkey]) as string;
	if (selectUsername != undefined && selectDomain != undefined) {
		const deletecache = await redisDel(selectUsername + "-" + selectDomain);
		if (deletecache) {
			logger.debug(`updateUserDomain - Update user domain ->`, servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain, "|", "User domain updated", "|", reqInfo.ip);
		}
	}

	logger.info(`updateUserDomain - Updated user domain successfully`, servername, " | pubkey:",  EventHeader.pubkey, " | domain:",  domain, "|", reqInfo.ip);
	const result: ResultMessagev2 = {
		status: "success",
		message: `User domain for pubkey ${EventHeader.pubkey} updated`,
	};
	return res.status(200).send(result);
};

export { listAvailableDomains, listAvailableUsers, updateUserDomain };
