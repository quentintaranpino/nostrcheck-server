
import { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { getClientIp, IsAuthorized, format } from "../lib/server.js";
import { ResultMessagev2, ServerStatusMessage } from "../interfaces/server.js";
import config from "config";
import { verifyEvent } from "../lib/verify.js";

const ServerStatus = async (req: Request, res: Response): Promise<Response> => {
	logger.info("GET /api/v1/status", "|", getClientIp(req));

	const result: ServerStatusMessage = {
        status: "success",
        message: "Nostrcheck API server is running.",
		version: process.env.npm_package_version || "0.0.0",
		uptime: format(process.uptime()),
	};

	return res.status(200).send(result);
};

// Stop server endpoint
const StopServer = async (req: Request, res: Response): Promise<void> => {

    // Check if the request is authorized
    const Authorized: ResultMessagev2 = await IsAuthorized(req);
    if (Authorized.status === "error") {
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));

        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    logger.info("RES -> 200 Stopping server from IP:", getClientIp(req));
    res.status(200).json({ message: "Stopping server..." });
    logger.warn("Stopping server from API endpoint");
    process.exit(0);
};

const adminLogin = async (req: Request, res: Response): Promise<Response> => {

    //NIP07 login
    if (req.body.pubkey != "" && req.body.pubkey == config.get('server.adminPanel.pubkey')){
        logger.info("Verifying login event attempt", req.body, " - ", getClientIp(req));
        if (await verifyEvent(req.body) !== 0){
            logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
            logger.warn("Detected an attempt to log in with invalid event. Refusing", getClientIp(req));
            return res.status(401).send(false);
            
        }

        //We check if created_at is not too old
        const diff =  (Math.floor(Date.now() / 1000) - req.body.created_at);
        logger.debug("Event is", diff, "seconds old");
        if (diff > 60){ //60 seconds max event age
            logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
            logger.warn("Detected an attempt to log in with an event that is too old. Refusing", getClientIp(req));
            return res.status(401).send(false);
        }

        req.session.pubkey = config.get('server.adminPanel.pubkey');
        if (req.body.rememberme == "true"){req.session.cookie.maxAge = config.get('session.maxAge');}
        logger.info("logged in as", req.session.pubkey, " - ", getClientIp(req));
        return res.status(200).send(true);
    }

    //We refuse to login with default or empty credentials
    if (req.body.password == ""){
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
        logger.warn("Default or empty admin legacy password used to login. Refusing.");
        return res.status(401).send(false);
    }

    //Check if legacy credentials are correct
    if (req.body.password != "" && req.body.password == config.get('server.adminPanel.legacyPassword')){
        req.session.pubkey = config.get('server.adminPanel.pubkey');
        if (req.body.rememberme == "true"){req.session.cookie.maxAge = config.get('session.maxAge');}
        logger.info("logged in as", req.session.pubkey, " - ", getClientIp(req));
        return res.status(200).send(true);
    }

    //Credentials are incorrect
    logger.warn("Incorrect admin credentials used to login. Refusing", getClientIp(req));
    return res.status(401).send(false);

};

export { ServerStatus, StopServer, adminLogin };

