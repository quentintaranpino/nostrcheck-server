import crypto from "crypto";
import { Request } from "express";
import { Event } from "nostr-tools";
import config from "config";
import { logger } from "../../lib/logger.js";
import { NIPKinds } from "../../interfaces/nostr.js";
import { authHeaderResult } from "../../interfaces/authorization.js";
import { dbSelect } from "../database.js";
import { registeredTableFields } from "../../interfaces/database.js";

/**
 * Parses the authorization Nostr header (NIP98) and checks if it is valid. Visit for more information: https://github.com/nostr-protocol/nips/blob/master/98.md
 * 
 * @param req - The request object.
 * @param endpoint - The endpoint of the request.
 * @returns A promise that resolves to a VerifyResultMessage object.
 */
const isNIP98Valid = async (authevent: Event, req: Request, checkAdminPrivileges = true): Promise<authHeaderResult> => {

	// Check if event authorization kind is valid (Must be 27235)
	try {
		const eventkind: number = +authevent.kind;
		if (eventkind == null || eventkind == undefined || eventkind != NIPKinds.NIP98) {
			logger.warn("RES -> 400 Bad request - Auth header event kind is not 27235","|",	req.socket.remoteAddress);
			return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: ""};
		}

	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: ""};
	}

	// Check if created_at is within a reasonable time window (60 seconds)
	try {
		let created_at = authevent.created_at;
		const now = Math.floor(Date.now() / 1000);
		if (config.get("environment")  == "development") {
			logger.warn("DEVMODE: Setting created_at to now", "|", req.socket.remoteAddress); //If devmode is true, set created_at to now for testing purposes
			created_at = now - 30;
		} 
		const diff = now - created_at;
		if (diff > 60) {
			logger.warn(
				"RES -> 400 Bad request - Auth header event created_at is not within a reasonable time window",
				"|",
				req.socket.remoteAddress
			);
			return {status: "error", message: `Auth header event created_at is not within a reasonable time window ${created_at}<>${now}`, authkey: "", pubkey: ""};
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		return {status: "error", message: "Auth header event created_at is not within a reasonable time window", authkey: "", pubkey: ""};
	}

	// Check if event authorization u tag (URL) is valid (Must be the same as the server endpoint)
	try {
		let AuthEventEndpoint = authevent.tags[0][1];
		const ServerEndpoint = `${req.protocol}://${req.headers.host}${req.url}`;
		if (config.get("environment") == "development") {
			logger.warn("DEVMODE: Setting 'u'(url) tag same as the endpoint URL", "|", req.socket.remoteAddress); // If devmode is true, set created_at to now for testing purposes
			AuthEventEndpoint = ServerEndpoint;
		} 
		if (AuthEventEndpoint == null ||AuthEventEndpoint == undefined ||AuthEventEndpoint != ServerEndpoint) {
			logger.warn("RES -> 400 Bad request - Auth header event endpoint is not valid",	"|", req.socket.remoteAddress);
			return {status: "error", message: `Auth header event endpoint is not valid: ${AuthEventEndpoint} <> ${ServerEndpoint}`, authkey: "", pubkey: ""};
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		return {status: "error", message: "Auth header event endpoint is not valid", authkey: "", pubkey: ""};
	}

	// Check if authorization event method tag is valid (Must be the same as the request method)
	try {
		const method = authevent.tags[1][1];
		const receivedmethod = req.method;
		if (method == null || method == undefined || method != receivedmethod) {
			logger.warn("RES -> 400 Bad request - Auth header event method is not valid:",receivedmethod,"<>",method,"|",req.socket.remoteAddress);
			return {status: "error", message: `Auth header event method is not valid`, authkey: "", pubkey: ""};
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		return {status: "error", message: "Auth header event method is not valid", authkey: "", pubkey: ""};
	}

	// Check if the request has a body and authorization event payload tag exist. (!GET)
	if (req.body.constructor === Object && Object.keys(req.body).length != 0 && req.method != "GET") {
		try {
			const payload = authevent.tags[2][1];
			if (!payload) {
				logger.warn("RES -> 400 Bad request - Auth header event payload not exist",	"|", req.socket.remoteAddress);
				return {status: "error", message: `Auth header event payload not exist`, authkey: "", pubkey: ""};
			}
		} catch (error) {
			logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
			return {status: "error", message: "Auth header event payload not exist", authkey: "", pubkey: ""};
		}
	}

	// Check if authorization event payload tag is valid (must be equal than the request body sha256) (!GET)
	if (req.method != "GET") {
		try {

			let payload = authevent.tags[2][1];
			const receivedpayload = crypto
				.createHash("sha256")
				.update(JSON.stringify(req.body), "binary")
				.digest("hex"); //TODO CHECK IF THIS HASH IS CORRECT!! (Only is hashing the body without the file data.)

			if (config.get("environment") == "development") {
				logger.warn("DEVMODE: Bypassing payload hash validation", "|", req.socket.remoteAddress);
				payload = receivedpayload;
			} //If devmode is true, set the payload = receivedpayload for testing purposes

			if (payload != receivedpayload) {
				logger.warn("RES -> 400 Bad request - Auth header event payload is not valid:",	receivedpayload, " <> ", payload, "|", req.socket.remoteAddress);
				return {status: "error", message: `Auth header event payload is not valid`, authkey: "", pubkey: ""};
			}
		} catch (error) {
			logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
			return {status: "error", message: "Auth header event payload is not valid", authkey: "", pubkey: ""};
		}
	}

	// This is not from NIP98 spec, but some server endpoints require admin privileges
	if (checkAdminPrivileges) {
		const isPubkeyAdmin = await dbSelect("SELECT allowed FROM registered WHERE hex = ?", "allowed", [authevent.pubkey], registeredTableFields);
		if (isPubkeyAdmin === "0") {
			logger.warn("RES -> 403 forbidden - Pubkey does not have admin privileges", "|", req.socket.remoteAddress);
			return {status: "error", message: "This pubkey does not have admin privileges", pubkey: authevent.pubkey, authkey: ""};
		}
	}

	return { status: "success", message: "Auth header event is valid", authkey: "", pubkey: authevent.pubkey };
};

export { isNIP98Valid };