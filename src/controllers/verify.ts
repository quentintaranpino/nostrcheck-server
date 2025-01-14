import { Request, Response } from "express";
import { Event } from "nostr-tools";

import { logger } from "../lib/logger.js";
import { getClientIp } from "../lib/utils.js";
import { isModuleEnabled } from "../lib/config.js";
import app from "../app.js";
import { isEventValid } from "../lib/nostr/core.js";

const verifyEventController = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("verify", app)) {
        logger.warn("Attempt to access a non-active module:","verify","|","IP:", getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("POST /api/v2/verify", "|", getClientIp(req));

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
			logger.info(`RES -> 200 OK - Valid event:`, event.id, "|", getClientIp(req))
			result.pubkey = event.pubkey;
			result.result = true;
			result.description = "Valid Event";
			status = 200;
	} else {
			logger.info(`RES -> 400 Bad request - ${verifyResult.message}`, "|", getClientIp(req));
			result.pubkey = event.pubkey? event.pubkey : "";
			result.description = verifyResult.message;
	}

	return res.status(status).send(result);

};

export { verifyEventController };
