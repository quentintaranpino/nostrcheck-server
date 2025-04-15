import { isIpAllowed } from "../lib/security/ips.js";
import { Request, Response } from 'express';
import { logger } from "../lib/logger.js";
import { parseAuthHeader } from "../lib/authorization.js";
import { setAuthCookie } from "../lib/frontend.js";
import { userPrefs } from "../interfaces/appearance.js";
import { dbMultiSelect, dbUpsert } from "../lib/database.js";
import { getNewDate } from "../lib/utils.js";
import { isModuleEnabled } from "../lib/config/core.js";

const setUserPrefs = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`setUserPrefs - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`setUserPrefs - Attempt to access a non-active module: frontend | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`setUserPrefs - Request from:`, req.hostname, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');

     // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "setUserPrefs", false, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    const prefs = req.body as userPrefs;
    if (typeof prefs !== "object")  return res.status(400).json({ status: "error", message: "Invalid preferences data" });
    
    const registered_ids = await dbMultiSelect(["id"], "registered", "hex = ?", [eventHeader.pubkey], false);
    for (const  i of registered_ids) {
        const upsert = await dbUpsert("userprefs", {registered_id: i.id, preferences: JSON.stringify(prefs), updated_at: getNewDate()}, ["registered_id"]);
        if (upsert == 0) return res.status(500).json({ status: "error", message: "Failed to update user preferences" });    
    }

    logger.info(`setUserPrefs - User preferences updated successfully: ${eventHeader.pubkey}`, reqInfo.ip);
    return res.status(200).send("User preferences updated");
}

const getUserPrefs = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`getUserPrefs - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`getUserPrefs - Attempt to access a non-active module: frontend | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`getUserPrefs - Request from:`, req.hostname, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');

    // Check if authorization header is valid
    const eventHeader = await parseAuthHeader(req, "getUserPrefs", false, true, true);
    if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    const registered_ids = await dbMultiSelect(["id"], "registered", "hex", [eventHeader.pubkey], false);
    if (registered_ids.length == 0) return res.status(404).json({ status: "error", message: "User not found" });

    const prefs = await dbMultiSelect(["preferences"], "userprefs", "registered_id", [registered_ids[0].id], false);
    if (prefs.length == 0) return res.status(404).json({ status: "error", message: "User preferences not found" });

    logger.info(`getUserPrefs - User preferences retrieved successfully: ${eventHeader.pubkey}`, reqInfo.ip);
    return res.status(200).json(JSON.parse(prefs[0].preferences));
}

export { setUserPrefs, getUserPrefs };