
import { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { getClientIp, IsAuthorized, format } from "../lib/server.js";
import { ResultMessagev2, ServerStatusMessage } from "../interfaces/server.js";
import config from "config";

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

    res.status(200).json({ message: "Stopping server..." });
    logger.warn("Stopping server from API endpoint");
    process.exit(0);
};

const adminLogin = async (req: Request): Promise<boolean> => {

    //Check if default admin credentials are used
    if (req.body.username == "admin" && req.body.password == "admin"){
        //We refuse to login with default credentials
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
        logger.warn("Default admin credentials used to login. Refusing.");
       return false;
    }

    //Check if credentials are correct
    if (req.body.username == config.get('server.admin.username') && req.body.password == config.get('server.admin.password')){
        req.session.username = config.get('server.admin.username');
        if (req.body.rememberme == "true"){req.session.cookie.maxAge = config.get('session.maxAge');}
        logger.info("logged in as", req.session.username, " - ", getClientIp(req));
        return true;
    }

    //Credentials are incorrect
    logger.warn("WARNING - Incorrect admin credentials used to login. Refusing.");
    return false;

};

export { ServerStatus, StopServer, adminLogin };

