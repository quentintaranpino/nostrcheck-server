import { Request, Response } from "express";
import { Event } from "nostr-tools";
import { logger } from "../lib/logger.js";
import { isEventValid } from "../lib/nostr/core.js";
import { isIpAllowed } from "../lib/security/ips.js";
import { isModuleEnabled } from "../lib/config/core.js";

const verifyEventController = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`verifyEventController - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("verify")) {
        logger.info("verifyEventController - Attempt to access a non-active module:","verify","|","IP:", reqInfo.ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`verifyEventController - Request from:`, reqInfo.ip);

	//Create event object
	const event: Event = {
		kind: req.body.kind,
		created_at: req.body.created_at,
		tags: req.body.tags,
		content: req.body.content,
		pubkey: req.body.pubkey,
		id: req.body.id,
		sig: req.body.sig,
	};

	const verifyResult = await isEventValid(event);

	const result = {
		pubkey: "",
		result: false,
		description: "",
	};
	let status : number = 400;

	if (verifyResult.status == "success") {
			logger.info(`verifyEventController - Valid event: ${event.id}`, "|", reqInfo.ip);
			result.pubkey = event.pubkey;
			result.result = true;
			result.description = "Valid Event";
			status = 200;
	} else {
			logger.info(`verifyEventController - Invalid event: ${event.id}`, "|", reqInfo.ip);
			result.pubkey = event.pubkey? event.pubkey : "";
			result.description = verifyResult.message;
	}

	return res.status(status).send(result);

};

export { verifyEventController };
