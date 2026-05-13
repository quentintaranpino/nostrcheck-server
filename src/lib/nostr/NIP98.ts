import crypto from "crypto";
import { Request } from "express";
import { Event } from "nostr-tools";
import { logger } from "../../lib/logger.js";
import { NIPKinds } from "../../interfaces/nostr.js";
import { authHeaderResult } from "../../interfaces/authorization.js";
import { isPubkeyValid } from "../authorization.js";
import { getClientInfo } from "../security/ips.js";
import { getHostInfo } from "../utils.js";
import { getConfig } from "../config/core.js";
import { isEventValid } from "./core.js";
import { initRedis } from "../redis/client.js";

const redisCore = await initRedis(0, false);

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

	// Check if event is valid
	try {
		const isValid = (await isEventValid(authevent)).status === "success";
		if (!isValid) {
			logger.warn(`isNIP98Valid - Auth header event is not valid`, "|", getClientInfo(req).ip);
			return {status: "error", message: "Auth header event is not valid", authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`isNIP98Valid - Internal server error: ${error}`, "|", getClientInfo(req).ip);
		return {status: "error", message: "Auth header event is not valid", authkey: "", pubkey: "", kind: 0};
	}

	// Check if event authorization kind is valid (Must be 27235)
	try {
		const eventKind: number = +authevent.kind;
		if (eventKind == null || eventKind == undefined || eventKind != NIPKinds.NIP98) {
			logger.warn(`isNIP98Valid - Auth header event kind is not 27235: ${eventKind}`, "|", getClientInfo(req).ip);
			return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: "", kind: 0};
		}

	} catch (error) {
		logger.error(`isNIP98Valid - Inetrnal server error: ${error}`, "|", getClientInfo(req).ip);
		return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: "", kind: 0};
	}

	// Check if created_at is within a reasonable time window (60 seconds)
	try {
		let created_at = authevent.created_at;
		const now = Math.floor(Date.now() / 1000);
		if (getConfig(null, ["environment"]) == "development") {
			logger.warn(`isNIP98Valid - DEVMODE: Setting created_at to now`, "|", getClientInfo(req).ip); // If devmode is true, set created_at to now for testing purposes
			created_at = now - 30;
		} 
		const diff = now - created_at;
		if (diff > 60) {
			logger.warn(`isNIP98Valid - Auth header event created_at is not within a reasonable time window ${created_at}<>${now}`, "|", getClientInfo(req).ip);
			return {status: "error", message: `Auth header event created_at is not within a reasonable time window ${created_at}<>${now}`, authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`isNIP98Valid - internal server error: ${error}`, "|", getClientInfo(req).ip);
		return {status: "error", message: "Auth header event created_at is not within a reasonable time window", authkey: "", pubkey: "", kind: 0};
	}

	// Event endpoint
	const u = authevent.tags.find((t) => t.length === 2 && t[0] === "u")?.[1]
	if (!u) return {status: "error", message: "Auth header event endpoint is not valid", authkey: "", pubkey: "", kind: 0};
	const eventHost = new URL(u).hostname.toLowerCase().replace(/^cdn\./, '').replace(/\/+$/, '');

	// Check if event authorization u tag (URL) is valid (Must be the same as the server endpoint)
	try {
		const serverHost = getHostInfo(req.hostname).hostname.toLowerCase().replace(/\/+$/, '');

		if ((eventHost == null || eventHost == undefined || eventHost != serverHost) && getConfig(null, ["environment"]) != "development") {
			logger.warn(`isNIP98Valid - Auth header event endpoint is not valid: ${eventHost} <> ${serverHost}`, "|", getClientInfo(req).ip);
			return {status: "error", message: `Auth header event endpoint is not valid: ${eventHost} <> ${serverHost}`, authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`isNIP98Valid - Internal server error: ${error}`, "|", getClientInfo(req).ip);
		return {status: "error", message: "Auth header (NIP98) event endpoint is not valid", authkey: "", pubkey: "", kind: 0};
	}

	// Method
	const methodTag = authevent.tags.find(tag => tag[0] === "method");
	const eventMethod = methodTag ? methodTag[1] : null;

	// Check if authorization event method tag is valid (Must be the same as the request method)
	try {
		if (eventMethod == null || eventMethod == undefined || eventMethod != req.method) {
			logger.warn(`isNIP98Valid - Auth header event method is not valid: ${eventMethod} <> ${req.method}`, "|", getClientInfo(req).ip);
			return {status: "error", message: `Auth header event method is not valid`, authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`isNIP98Valid - Internal server error: ${error}`, "|", getClientInfo(req).ip);
		return {status: "error", message: "Auth header event method is not valid", authkey: "", pubkey: "", kind: 0};
	}

	// Payload tag. NIP-98 spec uses `payload`; some Nostr clients flavour their
	// upload events Blossom-style and use `x` instead. We accept either as a
	// hash-binding tag, preferring `payload` when both are present.
	const payloadTag = authevent.tags.find(tag => tag[0] === "payload");
	const xTag = authevent.tags.find(tag => tag[0] === "x");
	const eventPayload = payloadTag ? payloadTag[1] : (xTag ? xTag[1] : null);

	// Check authorization event payload tag. Per NIP-98 ("SHOULD") and NIP-96
	// ("optionally"), the payload tag is OPTIONAL. If present we MUST validate
	// it against the file (uploads) or body hash (other writes). If absent we
	// log a warning and accept the request — the event signature, anti-replay
	// and method/u-tag checks still gate access.
	if (req.method == "POST" || req.method == "PUT" || req.method == "PATCH") {
		try {
			const files = (req as any).files;
			const file = Array.isArray(files) && files.length > 0 ? files[0] : null;

			if (file && file.buffer) {
				if (!eventPayload) {
					logger.info(`isNIP98Valid - Upload without payload/x tag, accepting on lenient interpretation`, "|", getClientInfo(req).ip);
				} else {
					// NIP-98 says hex, NIP-96 says base64. Compare against hex
					// (lowercased) and base64 / base64url variants of the same
					// 32-byte digest before refusing.
					const fileHashBytes = crypto.createHash("sha256").update(file.buffer).digest();
					const fileHashHex = fileHashBytes.toString("hex");
					const fileHashB64 = fileHashBytes.toString("base64");
					const fileHashB64Url = fileHashBytes.toString("base64url");
					const claimed = eventPayload.trim();
					const claimedLower = claimed.toLowerCase();
					if (claimedLower != fileHashHex && claimed != fileHashB64 && claimed != fileHashB64Url) {
						logger.warn(`isNIP98Valid - Auth header payload hash mismatch on upload: ${claimed} <> ${fileHashHex}`, "|", getClientInfo(req).ip);
						return {status: "error", message: "Auth header payload hash mismatch on upload", authkey: "", pubkey: "", kind: 0};
					}
				}
			} else if (eventPayload) {
				// Lenient: when there's no file we have no canonical "body" the client
				// could have hashed (login passes the signed event itself as req.body,
				// so any payload tag the client included was computed against something
				// else). Warn on mismatch but accept. Signature + u + method + replay
				// guards still gate access.
				const bodyHash = crypto.createHash("sha256").update(JSON.stringify(req.body), "binary").digest("hex");
				if (eventPayload != bodyHash) {
					logger.info(`isNIP98Valid - payload tag does not match body hash, accepting on lenient interpretation`, "|", getClientInfo(req).ip);
				}
			}

		} catch (error) {
			logger.error(`isNIP98Valid - Internal server error: ${error}`, "|", getClientInfo(req).ip);
			return {status: "error", message: "Auth header event payload verification failed", authkey: "", pubkey: "", kind: 0};
		}
	}

	logger.debug("NIP 98 data |", "method:", eventMethod, "| u:", u, "| payload", eventPayload)

    // This is not from NIP98 spec, check local pubkey validation
	if (await isPubkeyValid(authevent.pubkey, checkAdminPrivileges, checkRegistered, checkActive) == false) {
		logger.warn(`isNIP98Valid - Auth header pubkey is not valid: ${authevent.pubkey}`, "|", getClientInfo(req).ip);
		return {status: "error", message: "Auth header pubkey is not valid", authkey: "", pubkey: "", kind: 0};
	}

	// Anti-replay: reject if the same event.id was already used within the allowed window
	const ttl = Math.max(1, 60 - (Math.floor(Date.now() / 1000) - authevent.created_at));
	const seen = await redisCore.setNX(`auth:seen:${authevent.id}`, "1", ttl);
	if (!seen) {
		logger.info(`isNIP98Valid - Auth event already used (replay): ${authevent.id}`, "|", getClientInfo(req).ip);
		return {status: "error", message: "Auth event already used", authkey: "", pubkey: "", kind: 0};
	}

	logger.info(`isNIP98Valid - Auth header event is valid`, "|", getClientInfo(req).ip);
	return { status: "success", message: "Auth header event is valid", authkey: "", pubkey: authevent.pubkey, kind: +authevent.kind};
};

export { isNIP98Valid };