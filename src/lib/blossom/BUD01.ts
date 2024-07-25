
import { authHeaderResult } from "../../interfaces/authorization.js";
import { Event } from "nostr-tools";
import { Request } from "express";
import { logger } from "../logger.js";
import app from "../../app.js";
import { dbSelect } from "../database";


// https://github.com/hzrd149/blossom/blob/master/buds/01.md

const isBUD01AuthValid = async (authevent: Event, req: Request, checkAdminPrivileges = true): Promise<authHeaderResult> => {

    // Check if event authorization kind is valid (Must be 24242)
	try {
		const eventkind: number = +authevent.kind;
		if (eventkind == null || eventkind == undefined || eventkind != BUDKinds.BUD01_auth) {
			logger.warn(`RES -> 400 Bad request - Auth header event kind is not ${BUDKinds.BUD01_auth} | ${req.socket.remoteAddress}`);
			return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: ""};
		}

	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		return {status: "error", message: "Auth header event kind is not 27235", authkey: "", pubkey: ""};
	}
    
    
	// Check if created_at is in the past
	try {
		let created_at = authevent.created_at;
		const now = Math.floor(Date.now() / 1000);

        // Check if created_at is in the past
        if (created_at >= now) {
            logger.warn(`RES -> 400 Bad request - Auth header event created_at is not in the past | ${req.socket.remoteAddress}`);
            return {status: "error", message: "Auth header event created_at is not in the past", authkey: "", pubkey: ""};
        }
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		return {status: "error", message: "Auth header event created_at is not in the past", authkey: "", pubkey: ""};
	}

    // Check if the expiration tag is set
    const expirationTag = authevent.tags.find(tag => tag[0] === "expiration");
    if (!expirationTag) {
        logger.warn(`RES -> 400 Bad request - Auth header event expiration tag is not set | ${req.socket.remoteAddress}`);
        return {status: "error", message: "Auth header event expiration tag is not set", authkey: "", pubkey: ""};
    }

    // Check if expiration tag is a unix timestamp
    const expiration = +expirationTag[1];
    if (isNaN(expiration)) {
        logger.warn(`RES -> 400 Bad request - Auth header event expiration tag is not a unix timestamp | ${req.socket.remoteAddress}`);
        return {status: "error", message: "Auth header event expiration tag is not a unix timestamp", authkey: "", pubkey: ""};
    }

    // Event endpoint
	const endpointTag = authevent.tags.find(tag => tag[0] === "t");
	let eventEndpoint = endpointTag ? endpointTag[1] : null;

	// Check if event authorization u tag (URL) is valid (Must be the same as the server endpoint)
	try {
		const ServerEndpoint = `${req.url}`;
		if (app.get('config.environment') == "development") {
			logger.warn("DEVMODE: Setting 't'(endpoint) tag same as the endpoint URL", "|", req.socket.remoteAddress);
			eventEndpoint = ServerEndpoint;
		} 
		if (eventEndpoint == null || eventEndpoint == undefined || eventEndpoint != ServerEndpoint) {
			logger.warn("RES -> 400 Bad request - Auth header event endpoint is not valid", eventEndpoint, "<>", ServerEndpoint,	"|", req.socket.remoteAddress);
			return {status: "error", message: `Auth header event endpoint is not valid: ${eventEndpoint} <> ${ServerEndpoint}`, authkey: "", pubkey: ""};
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		return {status: "error", message: "Auth header event endpoint is not valid", authkey: "", pubkey: ""};
	}

    // This is not from BUD01 spec, but some server endpoints require admin privileges
	if (checkAdminPrivileges) {
		const isPubkeyAdmin = await dbSelect("SELECT allowed FROM registered WHERE hex = ?", "allowed", [authevent.pubkey]) as string;
		if (isPubkeyAdmin === "0") {
			logger.warn("RES -> 403 forbidden - Pubkey does not have admin privileges", "|", req.socket.remoteAddress);
			return {status: "error", message: "This pubkey does not have admin privileges", pubkey: authevent.pubkey, authkey: ""};
		}
	}

    return {status: "success", message: "Auth header is valid", authkey: "", pubkey: authevent.pubkey};
}

export { isBUD01AuthValid };