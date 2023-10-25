import { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { getNIP96file } from "../lib/nostr/NIP96.js";
import { getClientIp } from "../lib/server.js";

const NIP96Data = async (req: Request, res: Response): Promise<Response> => {

    logger.info("REQ nip96.json ->", req.hostname, "|", getClientIp(req));

    res.setHeader('Content-Type', 'application/json');
	return res.status(200).send(JSON.stringify(getNIP96file(req.hostname)));

    };

export { NIP96Data };


