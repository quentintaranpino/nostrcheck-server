
import { Request, Response } from "express";
import config from "config";

import { logger } from "../lib/logger.js";
import { getClientIp, IsAuthorized, format } from "../lib/server.js";
import { ResultMessagev2, ServerStatusMessage } from "../interfaces/server.js";
import { verifyNIP07login } from "../lib/nostr/NIP07.js";

const ServerStatus = async (req: Request, res: Response): Promise<Response> => {
	logger.info("GET /api/v2/status", "|", getClientIp(req));

	const result: ServerStatusMessage = {
        status: "success",
        message: "Nostrcheck API server is running.",
		version: process.env.npm_package_version || "0.0.0",
		uptime: format(process.uptime()),
	};

	return res.status(200).send(result);
};

const StopServer = async (req: Request, res: Response): Promise<void> => {

    // Check if the request is authorized
    const Authorized: ResultMessagev2 = await IsAuthorized(req);
    if (Authorized.status === "error") {
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));

        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    logger.warn("RES -> 200 Stopping server from IP:", getClientIp(req));
    res.status(200).json({ message: "Stopping server..." });
    process.exit(0);
};

const adminLogin = async (req: Request, res: Response): Promise<Response> => {

    // Check if NIP07 credentials are correct
    if (req.body.pubkey != "" && req.body.pubkey == config.get('server.adminPanel.pubkey')){
        let result = await verifyNIP07login(req);
        if (!result){return res.status(401).send(false);}
        req.session.identifier = req.body.pubkey;
    }

    // Check if legacy credentials are correct
    if (req.body.password != "" && req.body.password == config.get('server.adminPanel.legacyPassword')){
        req.session.identifier = "legacyLogin";
    }

    // Check if we have a valid session
    if (req.session.identifier == null){
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
        logger.warn("Incorrect admin credentials used to login. Refusing", getClientIp(req));
        return res.status(401).send(false);
    }

    // Remember me logic
    if (req.body.rememberMe == "true"){req.session.cookie.maxAge = config.get('session.maxAge');}
    logger.info("logged in as", req.session.identifier, " - ", getClientIp(req));
    return res.status(200).send(true);

};

export { ServerStatus, StopServer, adminLogin };