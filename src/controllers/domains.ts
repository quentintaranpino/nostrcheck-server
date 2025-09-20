import { Request, Response } from "express";

import { logger } from "../lib/logger.js";
import { isIpAllowed } from "../lib/security/ips.js";
import { getDomains, getDomainUsers } from "../lib/domains.js";
import { isModuleEnabled } from "../lib/config/core.js";

const listDomains = async (req: Request, res: Response): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`listAvailableDomains - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("domains", "")) {
        logger.warn(`listAvailableDomains - Attempt to access a non-active module: domains | IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`listAvailableDomains - Request from:`, reqInfo.ip);

	const availableDomains = await getDomains();

	logger.info(`listAvailableDomains - Response:`, Object.keys(availableDomains).join(", "), "|", reqInfo.ip);

	return res.status(200).send({
		availableDomains: availableDomains,
	});
};

const listDomainUsers = async (req: Request, res: Response): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`listAvailableUsers - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("domains", "")) {
        logger.warn(`listAvailableUsers - Attempt to access a non-active module: domains | IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`listAvailableUsers - Request from:`, reqInfo.ip);
	const availableUsers = await getDomainUsers(req.params.domain);
	logger.info(`listAvailableUsers - Response:`, req.params.domain, ":", availableUsers.length, "|", reqInfo.ip);
	return res.status(200).send({ [req.params.domain]: availableUsers});
	
};

export { listDomains, listDomainUsers };