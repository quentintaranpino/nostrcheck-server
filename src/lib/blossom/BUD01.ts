
import { authHeaderResult } from "../../interfaces/authorization.js";
import { Event } from "nostr-tools";
import { Request } from "express";
import { logger } from "../logger.js";
import { BUDKinds } from "../../interfaces/blossom.js";
import { isPubkeyValid } from "../authorization.js";
import { getClientIp } from "../security/ips.js";
import { getConfig } from "../config/core.js";


/**
 * Parses the authorization Blossom header (BUD01) and checks if it is valid. Visit for more information:
 * https://github.com/hzrd149/blossom/blob/master/buds/01.md
 * 
 * This method always check if the event pubkey is banned.
 * 
 * @param authevent - The BUD-01 event object.
 * @param req - The request object.
 * @param endpoint - The endpoint of the request.
 * @param checkAdminPrivileges - Check if the event pubkey has admin privileges.
 * @param checkRegistered - Check if the event pubkey is registered.
 * @param checkActive - Check if the event pubkey is active.
 * @returns A promise that resolves to a VerifyResultMessage object.
  */
const isBUD01AuthValid = async (authevent: Event, req: Request, endpoint: string, checkAdminPrivileges = true, checkRegistered = true, checkActive = true): Promise<authHeaderResult> => {

    // Check if event authorization kind is valid (Must be 24242)
	try {
		const eventkind: number = +authevent.kind;
		if (eventkind == null || eventkind == undefined || eventkind != BUDKinds.BUD01_auth) {
			logger.warn(`isBUD01AuthValid - Auth header event kind is not 27235, event: ${authevent.id}, kind: ${eventkind} | ${getClientIp(req)}`);
			return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: "", kind: 0};
		}

	} catch (error) {
		logger.error(`isBUD01AuthValid - Internal server error: ${error}`, "|", getClientIp(req));
		return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: "", kind: 0};
	}
    
    
	// Check if created_at is in the past
	try {
		const created_at = authevent.created_at;
		const now = Math.floor(Date.now() / 1000);

        // Check if created_at is in the past
        if ((created_at -30) > now) {
			logger.warn(`isBUD01AuthValid - Auth header event created_at is not in the past, header: ${created_at} <> server: ${now} | ${getClientIp(req)}`);
            return {status: "error", message: "Auth header event created_at is not in the past", authkey: "", pubkey: "", kind: 0};
        }
	} catch (error) {
		logger.error(`isBUD01AuthValid - Internal server error: ${error}`, "|", getClientIp(req));
		return {status: "error", message: "Auth header event created_at is not in the past", authkey: "", pubkey: "", kind: 0};
	}

    // Check if the expiration tag is set
    const expirationTag = authevent.tags.find(tag => tag[0] === "expiration");
    if (!expirationTag) {
		logger.warn(`isBUD01AuthValid - Auth header event expiration tag is not set | ${getClientIp(req)}`);
        return {status: "error", message: "Auth header event expiration tag is not set", authkey: "", pubkey: "", kind: 0};
    }

    // Check if expiration tag is a unix timestamp
    const expiration = +expirationTag[1];
    if (isNaN(expiration)) {
		logger.warn(`isBUD01AuthValid - Auth header event expiration tag is not a unix timestamp | ${getClientIp(req)}`);
        return {status: "error", message: "Auth header event expiration tag is not a unix timestamp", authkey: "", pubkey: "", kind: 0};
    }

    // Event endpoint
	const endpointTag = authevent.tags.find(tag => tag[0] === "t");
	let eventEndpoint = endpointTag ? endpointTag[1] : null;

	// Check if event authorization u tag (URL) is valid (Must be the same as the server endpoint)
	try {

		if (getConfig(null, ["environment"]) == "development") {
			logger.warn(`isBUD01AuthValid - DEVMODE: Setting 't'(endpoint) tag same as the endpoint URL: ${eventEndpoint} <> ${endpoint}`, "|", getClientIp(req));
			eventEndpoint = endpoint;
		} 
		if (eventEndpoint == null || eventEndpoint == undefined || eventEndpoint != endpoint) {
			logger.warn(`isBUD01AuthValid - Auth header (Blossom) event endpoint is not valid: ${eventEndpoint} <> ${endpoint} | ${getClientIp(req)}`);
			return {status: "error", message: `Auth header (Blossom) event endpoint is not valid: ${eventEndpoint} <> ${endpoint}`, authkey: "", pubkey: "", kind: 0};
		}
	} catch (error) {
		logger.error(`isBUD01AuthValid - Internal server error: ${error}`, "|", getClientIp(req));
		return {status: "error", message: "Auth header (Blossom) event endpoint is not valid", authkey: "", pubkey: "", kind: 0};
	}

    // This is not from BUD01 spec, check local pubkey validation
	if (await isPubkeyValid(authevent.pubkey, checkAdminPrivileges, checkRegistered, checkActive) == false) {
		logger.warn(`isBUD01AuthValid - Auth header pubkey is not valid: ${authevent.pubkey} | ${getClientIp(req)}`);
		return {status: "error", message: "Auth header pubkey is not valid", authkey: "", pubkey: "", kind: 0};
	}

	logger.info(`isBUD01AuthValid - Auth header is valid: ${authevent.id} | ${getClientIp(req)}`);
    return {status: "success", message: "Auth header is valid", authkey: "", pubkey: authevent.pubkey, kind: +authevent.kind};
}

export { isBUD01AuthValid };