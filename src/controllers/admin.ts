
import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import app from "../app.js";
import { getLogHistory, logger } from "../lib/logger.js";
import { format, getCPUUsage, getNewDate } from "../lib/utils.js";
import { ResultMessagev2, ServerStatusMessage } from "../interfaces/server.js";
import { generatePassword } from "../lib/authorization.js";
import { dbDelete, dbInsert, dbMultiSelect, dbUpdate } from "../lib/database.js";
import { allowedFieldNames, allowedFieldNamesAndValues, allowedTableNames, moduleDataReturnMessage, moduleDataKeys, moduleDataIndex } from "../interfaces/admin.js";
import { parseAuthHeader} from "../lib/authorization.js";
import { getFileMimeType } from "../lib/media.js";
import { npubToHex } from "../lib/nostr/NIP19.js";
import { dbCountModuleData, dbCountMonthModuleData, dbSelectModuleData } from "../lib/admin.js";
import { getBalance, getUnpaidTransactionsBalance } from "../lib/payments/core.js";
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
import { isModuleEnabled, setConfig } from "../lib/config/core.js";
import { acceptedSettigsFiles } from "../interfaces/appearance.js";

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
    if (!isModuleEnabled("admin")) {
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
    if (!isModuleEnabled("admin")) {
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
    if (!isModuleEnabled("admin")) {
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

/**
 * Handles upload or restore of custom file settings like logos and icons.
 */
const updateSettingsFile = async (req: Request, res: Response): Promise<Response> => {
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned) {
        logger.warn(`updateSettingsFile - Unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({ status: "error", message: reqInfo.comments });
    }

    if (!isModuleEnabled("admin")) {
        logger.warn(`updateSettingsFile - Admin module disabled | IP:`, reqInfo.ip);
        return res.status(403).send({ status: "error", message: "Module is not enabled" });
    }

    logger.info(`updateSettingsFile - ${req.method} ${req.path}`, "|", reqInfo.ip);
    res.setHeader("Content-Type", "application/json");

    const eventHeader = await parseAuthHeader(req, "updateSettingsFile", true, true, true);
    if (eventHeader.status !== "success") {
        return res.status(401).send({ status: eventHeader.status, message: eventHeader.message });
    }
    setAuthCookie(res, eventHeader.authkey);

    const domain = typeof req.body?.domain === "string" ? req.body.domain : "global";

    for (const settingKey of acceptedSettigsFiles) {
        const file = (req.files as Express.Multer.File[]).find(f => f.fieldname === settingKey);
        const restore = req.body[`${settingKey}.default`] === "true";

        const outputPath = path.resolve(`./src/pages/static/resources/tenants/${domain}`);
        const filePath = path.join(outputPath, settingKey.replace(/\./g, "-") + ".png");

        if (restore) {
            try {
                await fs.promises.rm(filePath);
                logger.info(`updateSettingsFile - Removed override for ${settingKey}`, "|", reqInfo.ip);
                return res.status(200).send({ status: "success", message: `Restored default for ${settingKey}` });
            } catch (err) {
                logger.warn(`updateSettingsFile - No override found to delete for ${settingKey}`, "|", reqInfo.ip);
                return res.status(404).send({ status: "error", message: `No override found to delete for ${settingKey}` });
            }
        }
        
        if (file) {

            if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
                return res.status(400).send({ status: "error", message: "Unsupported file type." });
            }

            await fs.promises.mkdir(outputPath, { recursive: true });
        
            const sharpFile = settingKey === "relay.icon"
                ? sharp(file.buffer).resize(200, 200, { fit: sharp.fit.contain, background: { r: 0, g: 0, b: 0, alpha: 0 } })
                : sharp(file.buffer).resize(180, 61, { fit: sharp.fit.contain, background: { r: 0, g: 0, b: 0, alpha: 0 } });
        
            await sharpFile.png({ quality: 95 }).toFile(filePath);
        
            logger.info(`updateSettingsFile - Updated settings file successfully, field:${settingKey}`, "|", reqInfo.ip);
            return res.status(200).send({ status: "success", message: `Field: ${settingKey} updated successfully` });
             
        }
    }

    logger.warn(`updateSettingsFile - No file or restore directive received`, "|", reqInfo.ip);
    return res.status(400).send({ status: "error", message: "No valid file or restore directive received." });

};

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
    if (!isModuleEnabled("admin")) {
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
    if (!isModuleEnabled("admin")) {
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
    if (!isModuleEnabled("admin")) {
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
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned) {
        logger.warn(`updateSettings - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({ status: "error", message: reqInfo.comments });
    }

    if (!isModuleEnabled("admin")) {
        logger.warn(`updateSettings - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({ status: "error", message: "Module is not enabled" });
    }

    logger.info(`updateSettings - ${req.method} ${req.path}`, "|", reqInfo.ip);
    res.setHeader("Content-Type", "application/json");

    const eventHeader = await parseAuthHeader(req, "updateSettings", true, true, true);
    if (eventHeader.status !== "success") {
        return res.status(401).send({ status: eventHeader.status, message: eventHeader.message });
    }
    setAuthCookie(res, eventHeader.authkey);

    const { name, value, domain } = req.body;

    if (!name || typeof name !== "string") {
        logger.error(`updateSettings - Invalid parameters`, "|", reqInfo.ip);
        return res.status(400).send({ status: "error", message: "Invalid parameters" });
    }

    const keyPath = name.split(".");
    const targetDomain = typeof domain === "string" ? domain : ""; 

    const success = await setConfig(targetDomain, keyPath, value);

    if (!success) {
        logger.error(`updateSettings - Failed to update settings, field:${name} `, "|", reqInfo.ip);
        return res.status(500).send({ status: "error", message: `Failed to update field: ${name}` });
    }

    if (name === "redis.expireTime") {
        const flushResult = await redisCore.flushAll();
        if (flushResult) {
            logger.info(`updateSettings - Redis cache flushed`, "|", reqInfo.ip);
        }
    }

    logger.info(`updateSettings - Updated settings successfully, field:${name}`, "|", reqInfo.ip);
    return res.status(200).send({ status: "success", message: `Field: ${name} updated successfully` });
};

const getModuleData = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`getModuleData - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin")) {
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
    if (!isModuleEnabled("admin")) {
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
    if (!isModuleEnabled("admin")) {
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
    if (!isModuleEnabled("admin")) {
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
            updateSettingsFile,
            getModuleData,
            getModuleCountData,
            banDBRecord   
        };