import crypto from "crypto";
import { Request } from "express";
import { Event } from "nostr-tools";
import { logger } from "../../lib/logger.js";
import { NIPKinds } from "../../interfaces/nostr.js";
import { authHeaderResult } from "../../interfaces/authorization.js";
import { dbSelect } from "../database.js";
import app from "../../app.js";
import { isPubkeyValid } from "../authorization.js";

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
		const eventKind: number = +authevent.kind;
		if (eventKind == null || eventKind == undefined || eventKind != NIPKinds.NIP98) {
			logger.warn("RES -> 400 Bad request - Auth header event kind is not 27235","|",	req.socket.remoteAddress);
			return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: "", kind: 0};
		}

	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: "", kind: 0};
	}

	// Check if created_at is within a reasonable time window (60 seconds)
	try {
		let created_at = authevent.created_at;
		const now = Math.floor(Date.now() / 1000);
		if (app.get('config.environment')  == "development") {
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
			return {status: "error", message: `Auth header event created_at is not within a reasonable time window ${created_at}<>${now}`, authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		return {status: "error", message: "Auth header event created_at is not within a reasonable time window", authkey: "", pubkey: "", kind: 0};
	}

	// Event endpoint
	const uTag = authevent.tags.find(tag => tag[0] === "u");
	let eventEndpoint = uTag ? uTag[1] : null;

	// Check if event authorization u tag (URL) is valid (Must be the same as the server endpoint)
	try {
		const ServerEndpoint = `${req.protocol}://${req.headers.host}${req.url}`;
		if (app.get('config.environment') == "development") {
			logger.warn("DEVMODE: Setting 'u'(url) tag same as the endpoint URL", "|", req.socket.remoteAddress); // If devmode is true, set created_at to now for testing purposes
			eventEndpoint = ServerEndpoint;
		} 
		if (eventEndpoint == null || eventEndpoint == undefined || eventEndpoint != ServerEndpoint) {
			logger.warn("RES -> 400 Bad request - Auth header event endpoint is not valid", eventEndpoint, "<>", ServerEndpoint,	"|", req.socket.remoteAddress);
			return {status: "error", message: `Auth header event endpoint is not valid: ${eventEndpoint} <> ${ServerEndpoint}`, authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		return {status: "error", message: "Auth header event endpoint is not valid", authkey: "", pubkey: "", kind: 0};
	}

	// Method
	const methodTag = authevent.tags.find(tag => tag[0] === "method");
	let eventMethod = methodTag ? methodTag[1] : null;

	// Check if authorization event method tag is valid (Must be the same as the request method)
	try {
		if (eventMethod == null || eventMethod == undefined || eventMethod != req.method) {
			logger.warn("RES -> 400 Bad request - Auth header event method is not valid:",eventMethod,"<>",req.method,"|",req.socket.remoteAddress);
			return {status: "error", message: `Auth header event method is not valid`, authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		return {status: "error", message: "Auth header event method is not valid", authkey: "", pubkey: "", kind: 0};
	}

	// Payload
	const payloadTag = authevent.tags.find(tag => tag[0] === "payload");
	const eventPayload = payloadTag ? payloadTag[1] : null;

	// Check if authorization event payload tag is valid (must be equal than the request body sha256) (!GET)
	if (req.method == "POST" || req.method == "PUT" || req.method == "PATCH") {
		try {
			const receivedpayload = crypto
				.createHash("sha256")
				.update(JSON.stringify(req.body), "binary")
				.digest("hex"); 

			if (eventPayload != receivedpayload) {
				logger.debug("Auth header event payload is not valid:", eventPayload, " <> ", receivedpayload, "|", req.socket.remoteAddress);
			}
		} catch (error) {
			logger.debug("Auth header event payload is not valid:", eventPayload, "|", req.socket.remoteAddress);
		}
	}

	logger.debug("NIP 98 data |", "method:", eventMethod, "| u:", eventEndpoint, "| payload", eventPayload)

    // This is not from NIP98 spec, check local pubkey validation
	if (await isPubkeyValid(authevent.pubkey, checkAdminPrivileges, false) == false) {
		logger.warn(`Auth header pubkey is not valid | ${req.socket.remoteAddress}`);
		return {status: "error", message: "Auth header pubkey is not valid", authkey: "", pubkey: "", kind: 0};
	}

	return { status: "success", message: "Auth header event is valid", authkey: "", pubkey: authevent.pubkey, kind: +authevent.kind};
};

export { isNIP98Valid };