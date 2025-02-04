import { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { getNIP96file } from "../lib/nostr/NIP96.js";
import { isModuleEnabled } from "../lib/config.js";
import app from "../app.js";
import { isIpAllowed } from "../lib/ips.js";
import { getNIP11file } from "../lib/nostr/NIP11.js";

const NIP96Data = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("media", app)) {
        logger.warn("Attempt to access a non-active module:","media","|","IP:", reqInfo.ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

    logger.info("REQ nip96.json ->", req.hostname, "|", reqInfo.ip);

    res.setHeader('Content-Type', 'application/json');
	return res.status(200).send(JSON.stringify(getNIP96file(req.hostname)));

};

const NIP11Data = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("relay", app)) {
        logger.warn("Attempt to access a non-active module:","relay","|","IP:", reqInfo.ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("REQ nip10.json ->", req.hostname, "|", reqInfo.ip);

	res.setHeader('Content-Type', 'application/json');
	return res.status(200).send(JSON.stringify(getNIP11file(app, req.hostname)));
	
};

export { NIP96Data, NIP11Data };


