
import crypto from "crypto";
import { authHeaderResult } from "../../interfaces/authorization.js";
import { Event } from "nostr-tools";
import { Request } from "express";
import { logger } from "../logger.js";
import { BUDKinds } from "../../interfaces/blossom.js";
import { isPubkeyValid } from "../authorization.js";
import { getClientInfo } from "../security/ips.js";
import { getConfig } from "../config/core.js";
import { isEventValid } from "../nostr/core.js";
import { getHostInfo } from "../utils.js";
import { initRedis } from "../redis/client.js";

const redisCore = await initRedis(0, false);

// Max TTL for the anti-replay key. Caps how long a client can pin a Redis entry
// via a far-future `expiration` tag. 24h is well above any realistic auth window.
const MAX_REPLAY_TTL = 60 * 60 * 24;

// Endpoints that, per BUD-02/BUD-11, MUST carry an `x` tag scoping the event
// to a specific blob hash. Other endpoints (list, get, ...) leave `x` optional.
const X_TAG_REQUIRED_ENDPOINTS = new Set(["upload", "delete", "media"]);

// Normalize a host string for comparison: strip protocol, path, port and the
// `cdn.` prefix. Clients may sign the `server` tag with a full URL or a bare
// hostname; the request hostname can come in as the cdn subdomain.
const normalizeHost = (s: string): string => {
	let h = (s || "").toLowerCase().trim();
	h = h.replace(/^https?:\/\//, "");
	h = h.split("/")[0];
	h = h.split(":")[0];
	h = h.replace(/^cdn\./, "");
	return h;
};

// Some clients sign the `server` tag with a comma-joined list of URLs. Split first, 
// then normalize each piece, and drop empties.
const normalizeHostList = (s: string): string[] =>
	(s || "")
		.split(",")
		.map(normalizeHost)
		.filter(h => h.length > 0);


/**
 * Parses a Blossom authorization event (kind 24242) and checks if it is valid. Visit for more information:
 * https://github.com/hzrd149/blossom/blob/master/buds/11.md
 *
 * This method always check if the event pubkey is banned.
 *
 * @param authevent - The BUD-11 authorization event.
 * @param req - The request object.
 * @param endpoint - The endpoint verb of the request (must match the event `t` tag).
 * @param checkAdminPrivileges - Check if the event pubkey has admin privileges.
 * @param checkRegistered - Check if the event pubkey is registered.
 * @param checkActive - Check if the event pubkey is active.
 * @returns A promise that resolves to a VerifyResultMessage object.
  */
const isBUD11AuthValid = async (authevent: Event, req: Request, endpoint: string, checkAdminPrivileges = true, checkRegistered = true, checkActive = true): Promise<authHeaderResult> => {

	// Check if event is valid
	try {
		const isValid = (await isEventValid(authevent)).status === "success";
		if (!isValid) {
			logger.warn(`isBUD11AuthValid - Auth header event is not valid`, "|", getClientInfo(req).ip);
			return {status: "error", message: "Auth header event is not valid", authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`isBUD11AuthValid - Internal server error: ${error}`, "|", getClientInfo(req).ip);
		return {status: "error", message: "Auth header event is not valid", authkey: "", pubkey: "", kind: 0};
	}


    // Check if event authorization kind is valid (Must be 24242)
	try {
		const eventkind: number = +authevent.kind;
		if (eventkind == null || eventkind == undefined || eventkind != BUDKinds.BUD11_auth) {
			logger.warn(`isBUD11AuthValid - Auth header event kind is not 24242, event: ${authevent.id}, kind: ${eventkind} | ${getClientInfo(req).ip}`);
			return {status: "error", message: "Auth header event kind is not 24242", authkey: "", pubkey: "", kind: 0};
		}

	} catch (error) {
		logger.error(`isBUD11AuthValid - Internal server error: ${error}`, "|", getClientInfo(req).ip);
		return {status: "error", message: "Auth header event kind is not 24242", authkey: "", pubkey: "", kind: 0};
	}


	// Check if created_at is in the past
	try {
		const created_at = authevent.created_at;
		const now = Math.floor(Date.now() / 1000);

        // Check if created_at is in the past
        if ((created_at -30) > now) {
			logger.warn(`isBUD11AuthValid - Auth header event created_at is not in the past, header: ${created_at} <> server: ${now} | ${getClientInfo(req).ip}`);
            return {status: "error", message: "Auth header event created_at is not in the past", authkey: "", pubkey: "", kind: 0};
        }
	} catch (error) {
		logger.error(`isBUD11AuthValid - Internal server error: ${error}`, "|", getClientInfo(req).ip);
		return {status: "error", message: "Auth header event created_at is not in the past", authkey: "", pubkey: "", kind: 0};
	}

    // Check if the expiration tag is set
    const expirationTag = authevent.tags.find(tag => tag[0] === "expiration");
    if (!expirationTag) {
		logger.warn(`isBUD11AuthValid - Auth header event expiration tag is not set | ${getClientInfo(req).ip}`);
        return {status: "error", message: "Auth header event expiration tag is not set", authkey: "", pubkey: "", kind: 0};
    }

    // Check if expiration tag is a unix timestamp
    const expiration = +expirationTag[1];
    if (isNaN(expiration)) {
		logger.warn(`isBUD11AuthValid - Auth header event expiration tag is not a unix timestamp | ${getClientInfo(req).ip}`);
        return {status: "error", message: "Auth header event expiration tag is not a unix timestamp", authkey: "", pubkey: "", kind: 0};
    }

    // Check if expiration is in the future
    const nowTs = Math.floor(Date.now() / 1000);
    if (expiration < nowTs) {
        logger.warn(`isBUD11AuthValid - Auth header event expired: ${expiration} < ${nowTs} | ${getClientInfo(req).ip}`);
        return {status: "error", message: "Auth header event expired", authkey: "", pubkey: "", kind: 0};
    }

    // BUD-11 requires a human-readable `content` field. Warn if missing; do not block (backward compat).
    if (!authevent.content || authevent.content.trim() == "") {
        logger.warn(`isBUD11AuthValid - Auth header event is missing content field | ${getClientInfo(req).ip}`);
    }

    // Event endpoint (`t` tag). Must match the requested endpoint verb.
	const endpointTag = authevent.tags.find(tag => tag[0] === "t");
	let eventEndpoint = endpointTag ? endpointTag[1] : null;

	// Many clients reuse a single t=upload event for /upload, /media and /mirror.
	if (eventEndpoint == "upload" && (endpoint == "media" || endpoint == "mirror")) {
		eventEndpoint = endpoint;
	}

	// Check if event authorization t tag is valid (Must be the same as the server endpoint)
	try {

		if (getConfig(null, ["environment"]) == "development") {
			logger.warn(`isBUD11AuthValid - DEVMODE: Setting 't'(endpoint) tag same as the endpoint URL: ${eventEndpoint} <> ${endpoint}`, "|", getClientInfo(req).ip);
			eventEndpoint = endpoint;
		}
		if (eventEndpoint == null || eventEndpoint == undefined || eventEndpoint != endpoint) {
			logger.warn(`isBUD11AuthValid - Auth header (Blossom) event endpoint is not valid: ${eventEndpoint} <> ${endpoint} | ${getClientInfo(req).ip}`);
			return {status: "error", message: `Auth header (Blossom) event endpoint is not valid: ${eventEndpoint} <> ${endpoint}`, authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`isBUD11AuthValid - Internal server error: ${error}`, "|", getClientInfo(req).ip);
		return {status: "error", message: "Auth header (Blossom) event endpoint is not valid", authkey: "", pubkey: "", kind: 0};
	}

    // `server` tag is optional. If present, the value MUST include the server's domain (BUD-11).
    // Both sides are normalized (protocol, path, port and cdn. prefix stripped) so a client
    // signing `https://nostrcheck.me` matches a request landing on `cdn.nostrcheck.me`. We also
    // accept a single tag whose value is a comma-joined list of URLs (multi-server test runners).
    try {
        const serverTags = authevent.tags
            .filter(tag => tag[0] === "server")
            .flatMap(tag => normalizeHostList(tag[1] || ""));
        if (serverTags.length > 0) {
            const reqHost = normalizeHost(req.hostname);
            const cfgHost = normalizeHost(getHostInfo(req.hostname).hostname);
            const allowed = new Set([reqHost, cfgHost].filter(h => h.length > 0));
            if (!serverTags.some(t => allowed.has(t))) {
                logger.warn(`isBUD11AuthValid - Auth header server tag does not include this host: ${serverTags.join(",")} <> ${[...allowed].join("|")} | ${getClientInfo(req).ip}`);
                return {status: "error", message: "Auth header server tag does not include this host", authkey: "", pubkey: "", kind: 0};
            }
        }
    } catch (error) {
        logger.error(`isBUD11AuthValid - Internal server error: ${error}`, "|", getClientInfo(req).ip);
        return {status: "error", message: "Auth header server tag validation failed", authkey: "", pubkey: "", kind: 0};
    }

    // This is not from BUD-11 spec, check local pubkey validation
	if (await isPubkeyValid(authevent.pubkey, checkAdminPrivileges, checkRegistered, checkActive) == false) {
		logger.warn(`isBUD11AuthValid - Auth header pubkey is not valid: ${authevent.pubkey} | ${getClientInfo(req).ip}`);
		return {status: "error", message: "Auth header pubkey is not valid", authkey: "", pubkey: "", kind: 0};
	}

	// For upload/delete the `x` tag is required and must scope to the blob being acted upon.
	// Cross-check against (a) the uploaded file buffer when present, (b) the `X-SHA-256` header
	// when present (BUD-11 HEAD /upload pre-flight). Multiple `x` tags are allowed per spec.
	if (X_TAG_REQUIRED_ENDPOINTS.has(endpoint)) {
		const xTags = authevent.tags.filter(tag => tag[0] === "x").map(tag => tag[1]);
		if (xTags.length == 0) {
			logger.warn(`isBUD11AuthValid - Missing x tag on ${endpoint} auth | ${getClientInfo(req).ip}`);
			return {status: "error", message: `Missing x tag on ${endpoint} auth`, authkey: "", pubkey: "", kind: 0};
		}

		const xSha256Header = Array.isArray(req.headers['x-sha-256']) ? req.headers['x-sha-256'][0] : req.headers['x-sha-256'];
		if (xSha256Header && !xTags.includes(xSha256Header)) {
			logger.warn(`isBUD11AuthValid - x tag does not match X-SHA-256 header: ${xTags.join(",")} <> ${xSha256Header} | ${getClientInfo(req).ip}`);
			return {status: "error", message: "x tag does not match X-SHA-256 header", authkey: "", pubkey: "", kind: 0};
		}

		// For endpoints whose URL carries the target blob hash (DELETE /<sha256>,
		// mirror variants...), the `x` tag must include it. This binds the signed
		// event to the specific blob that the URL refers to, per BUD-11.
		const urlHash = (req.params?.id || "").toLowerCase().split(".")[0];
		if (/^[a-f0-9]{64}$/.test(urlHash) && !xTags.map(x => x.toLowerCase()).includes(urlHash)) {
			logger.warn(`isBUD11AuthValid - x tag does not match URL blob hash: ${xTags.join(",")} <> ${urlHash} | ${getClientInfo(req).ip}`);
			return {status: "error", message: "x tag does not match URL blob hash", authkey: "", pubkey: "", kind: 0};
		}

		const files = (req as any).files;
		const file = Array.isArray(files) && files.length > 0 ? files[0] : null;
		if (file && file.buffer) {
			const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");
			if (!xTags.includes(fileHash)) {
				logger.warn(`isBUD11AuthValid - Blob hash mismatch: ${xTags.join(",")} <> ${fileHash} | ${getClientInfo(req).ip}`);
				return {status: "error", message: "Blob hash mismatch", authkey: "", pubkey: "", kind: 0};
			}
		}
	}

	// Anti-replay: reject if the same event.id was already used before its expiration.
	// TTL is capped so a far-future `expiration` can't pin the key indefinitely.
	// HEAD requests are skipped: BUD-02 pre-flight reuses the same auth event for
	// the subsequent PUT, so registering the id at HEAD time would 401 the upload.
	if (req.method !== "HEAD") {
		const ttl = Math.min(MAX_REPLAY_TTL, Math.max(1, expiration - Math.floor(Date.now() / 1000)));
		const seen = await redisCore.setNX(`auth:seen:${authevent.id}`, "1", ttl);
		if (!seen) {
			logger.info(`isBUD11AuthValid - Auth event already used (replay): ${authevent.id} | ${getClientInfo(req).ip}`);
			return {status: "error", message: "Auth event already used", authkey: "", pubkey: "", kind: 0};
		}
	}

	logger.info(`isBUD11AuthValid - Auth header is valid: ${authevent.id} | ${getClientInfo(req).ip}`);
    return {status: "success", message: "Auth header is valid", authkey: "", pubkey: authevent.pubkey, kind: +authevent.kind};
}

export { isBUD11AuthValid };
