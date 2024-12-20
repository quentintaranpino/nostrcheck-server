import { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { getClientIp } from "../lib/utils.js";
import app from "../app.js";
import { isModuleEnabled } from "../lib/config.js";
import { initPlugins, listPlugins } from "../lib/plugins/core.js";
import { parseAuthHeader } from "../lib/authorization.js";
import { setAuthCookie } from "../lib/frontend.js";

const getPlugins = async (req: Request, res: Response): Promise<Response> => {

    if (!isModuleEnabled("plugins", app)) {
        logger.warn("Attempt to access a non-active module:","plugins","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

	const eventHeader = await parseAuthHeader(req,"getPlugins", true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    const plugins = listPlugins(app);
    const result = {
        "status": "success",
        "plugins": plugins
    };

    return res.status(200).send(result);
}

const reloadPlugins = async (req: Request, res: Response): Promise<Response> => {

    if (!isModuleEnabled("plugins", app)) {
        logger.warn("Attempt to access a non-active module:","plugins","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

	const eventHeader = await parseAuthHeader(req,"reloadPlugins", true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

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
    
    return res.status(200).send(result);

}

export { getPlugins, reloadPlugins };