import { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import app from "../app.js";
import { initPlugins, listPlugins } from "../lib/plugins/core.js";
import { parseAuthHeader } from "../lib/authorization.js";
import { setAuthCookie } from "../lib/frontend.js";
import { isIpAllowed } from "../lib/security/ips.js";
import { isModuleEnabled } from "../lib/config/core.js";

const getPlugins = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`getPlugins - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    if (!isModuleEnabled("plugins")) {
        logger.info(`getPlugins - Attempt to access a non-active module: plugins | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

	const eventHeader = await parseAuthHeader(req,"getPlugins", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    logger.info(`getPlugins - Request from:`, reqInfo.ip);

    const plugins = listPlugins(app);
    const result = {
        "status": "success",
        "plugins": plugins
    };

    logger.info(`getPlugins - Response:`, plugins.join(", "), "|", reqInfo.ip);
    return res.status(200).send(result);
}

const reloadPlugins = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`reloadPlugins - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    if (!isModuleEnabled("plugins")) {
        logger.info(`reloadPlugins - Attempt to access a non-active module: plugins | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

	const eventHeader = await parseAuthHeader(req,"reloadPlugins", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    logger.info(`reloadPlugins - Request from:`, reqInfo.ip);

    const init = await initPlugins(app);
    if (!init) {
        const result = {
            "status": "error",
            "message": "Error reloading plugins",
        };
        return res.status(500).send(result);
    }

    const result = {
        "status": "success",
        "message": "Plugins reloaded"
    };
    
    logger.info(`reloadPlugins - Response:`, result.message, "|", reqInfo.ip);
    return res.status(200).send(result);

}

export { getPlugins, reloadPlugins };