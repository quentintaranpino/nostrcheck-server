import { Request, Response } from "express";
import { Event } from "nostr-tools";

import { logger } from "../lib/logger.js";
import { VerifyResultMessage } from "../interfaces/verify.js";
import { getClientIp } from "../lib/server.js";
import { verifyEvent } from "../lib/verify.js";

const verifyEventController = async (req: Request, res: Response): Promise<Response> => {
	logger.info("POST /api/v1/verify", "|", getClientIp(req));

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

	let verifyResult = await verifyEvent(event);

	let result: VerifyResultMessage = {
		pubkey: "",
		result: false,
		description: "",
	};
	let status : number = 400;

	if (verifyResult === 0) {
			logger.info(`RES -> 200 OK - Valid event:`, event.id, "|", getClientIp(req))
			result.pubkey = event.pubkey;
			result.result = true;
			result.description = "Valid Event";
			status = 200;
	}
	if (verifyResult === -1) {
			logger.warn(`RES -> 400 Bad request - Event hash is not valid`, "|", getClientIp(req));
				result.pubkey = event.pubkey;
				result.description= "Event hash is not valid";
	}
	if (verifyResult === -2) {
			logger.warn(`RES -> 400 Bad request - Event signature is not valid`, "|", getClientIp(req));
			result.pubkey = event.pubkey;
			result.description=  "Event signature is not valid";
	}
	if (verifyResult === -3) {
			logger.warn(`RES -> 400 Bad request - Malformed event`, "|", getClientIp(req));
				result.description= "Malformed event";
	}

	return res.status(status).send(result);

};

export { verifyEventController };
