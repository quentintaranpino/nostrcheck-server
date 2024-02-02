import { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { getNIP96file } from "../lib/nostr/NIP96.js";
import { getClientIp } from "../lib/server.js";
import { sendMessage } from "../lib/nostr/NIP04.js";
import { ResultMessagev2 } from "../interfaces/server.js";

const NIP96Data = async (req: Request, res: Response): Promise<Response> => {

    logger.info("REQ nip96.json ->", req.hostname, "|", getClientIp(req));

    res.setHeader('Content-Type', 'application/json');
	return res.status(200).send(JSON.stringify(getNIP96file(req.hostname)));

    };

const sendNostrDM = async (req: Request, res: Response): Promise<Response> => {
   
    logger.info("REQ <- sendNostrDM ->", req.hostname, "|", getClientIp(req));
    logger.debug(req.params.pubkey, req.params.message);
    res.setHeader('Content-Type', 'application/json');
    
    if (!req.params.pubkey || !req.params.message) {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send("Invalid parameters");
    }

    //send DM to pubkey
    const result = await sendMessage( req.params.message,req.params.pubkey);
    if (result) {
        let result : ResultMessagev2 = {
            status: "success",
            message: "Message: " + req.params.message + " | Pubkey: " + req.params.pubkey + " | " + getClientIp(req)
            };
        logger.info("RES -> DM sent to " + req.params.pubkey);
        return res.status(200).send(result);
    } else {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Failed to send DM"
            };
        logger.error("Failed to send DM to " + req.params.pubkey);
        return res.status(500).send(result);
    }
};

export { NIP96Data, sendNostrDM };


