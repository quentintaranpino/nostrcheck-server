import { Request, Response } from "express";
import validator from "validator";
import { logger } from "../lib/logger.js";
import { getAvailableDomains } from "../lib/domains.js";
import app from "../app.js";
import { getClientIp } from "../lib/utils.js";
import { isModuleEnabled } from "../lib/config.js";
import { verifyNIP07event } from "../lib/nostr/NIP07.js";
import { addNewUsername, isUsernameAvailable } from "../lib/register.js";
import { ResultMessagev2 } from "../interfaces/server.js";

const registerUsername = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("register", app)) {
		logger.warn(`Attempt to access a non-active module: register | IP: ${getClientIp(req)}`);
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`POST /api/v2/register - ${getClientIp(req)}`);

	// Verify NIP07 event integrity
	const isEventValid = await verifyNIP07event(req);
	if (!isEventValid) {
		logger.warn(`RES -> 401 unauthorized  - ${getClientIp(req)}`);
		return res.status(401).send({status: "error", message: "Unauthorized"});
	}

	const username = Array.isArray(req.body.tags) ? req.body.tags.find((tag: string[]) => tag[0] === "username")?.[1] : "";
	let validUsername = validator.default.isLength(username, { min: 3, max: 50 }); 
	validUsername == true? validUsername = validator.default.matches(username, /^[a-zA-Z0-9-_]+$/) : validUsername = false;
	if (!validUsername) {
		logger.warn(`RES -> 422 Bad request - Username not valid`, "|", getClientIp(req));
		return res.status(401).send({status: "error", message: "Invalid username format"});
	}
	if (!await isUsernameAvailable(username)) {
		logger.warn("RES ->", username, "|", "Username already registered");
		return res.status(406).send({status: "error", message: "Username already registered"});
	}

	const domain = Array.isArray(req.body.tags) ? req.body.tags.find((tag: string[]) => tag[0] === "domain")?.[1] : "";
	let validDomain = false;
	(await getAvailableDomains()).forEach((element: string) => {element === domain ? validDomain = true : null});
	if (!validDomain) {
		logger.warn("RES -> 406 Bad request - Domain not allowed", "|", getClientIp(req));
		return res.status(406).send({status: "error", message: "Invalid domain"});
	}

	const password = Array.isArray(req.body.tags) ? req.body.tags.find((tag: string[]) => tag[0] === "password")?.[1] : "";
	
	const addUsername = await addNewUsername(username, req.body.pubkey, password, domain);
	if (addUsername == 0) {
		logger.error("RES -> Failed to add new username" + " | " + getClientIp(req));
		return res.status(500).send({status: "error", message: "Failed to add new username to the database"});
	}

	logger.info(`RES -> 200 OK - New user ${username} registered successfully - ${getClientIp(req)}`);

	const result : ResultMessagev2 = {
		status: "success",
		message: "New user registered successfully",
	};

	return res.status(200).send({result});

};

export { registerUsername };