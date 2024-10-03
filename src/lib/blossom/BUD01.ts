
import { authHeaderResult } from "../../interfaces/authorization.js";
import { Event } from "nostr-tools";
import { Request } from "express";
import { logger } from "../logger.js";
import app from "../../app.js";
import { BUDKinds } from "../../interfaces/blossom.js";
import { isPubkeyValid } from "../authorization.js";
import { getClientIp } from "../utils.js";


// https://github.com/hzrd149/blossom/blob/master/buds/01.md

const isBUD01AuthValid = async (authevent: Event, req: Request, endpoint: string, checkAdminPrivileges = true): Promise<authHeaderResult> => {

    // Check if event authorization kind is valid (Must be 24242)
	try {
		const eventkind: number = +authevent.kind;
		if (eventkind == null || eventkind == undefined || eventkind != BUDKinds.BUD01_auth) {
			logger.warn(`RES -> 400 Bad request - Auth header event kind is not ${BUDKinds.BUD01_auth} | ${getClientIp(req)}`);
			return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: "", kind: 0};
		}

	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", getClientIp(req));
		return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: "", kind: 0};
	}
    
    
	// Check if created_at is in the past
	try {
		const created_at = authevent.created_at;
		const now = Math.floor(Date.now() / 1000);

        // Check if created_at is in the past
        if ((created_at -30) > now) {
            logger.warn(`RES -> 400 Bad request - Auth header event created_at is not in the past, header: ${created_at} <> server: ${now} | ${getClientIp(req)}`);
            return {status: "error", message: "Auth header event created_at is not in the past", authkey: "", pubkey: "", kind: 0};
        }
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", getClientIp(req));
		return {status: "error", message: "Auth header event created_at is not in the past", authkey: "", pubkey: "", kind: 0};
	}

    // Check if the expiration tag is set
    const expirationTag = authevent.tags.find(tag => tag[0] === "expiration");
    if (!expirationTag) {
        logger.warn(`RES -> 400 Bad request - Auth header event expiration tag is not set | ${getClientIp(req)}`);
        return {status: "error", message: "Auth header event expiration tag is not set", authkey: "", pubkey: "", kind: 0};
    }

    // Check if expiration tag is a unix timestamp
    const expiration = +expirationTag[1];
    if (isNaN(expiration)) {
        logger.warn(`RES -> 400 Bad request - Auth header event expiration tag is not a unix timestamp | ${getClientIp(req)}`);
        return {status: "error", message: "Auth header event expiration tag is not a unix timestamp", authkey: "", pubkey: "", kind: 0};
    }

    // Event endpoint
	const endpointTag = authevent.tags.find(tag => tag[0] === "t");
	let eventEndpoint = endpointTag ? endpointTag[1] : null;

	// Check if event authorization u tag (URL) is valid (Must be the same as the server endpoint)
	try {

		if (app.get('config.environment') == "development") {
			logger.warn("DEVMODE: Setting 't'(endpoint) tag same as the endpoint URL", "|", getClientIp(req));
			eventEndpoint = endpoint;
		} 
		if (eventEndpoint == null || eventEndpoint == undefined || eventEndpoint != endpoint) {
			logger.warn("RES -> 400 Bad request - Auth header event endpoint is not valid", eventEndpoint, "<>", endpoint,	"|", getClientIp(req));
			return {status: "error", message: `Auth header event endpoint is not valid: ${eventEndpoint} <> ${endpoint}`, authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", getClientIp(req));
		return {status: "error", message: "Auth header event endpoint is not valid", authkey: "", pubkey: "", kind: 0};
	}

    // This is not from BUD01 spec, check local pubkey validation
	if (await isPubkeyValid(authevent.pubkey, checkAdminPrivileges, false) == false) {
		logger.warn(`RES -> 400 Bad request - Auth header pubkey is not valid | ${getClientIp(req)}`);
		return {status: "error", message: "Auth header pubkey is not valid", authkey: "", pubkey: "", kind: 0};
	}

    return {status: "success", message: "Auth header is valid", authkey: "", pubkey: authevent.pubkey, kind: +authevent.kind};
}

export { isBUD01AuthValid };