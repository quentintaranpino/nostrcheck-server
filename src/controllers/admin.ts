
import { Request, Response } from "express";
import fs from "fs";
import sharp from "sharp";

import app from "../app.js";
import { getLogHistory, logger } from "../lib/logger.js";
import { format, getCPUUsage, getNewDate } from "../lib/utils.js";
import { ResultMessagev2, ServerStatusMessage } from "../interfaces/server.js";
import { generatePassword } from "../lib/authorization.js";
import { dbDelete, dbInsert, dbMultiSelect, dbUpdate } from "../lib/database.js";
import { allowedFieldNames, allowedFieldNamesAndValues, allowedTableNames, moduleDataReturnMessage, moduleDataKeys, moduleDataIndex } from "../interfaces/admin.js";
import { parseAuthHeader} from "../lib/authorization.js";
import { isModuleEnabled, updateLocalConfigKey } from "../lib/config/local.js";
import { getFileMimeType } from "../lib/media.js";
import { npubToHex } from "../lib/nostr/NIP19.js";
import { dbCountModuleData, dbCountMonthModuleData, dbSelectModuleData } from "../lib/admin.js";
import { getBalance, getUnpaidTransactionsBalance } from "../lib/payments/core.js";
import { themes } from "../interfaces/personalization.js";
import { getModerationQueueLength, moderateFile } from "../lib/moderation/core.js";
import { addNewUsername } from "../lib/register.js";
import { banEntity, unbanEntity } from "../lib/security/banned.js";
import { generateInviteCode } from "../lib/invitations.js";
import { setAuthCookie } from "../lib/frontend.js";
import { deleteFile } from "../lib/storage/core.js";
import { isIpAllowed } from "../lib/security/ips.js";
import { eventStore } from "../interfaces/relay.js";
import { getEventById } from "../lib/relay/utils.js";
import { RedisService } from "../lib/redis.js";

const redisCore = app.get("redisCore") as RedisService

let hits = 0;
/**
 * Retrieves the server status.
 * 
 * @param req - The request object.
 * @param res - The response object.
 * @returns A promise that resolves to the server status response.
 */
