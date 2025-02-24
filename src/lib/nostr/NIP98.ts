import crypto from "crypto";
import { Request } from "express";
import { Event } from "nostr-tools";
import { logger } from "../../lib/logger.js";
import { NIPKinds } from "../../interfaces/nostr.js";
import { authHeaderResult } from "../../interfaces/authorization.js";
import app from "../../app.js";
import { isPubkeyValid } from "../authorization.js";
import { getClientIp } from "../security/ips.js";
import { getMediaUrl } from "../media.js";
import { getHostInfo } from "../utils.js";

/**
 * Parses the authorization Nostr header (NIP98) and checks if it is valid. Visit for more information:
 * https://github.com/nostr-protocol/nips/blob/master/98.md
 * 
 * This method always check if the event pubkey is banned.
 * 
 * @param authevent - The NIP-98 event object.
 * @param req - The request object.
 * @param checkAdminPrivileges - Check if the event pubkey has admin privileges.
 * @param checkRegistered - Check if the event pubkey is registered.
 * @param checkActive - Check if the event pubkey is active.
 * @returns A promise that resolves to a VerifyResultMessage object.
 * 
 */
const isNIP98Valid = async (authevent: Event, req: Request, checkAdminPrivileges = true, checkRegistered = true, checkActive = true): Promise<authHeaderResult> => {

	// Check if event authorization kind is valid (Must be 27235)
	try {
		const eventKind: number = +authevent.kind;
		if (eventKind == null || eventKind == undefined || eventKind != NIPKinds.NIP98) {
			logger.warn(`isNIP98Valid - Auth header event kind is not 27235: ${eventKind}`, "|", getClientIp(req));
			return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: "", kind: 0};
		}

	} catch (error) {
		logger.error(`isNIP98Valid - Inetrnal server error: ${error}`, "|", getClientIp(req));
		return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: "", kind: 0};
	}

	// Check if created_at is within a reasonable time window (60 seconds)
	try {
		let created_at = authevent.created_at;
		const now = Math.floor(Date.now() / 1000);
		if (app.get('config.environment')  == "development") {
			logger.warn(`isNIP98Valid - DEVMODE: Setting created_at to now`, "|", getClientIp(req)); // If devmode is true, set created_at to now for testing purposes
			created_at = now - 30;
		} 
		const diff = now - created_at;
		if (diff > 60) {
			logger.warn(`isNIP98Valid - Auth header event created_at is not within a reasonable time window ${created_at}<>${now}`, "|", getClientIp(req));
			return {status: "error", message: `Auth header event created_at is not within a reasonable time window ${created_at}<>${now}`, authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`isNIP98Valid - internal server error: ${error}`, "|", getClientIp(req));
		return {status: "error", message: "Auth header event created_at is not within a reasonable time window", authkey: "", pubkey: "", kind: 0};
	}

	// Event endpoint
	const u = authevent.tags.find((t) => t.length === 2 && t[0] === "u")?.[1]
	if (!u) return {status: "error", message: "Auth header event endpoint is not valid", authkey: "", pubkey: "", kind: 0};
	const eventUrl = new URL(u).origin.replace(/^cdn\./, '').replace(/\/+$/, '');

	// Check if event authorization u tag (URL) is valid (Must be the same as the server endpoint)
	try {
		const requestUrl = getHostInfo().url.toLowerCase().replace(/\/+$/, '');

		if ((eventUrl == null || eventUrl == undefined || eventUrl != requestUrl) && app.get('config.environment') != "development") {
			logger.warn(`isNIP98Valid - Auth header event endpoint is not valid: ${eventUrl} <> ${requestUrl}`, "|", getClientIp(req));
			// return {status: "error", message: `Auth header (NIP98) event endpoint is not valid: ${eventEndpoint} <> ${serverEndpoint}`, authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`isNIP98Valid - Internal server error: ${error}`, "|", getClientIp(req));
		return {status: "error", message: "Auth header (NIP98) event endpoint is not valid", authkey: "", pubkey: "", kind: 0};
	}

	// Method
	const methodTag = authevent.tags.find(tag => tag[0] === "method");
	const eventMethod = methodTag ? methodTag[1] : null;

	// Check if authorization event method tag is valid (Must be the same as the request method)
	try {
		if (eventMethod == null || eventMethod == undefined || eventMethod != req.method) {
			logger.warn(`isNIP98Valid - Auth header event method is not valid: ${eventMethod} <> ${req.method}`, "|", getClientIp(req));
			return {status: "error", message: `Auth header event method is not valid`, authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`isNIP98Valid - Internal server error: ${error}`, "|", getClientIp(req));
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

			if (eventPayload != receivedpayload) logger.debug(`isNIP98Valid - Auth header event payload is not valid: ${eventPayload} <> ${receivedpayload}`, "|", getClientIp(req));

		} catch (error) {
			logger.error(`isNIP98Valid - Internal server error: ${error}`, "|", getClientIp(req));
		}
	}

	logger.debug("NIP 98 data |", "method:", eventMethod, "| u:", eventEndpoint, "| payload", eventPayload)

    // This is not from NIP98 spec, check local pubkey validation
	if (await isPubkeyValid(authevent.pubkey, checkAdminPrivileges, checkRegistered, checkActive) == false) {
		logger.warn(`isNIP98Valid - Auth header pubkey is not valid: ${authevent.pubkey}`, "|", getClientIp(req));
		return {status: "error", message: "Auth header pubkey is not valid", authkey: "", pubkey: "", kind: 0};
	}

	logger.info(`isNIP98Valid - Auth header event is valid`, "|", getClientIp(req));
	return { status: "success", message: "Auth header event is valid", authkey: "", pubkey: authevent.pubkey, kind: +authevent.kind};
};

export { isNIP98Valid };