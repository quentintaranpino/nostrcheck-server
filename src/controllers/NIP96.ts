import { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { GetNIP96file } from "../lib/nostr/NIP96.js";

const NIP96Data = async (req: Request, res: Response): Promise<Response> => {

    logger.info("REQ nip96.json ->", req.hostname, "|", req.headers['x-forwarded-for']);

	return res.status(200).send(JSON.stringify(GetNIP96file(req.hostname)));

    };

export { NIP96Data };