const serverStatus = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`ServerStatus - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("ServerStatus - Attempt to access a non-active module:","admin","|","IP:", reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req,"StopServer", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

	const result: ServerStatusMessage = {
        status: "success",
        message: "Nostrcheck-server is running.",
		version: process.env.npm_package_version || "0.0.0",
		uptime: format(process.uptime()), 
        ramUsage: Math.floor(process.memoryUsage().rss / 1024 / 1024),
        cpuUsage: await getCPUUsage(),
        moderationQueue: getModerationQueueLength(),
	};

    hits++;
    if (hits % 100 == 0) logger.debug(`ServerStatus - ${hits} hits`);

	return res.status(200).send(result);
};


/**
 * Stops the server.
 * 
 * @param req - The request object.
 * @param res - The response object.
 * @returns A promise that resolves to the response object.
 */
const StopServer = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`StopServer - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("StopServer - Attempt to access a non-active module:","admin","|","IP:", reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.warn("StopServer - Stop server request from IP:", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');
    
    // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req,"StopServer", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    logger.warn("StopServer - Stopping server...");

    const result : ResultMessagev2 = {
        status: "success",
        message: "Stopping server...",
        };
    res.status(200).json(result);
    process.exit(0);
};

/**
 * Updates a record in the database.
 * 
 * @param req - The request object.
 * @param res - The response object.
 * @returns A promise that resolves to the response object.
 */
const updateDBRecord = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`updateDBRecord - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("updateDBRecord - Attempt to access a non-active module:","admin","|","IP:", reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.debug(`updateDBRecord - ${req.method} ${req.path}`, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');

     // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "updateDBRecord", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    
    // Check if the request has the required parameters
     if (!req.body.table || !req.body.field || req.body.value === undefined || req.body.value === null || !req.body.id) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error(`updateDBRecord - Invalid parameters`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    // Don't show the user the real table names
    const table = moduleDataKeys[req.body.table];
	if (!table) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table name"
            };
        logger.warn(`updateDBRecord - Invalid table name`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    logger.info(`updateDBRecord - Updating ${req.body.table} record with id ${req.body.id} and field ${req.body.field} to ${req.body.value}`);

    // Check if the provided table name and field name are allowed.
    if (!allowedTableNames.includes(table) || 
        !allowedFieldNamesAndValues.some(e => e.field === req.body.field) ||
        !allowedFieldNames.includes(req.body.field)     
        ){
            const result : ResultMessagev2 = {
                status: "error",
                message: "Invalid table name or field name"
            };
            logger.warn(`updateDBRecord - Invalid table name or field name`, "|", reqInfo.ip);
            return res.status(400).send(result);
    }

    // Check if the provided value is empty
    if (req.body.value === "" && req.body.field != "comments" || req.body.value === null || req.body.value === undefined){
        
        const result : ResultMessagev2 = {
            status: "error",
            message: req.body.field + " cannot be empty.",
            };
        logger.warn(`updateDBRecord - ${req.body.field} cannot be empty`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    // Check if we're updating a Redis index field
    const redisTableIndex = moduleDataIndex[req.body.table];
    if (redisTableIndex && req.body.field === redisTableIndex) {
        const currentFieldResult = await dbMultiSelect([redisTableIndex], table, "id = ?", [req.body.id]);
        if (currentFieldResult.length > 0) {
            const currentFieldValue = currentFieldResult[0][redisTableIndex];
            if (currentFieldValue) {
                await redisCore.del(`${table}:${currentFieldValue}`);
            }
        }
    }

    // Update table with new value
    const update = await dbUpdate(table, { [req.body.field]: req.body.value }, ["id"], [req.body.id]);
    if (update) {

        // Create redis key if necessary
        if (redisTableIndex && req.body.field === redisTableIndex) {
            await redisCore.set(`${table}:${req.body.value}`, req.body.id.toString());
        }

        const result : ResultMessagev2 = {
            status: "success",
            message: req.body.value,
            };
        logger.info(`updateDBRecord - Record updated successfully: ${req.body.field} set to ${req.body.value}`, "|", reqInfo.ip);
        return res.status(200).send(result);
    } else {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Failed to update record"
            };
        logger.error(`updateDBRecord - Failed to update record`, "|", reqInfo.ip);
        return res.status(500).send(result);
    }
}

const updateLogo = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`updateLogo - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn(`updateLogo - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`updateLogo - ${req.method} ${req.path}`, "|", reqInfo.ip);

     // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "updateDBRecord", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    const theme = req.body.theme || "light";

    let file: Express.Multer.File | null = null;
	if (Array.isArray(req.files) && req.files.length > 0) {
		file = req.files[0];
	}

    if (!req.files || req.files == undefined || req.files.length == 0 || !file) {
        try {
            await fs.promises.copyFile(`./src/pages/static/resources/navbar-logo-${theme}.default.png`, `./src/pages/static/resources/navbar-logo-${theme}.png`);
            logger.info(`updateLogo - Default logo restored successfully`, "|", reqInfo.ip);
            return res.status(200).send({status: "success", message: "Default logo restored"});
        } catch (error) {
            logger.error(`updateLogo - Failed to restore default logo`, "|", reqInfo.ip);
            return res.status(500).send({status: "error", message: "Failed to restore default logo"});
        }
    }

	if (await getFileMimeType(req, file) == "") {
		logger.error(`updateLogo - 400 Bad request - `, file.mimetype, ` filetype not detected`, "|", reqInfo.ip);
		return res.status(400).send({"status": "error", "message": "file type not detected or not allowed"});
	}

    await sharp(file.buffer)
        .resize(180, 61, { fit: sharp.fit.contain, background: { r: 0, g: 0, b: 0, alpha: 0 } }) 
        .png({ quality: 95 })
        .toBuffer()
        .then(async data => { 
            await fs.promises.writeFile(`./src/pages/static/resources/navbar-logo-${theme}.png`, data);
            logger.info(`updateLogo - Logo updated successfully`, "|", reqInfo.ip);
        })
        .catch(err => { 
            logger.error(`updateLogo - Error updating logo`, "|", err);
            return res.status(500).send({"status": "error", "message": "Error updating logo"});
        });

     return res.status(200).send({"status": "success", "message": "Logo updated"});

}

const updateRelayIcon = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`updateRelayIcon - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn(`updateRelayIcon - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`updateRelayIcon - ${req.method} ${req.path}`, "|", reqInfo.ip);

     // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "updateDBRecord", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    let file: Express.Multer.File | null = null;
	if (Array.isArray(req.files) && req.files.length > 0) {
		file = req.files[0];
	}

    if (!req.files || req.files == undefined || req.files.length == 0 || !file) {
        try {
            await fs.promises.copyFile(`./src/pages/static/resources/relay-icon.default.png`, `./src/pages/static/resources/relay-icon.png`);
            logger.info(`updateRelayIcon - Default relay icon restored successfully`, "|", reqInfo.ip);
            return res.status(200).send({status: "success", message: "Default relay icon restored"});
        } catch (error) {
            logger.error(`updateRelayIcon - Failed to restore default relay icon`, "|", reqInfo.ip);
            return res.status(500).send({status: "error", message: "Failed to restore default relay icon"});
        }
    }

	if (await getFileMimeType(req, file) == "") {
		logger.error(`updateRelayIcon - 400 Bad request - `, file.mimetype, ` filetype not detected`, "|", reqInfo.ip);
		return res.status(400).send({"status": "error", "message": "file type not detected or not allowed"});
	}

    await sharp(file.buffer)
        .resize(200, 200, { fit: sharp.fit.contain, background: { r: 0, g: 0, b: 0, alpha: 0 } }) 
        .png({ quality: 95 })
        .toBuffer()
        .then(async data => { 
            await fs.promises.writeFile(`./src/pages/static/resources/relay-icon.png`, data);
            logger.info(`updateRelayIcon - Relay icon updated successfully`, "|", reqInfo.ip);
        })
        .catch(err => { 
            logger.error(`updateRelayIcon - Error updating relay icon`, "|", err);
            return res.status(500).send({"status": "error", "message": "Error updating relay icon"});
        });

     return res.status(200).send({"status": "success", "message": "Relay icon updated"});

}

const updateTheme = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`updateTheme - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn(`updateTheme - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`updateTheme - ${req.method} ${req.path}`, "|", reqInfo.ip);

     // Check if authorization header is valid
    const eventHeader = await parseAuthHeader(req, "updateDBRecord", true, true, true);
    if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    if (!req.body || req.body == undefined || req.body.length == 0) {
        logger.error(`updateTheme - Empty body`, "|", reqInfo.ip);
        return res.status(400).send({"status": "error", "message": "Empty body"});
    }

    let primaryColor = req.body.color1 || null;
    let secondaryColor = req.body.color2 || null;
    let tertiaryColor = req.body.color3 || null;
    let orientation = req.body.orientation || "to right";
    let primaryColorPercent = req.body.color1Percent || "0%";
    let secondaryColorPercent = req.body.color2Percent || "50%";
    let tertiaryColorPercent = req.body.color3Percent || "100%";
    let particles = req.body.particles || null;

    if (primaryColor == null || secondaryColor == null || tertiaryColor == null) {

        // Load default theme
        const theme = themes["essence"];
        primaryColor = theme.color1;
        secondaryColor = theme.color2;
        tertiaryColor = theme.color3;
        orientation = theme.orientation;
        primaryColorPercent = theme.color1Percent;
        secondaryColorPercent = theme.color2Percent;
        tertiaryColorPercent = theme.color3Percent;
        particles = null;

    }

    const theme = `
        :root {
            --primary-color: ${primaryColor};
            --secondary-color: ${secondaryColor};
            --tertiary-color: ${tertiaryColor};
            --primary-color-percent: ${primaryColorPercent};
            --secondary-color-percent: ${secondaryColorPercent};
            --tertiary-color-percent: ${tertiaryColorPercent};
            --gradient-orientation: ${orientation};
            --particles: ${particles};
        }

        .background-theme {
            background-image: -webkit-linear-gradient(var(--gradient-orientation), var(--primary-color) var(--primary-color-percent), var(--secondary-color) var(--secondary-color-percent), var(--tertiary-color) var(--tertiary-color-percent));
            background-image: linear-gradient(var(--gradient-orientation), var(--primary-color) var(--primary-color-percent), var(--secondary-color) var(--secondary-color-percent), var(--tertiary-color) var(--tertiary-color-percent));
            background-repeat: no-repeat;
            background-size: cover;
            background-attachment: fixed;
            particles: var(--particles);
        }
        `;

    try{
        await fs.promises.writeFile('./src/pages/static/css/theme.css', theme);
        logger.info(`updateTheme - Theme updated successfully`, "|", reqInfo.ip);
        return res.status(200).send({status: "success", message: "Theme updated"});
    }catch(e){
        logger.error(`updateTheme - Error updating theme`, "|", reqInfo.ip);
        return res.status(500).send({status: "error", message: "Error updating theme"});
    }

}

/**
 * Resets the password for a user.
 * 
 * @param req - The request object.
 * @param res - The response object.
 * @returns A promise that resolves to the response object.
 */
const resetUserPassword = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`resetUserPassword - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn(`resetUserPassword - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }
   
    logger.info(`resetUserPassword - ${req.method} ${req.path}`, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');
    
     // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "resetUserPassword", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    // Check if the request has the required parameters
    if (!req.body.pubkey) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error(`resetUserPassword - Invalid parameters`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    const newPass = await generatePassword(req.body.pubkey, false, true)
    if (newPass == "") {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Failed to generate new password"
            };
        logger.error(`resetUserPassword - Failed to generate new password`, "|", reqInfo.ip);
        return res.status(500).send(result);
    }

    const result : ResultMessagev2 = {
        status: "success",
        message: "New password generated for " + req.body.pubkey,
        };
    logger.info(`resetUserPassword - New password generated for ${req.body.pubkey} successfully`, "|", reqInfo.ip);
    return res.status(200).send(result);
   
};

/**
 * Deletes a record from the database.
 * 
 * @param req - The request object.
 * @param res - The response object.
 * @returns A Promise that resolves to the response object.
 */
const deleteDBRecord = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`deleteDBRecord - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn(`deleteDBRecord - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`deleteDBRecord - ${req.method} ${req.path}`, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');

     // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "deleteDBRecord", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    // Check if the request has the required parameters
    if (!req.body.table || !req.body.id) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error(`deleteDBRecord - Invalid parameters`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

      // Verify that table is a string
      if (typeof req.body.table !== 'string') {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table parameter"
        };
        logger.error(`deleteDBRecord - Invalid table parameter`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    // Verify that id is a number
    if (typeof req.body.id !== 'number') {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid id parameter"
        };
        logger.error(`deleteDBRecord - Invalid id parameter`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    // Don't show the user the real table names
    const table = moduleDataKeys[req.body.table];
	if (!table) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table name"
            };
        logger.warn(`deleteDBRecord - Invalid table name`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    // Check if the provided table name is allowed.
    if (!allowedTableNames.includes(table)){
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table name"
        };
        logger.warn(`deleteDBRecord - Invalid table name`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    // Special case for mediafiles table
    if (table == "mediafiles") {
        let fileName = await dbMultiSelect(["filename"], "mediafiles", "id = ?", [req.body.id]);
        fileName = await dbMultiSelect(["filename"], "mediafiles", "filename = ?", [fileName[0].filename], false);
        if (fileName.length == 0) {
            const result : ResultMessagev2 = {
                status: "error",
                message: "Failed to delete record",
            };
            logger.warn(`deleteDBRecord - Failed to delete record`, "|", reqInfo.ip);
            return res.status(400).send(result);
        }
        
        // Only delete the file if there is only one record with the same filename
        if (fileName.length == 1) {
            const delFile = await deleteFile(fileName[0].filename);
            if (!delFile) {
                const result : ResultMessagev2 = {
                    status: "error",
                    message: "Failed to delete record"
                };
                logger.error(`deleteDBRecord - Failed to delete record`, "|", reqInfo.ip);
                return res.status(500).send(result);
            }
        }
    }

    // Special case for relay events, must be deleted from the relay sharedDB
    if (table == "events") {
        const eventData = await dbMultiSelect(["event_id"], "events", "id = ?", [req.body.id]);
        if (eventData.length == 0) {
            const result : ResultMessagev2 = {
                status: "error",
                message: "Failed to delete record"
            };
            logger.warn(`deleteDBRecord - Failed to delete record`, "|", reqInfo.ip);
            return res.status(400).send(result);
        }
        const eventId = eventData[0].event_id;
        const indexEntry = eventStore.eventIndex.get(eventId);
        if (indexEntry) {
            if (indexEntry) {
                const event = await getEventById(eventId, eventStore);
                if (event) {
                    eventStore.pendingDelete.set(eventId, event);
                    logger.info(`Added event ${eventId} to pendingDelete for cleanup`);
                }
                
                eventStore.eventIndex.delete(eventId);
            }
        }
    }

    // Check Redis cache for the record.
    const redisTableIndex = moduleDataIndex[req.body.table]
    if (redisTableIndex) {
        const result = await dbMultiSelect([redisTableIndex], table, "id = ?", [req.body.id]);
        const indexValue = result[0]?.[redisTableIndex];
        if (indexValue) {
            await redisCore.del(`${table}:${indexValue}`);
        }
    }

    // Special case for ips table
    if (table == "ips") {
        const ip = await dbMultiSelect(["ip"], table, "id = ?", [req.body.id]);
        const redisKeyIp = `ips:${ip[0].ip}`;
        const redisKeyIpWindow = `ips:window:${ip[0].ip}`;
        await redisCore.del(redisKeyIp);
        await redisCore.del(redisKeyIpWindow);
    }

    // Unban the record if it was banned and delete it from banned redis cache.
    await unbanEntity(req.body.id, table);

    // Delete record from table
    const deletedRecord = await dbDelete(table, ['id'], [req.body.id]);
    if(deletedRecord){
        const result : ResultMessagev2 = {
            status: "success",
            message: "Record deleted succesfully",
            };
        logger.info(`deleteDBRecord -  Record deleted succesfully: ${req.body.table} | ${req.body.id} | ${reqInfo.ip}`);
        return res.status(200).send(result);
    } else {
        
        const result : ResultMessagev2 = {
            status: "error",
            message: "Failed to delete record",
            };
        logger.error(`deleteDBRecord - Failed to delete record: ${req.body.table} | ${req.body.id} | ${reqInfo.ip}`);
        return res.status(500).send(result);
    }
}

   
/**
 * Inserts a record into the database.
 * 
 * @param req - The request object.
 * @param res - The response object.
 * @returns A promise that resolves to the response object.
 */
const insertDBRecord = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`insertDBRecord - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn(`insertDBRecord - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`insertDBRecord - ${req.method} ${req.path}`, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');

     // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "insertDBRecord", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    // Check if the request has the required parameters
    if (!req.body.table || !req.body.row) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error(`insertDBRecord - Invalid parameters`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    // Don't show the user the real table names
    const table = moduleDataKeys[req.body.table];
	if (!table) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table name"
            };
        logger.warn(`insertDBRecord - Invalid table name`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    let errorFound = false;
    await Object.entries(req.body.row).forEach(([field, value]) => {
        if (field == "id" || field == "date" || field == "comments"){return;}
        if (!allowedTableNames.includes(table) || 
            !allowedFieldNamesAndValues.some(e => e.field === field) ||
            !allowedFieldNames.includes(field)     
            ){
                logger.warn(`insertDBRecord - Invalid table name: ${table} or field name: ${field} | ${reqInfo.ip}`);
                errorFound = true;
        }

        // Check if the provided value is empty
        if (value === ""){
            logger.warn(`insertDBRecord - ${field} cannot be empty | ${reqInfo.ip}`);
            errorFound = true;
        }
        
    });

    if (errorFound){
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table name or field name"
        };
        return res.status(400).send(result);
    }

    // Remove id from row object
    delete req.body.row["id"];

    // Specific case for registered table
    if (req.body.table == "registeredData"){
        if (await npubToHex(req.body.row["pubkey"]) != req.body.row["hex"]){

            const result : ResultMessagev2 = {
                status: "error",
                message: "Invalid npub / hex",
                };
            logger.error(`insertDBRecord - Invalid npub / hex : ${req.body.row["pubkey"]} / ${req.body.row["hex"]} | ${reqInfo.ip}`);
            return res.status(400).send(result);
        }
    }

    // Specific case for invitations table
    if (req.body.table == "invitesData"){
        req.body.row["createdate"] = getNewDate();
        req.body.row["code"] = generateInviteCode();
    }

    // Insert records into the table
    let insert : number = 0;
    if (req.body.table == "registeredData"){
        insert = await addNewUsername(req.body.row["username"], req.body.row["hex"], req.body.row["password"], req.body.row["domain"], req.body.row["comments"], true, "", false, false, req.body.row["allowed"]);
    }else{
        insert = await dbInsert(table, Object.keys(req.body.row), Object.values(req.body.row));
    }

    if (insert === 0) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Failed to insert records",
            };
        logger.error(`insertDBRecord - Failed to insert records | ${reqInfo.ip}`);
        return res.status(500).send(result);
    }

    // Update redis cache
    const redisTableIndex = moduleDataIndex[req.body.table];
    if (redisTableIndex && req.body.row[redisTableIndex]) {
        const indexValue = req.body.row[redisTableIndex];
        await redisCore.set(`${table}:${indexValue}`, insert.toString());
    }

    const result : ResultMessagev2 = {
        status: "success",
        message: insert.toString(),
        };

    logger.info(`insertDBRecord - Record inserted succesfully: ${req.body.table} | ${insert} | ${reqInfo.ip}`);
    return res.status(200).send(result);
}


/**
 * Updates the settings of the server.
 * 
 * @param req - The request object with the new settings on the body. (name and value)
 * @param res - The response object with the result of the operation.
 * @returns A promise that resolves to the response object.
 */
const updateSettings = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`updateSettings - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn(`updateSettings - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`updateSettings - ${req.method} ${req.path}`, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');

     // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "updateSettings", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    if (req.body.name === "" || req.body.name === null || req.body.name === undefined) {
        const result: ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters",
        }
        logger.error(`updateSettings - Invalid parameters`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    const updated = await updateLocalConfigKey(req.body.name, req.body.value);
    if (!updated) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Failed to update settings.",
            };
        logger.error(`updateSettings - Failed to update settings`, "|", reqInfo.ip);
        return res.status(500).send(result);
    }

    const parts = req.body.name.includes('.') ? req.body.name.split('.') : [req.body.name];
    const mainConfigName = req.body.name.includes('.') ? `config.${parts.shift()}` : `config.${req.body.name}`;
    if (app.get(mainConfigName) === undefined) {
        logger.error(`updateSettings - Config field not found: ${mainConfigName} | ${reqInfo.ip}`);
        return res.status(500).send({"status":"error", "message":`Config field not found: ${mainConfigName}`});
    }
    const configField = parts.length > 0 ? parts.pop() : req.body.name;
    const rootConfig = JSON.parse(JSON.stringify(app.get(mainConfigName))); // Deep copy
    let currentConfig = rootConfig;
    
    for (const part of parts) {
        if (currentConfig[part] === undefined) {
            logger.error(`updateSettings - Config field not found: ${part} | ${reqInfo.ip}`);
            return res.status(500).send({"status":"error", "message":`Config field not found: ${part}`});
        }
        currentConfig = currentConfig[part];
    }
    
    if (typeof currentConfig === 'object') {
        currentConfig[configField] = req.body.value;
        app.set(mainConfigName, rootConfig);
    } else {
        app.set(mainConfigName, req.body.value);
    }

    // If the setting is expireTime from redis we flush redis cache
    if (req.body.name == "redis.expireTime") {
        const flushResult = await redisCore.flushAll();
        if (flushResult)logger.info(`updateSettings - Redis cache flushed`, "|", reqInfo.ip);
    }

    const result : ResultMessagev2 = {
        status: "success",
        message: "Succesfully updated settings.",
        };

    logger.info(`updateSettings - Updated settings succesfully`, "|", reqInfo.ip);
    return res.status(200).send(result);
    
}

const getModuleData = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`getModuleData - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn(`getModuleData - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`getModuleData - ${req.method} ${req.path}`, "|", reqInfo.ip);

    // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "updateSettings", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);  

    // Check if the request has the required parameters
    if (!req.query.module) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error(`getModuleData - Invalid parameters`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    const module : string = req.query.module as string;
    const offset = Number(req.query.offset);
    const limit = Number(req.query.limit);
    const order = req.query.order as string;
    const search = req.query.search as string;
    const sort = req.query.sort as string;
    const filter = req.query.filter as string;

    let filterObject = {};  
    if (filter!=undefined && filter!=null && filter!="") {
        try{
            filterObject = Object.entries(JSON.parse(filter)).map(([key, value]) => ({
                field: key,
                value: typeof value === 'string' ? value : JSON.stringify(value)
            }));
        }catch(e){
            logger.error(`getModuleData - Invalid filter`, "|", reqInfo.ip);
            return res.status(400).send({"status": "error", "message": "Invalid filter"});
        }
    }

    logger.debug("module, offset, limit, order, search, sort, filter) : ", module, offset, limit, order, search, sort, filterObject);
 
    const data = module === "logs" ? await getLogHistory(offset, limit, order, sort, search, filterObject) : await dbSelectModuleData(module,offset,limit,order,sort,search,filterObject);
                                                                                                         
    const returnMessage : moduleDataReturnMessage = {
        total: data.total,
        totalNotFiltered: data.totalNotFiltered,
        rows: data.rows }

    logger.info(`getModuleData - Data retrieved succesfully`, "|", reqInfo.ip);
    return res.status(200).send(returnMessage);

}

const getModuleCountData = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`getModuleCountData - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }
    
    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn(`getModuleCountData - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`getModuleCountData - ${req.method} ${req.path}`, "|", reqInfo.ip);

    // Check if authorization header is valid
    const eventHeader = await parseAuthHeader(req, "updateSettings", true, true, true);
    if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);  

    // Check if the request has the required parameters
    if (!req.query.module || !req.query.action) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error(`getModuleCountData - Invalid parameters`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    const module : string = req.query.module as string;
    const action : string = req.query.action as string;
    const field : string = req.query.field as string;

    if (module == "payments" && action == "serverBalance") {
        const data =  await getBalance(1000);
        return res.status(200).send({total: data, field: data});
    }
    if (module == "payments" && action == "unpaidTransactions") {
        const data = await getUnpaidTransactionsBalance();
        return res.status(200).send({total: data, field: data});
    }
    if (module == "logger" && action == "countWarning") {
        const logHistory = await getLogHistory(0, 0, "DESC", "date", "", [{ field: "severity", value: ["warn", "error"] }]);
        return res.status(200).send({total: logHistory.total, field: logHistory.total});
    }
    if (module == "relay" && action == "countSynced") {
        return res.status(200).send({total: await dbCountModuleData(module), field: (eventStore?.eventIndex?.size - eventStore?.pending?.size - eventStore?.pendingDelete?.size)  | 0});
    }

    if (action == "monthCount") {
        const count = await dbCountMonthModuleData(module, field);
        return res.status(200).send({data: count});
    }

    if (field != "" && field != undefined && field != 'undefined') {
        const countField = await dbCountModuleData(module, field);
        const countTotal = await dbCountModuleData(module);
        return res.status(200).send({total: countTotal, field: countField});
    }
    
    logger.info(`getModuleCountData - Data retrieved succesfully`, "|", reqInfo.ip);
    return res.status(200).send({total: 0, field: 0});
}

const moderateDBRecord = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`moderateDBRecord - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }
  
    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn(`moderateDBRecord - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    // Check if authorization header is valid
    const eventHeader = await parseAuthHeader(req, "moderateDBRecord", true, true, true);
    if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    if (req.body.id === "" || req.body.id === null ||  req.body.id === undefined || 
        req.body.filename === "" || req.body.filename === null || req.body.filename === undefined ||
        req.body.table === "" || req.body.table === null || req.body.table === undefined) {
        const result: ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters",
        }
        return res.status(400).send(result);
    }

    // Don't show the user the real table names
    const table = moduleDataKeys[req.body.table];
    if (!table) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table name"
            };
        logger.warn(`updateDBRecord - Invalid table name`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    logger.info(`moderateDBRecord - ${req.method} ${req.path}`, "|", reqInfo.ip, "|", req.body.id, "|", req.body.filename);

    await moderateFile(table, req.body.id);

    return res.status(200).send({status: "success", message: "Moderation request sent"});

}

const banDBRecord = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`banDBRecord - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn(`banDBRecord - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    // Check if authorization header is valid
    const eventHeader = await parseAuthHeader(req, "banDBRecord", true, true, true);
    if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);
    
    if (req.body.id === "" || 
        req.body.id === null || 
        req.body.id === undefined || 
        req.body.table === "" ||
        req.body.table === null ||
        req.body.table === undefined) {
            const result: ResultMessagev2 = {
                status: "error",
                message: "Invalid parameters",
            }
        return res.status(400).send(result);
    }

    logger.info(`banDBRecord - ${req.method} ${req.path}`, "|", reqInfo.ip, "|", req.body.id, "|", req.body.table);

    if (req.body.reason === "" || req.body.reason === null || req.body.reason === undefined) {
        const result: ResultMessagev2 = {
            status: "error",
            message: "Reason cannot be empty",
        }
        return res.status(400).send(result);
    }

    // Don't show the user the real table names
    const table = moduleDataKeys[req.body.table];
	if (!table) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table name"
            };
        logger.error(`banDBRecord - Invalid table name`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    const banResult = await banEntity(req.body.id, table, req.body.reason);

    if (banResult.status == "error") {
        logger.error(`banDBRecord - Failed to ban record`, "|", reqInfo.ip);
        return res.status(500).send({status: "error", message: banResult.message});
    }

    logger.info(`banDBRecord - Record banned succesfully`, "|", reqInfo.ip);
    return res.status(200).send({status: "success", message: banResult.message});
        
}

export {    serverStatus, 
            StopServer, 
            resetUserPassword, 
            updateDBRecord, 
            deleteDBRecord, 
            insertDBRecord, 
            moderateDBRecord,
            updateSettings, 
            updateLogo,
            updateTheme,
            getModuleData,
            getModuleCountData,
            banDBRecord,
            updateRelayIcon   
        };