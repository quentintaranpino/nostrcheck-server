
import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import { getLogHistory, logger } from "../lib/logger.js";
import { format, getCPUUsage, getNewDate } from "../lib/utils.js";
import { ResultMessagev2, ServerStatusMessage, ServerUpdateMessage } from "../interfaces/server.js";
import { generatePassword } from "../lib/authorization.js";
import { dbDelete, dbInsert, dbMultiSelect, dbSimpleSelect, dbUpdate } from "../lib/database/core.js";
import { allowedFieldNames, allowedFieldNamesAndValues, allowedTableNames, moduleDataReturnMessage, moduleDataKeys, moduleDataIndex, mediaModerationFilters, mediaModerationStatus, mediaModerationNsfwFields, notificationStatusRow } from "../interfaces/admin.js";
import { parseAuthHeader} from "../lib/authorization.js";
import { npubToHex } from "../lib/nostr/NIP19.js";
import { dbCountModuleData, dbCountMonthModuleData, dbCountBucketModuleData, dbSelectModuleData, dbSelectMediaModerationData, dbSelectMediaModerationFacets, dbSelectNotificationStatusBulk } from "../lib/admin.js";
import { getBalance, getUnpaidTransactionsBalance } from "../lib/payments/core.js";
import { getModerationQueueLength, moderateFile } from "../lib/moderation/core.js";
import { addNewUsername } from "../lib/register.js";
import { banEntity, unbanEntity } from "../lib/security/banned.js";
import { generateInviteCode } from "../lib/invitations.js";
import { setAuthCookie } from "../lib/frontend.js";
import { deleteFile } from "../lib/storage/core.js";
import { isIpAllowed } from "../lib/security/ips.js";
import { eventStore, ExtendedWebSocket } from "../interfaces/relay.js";
import { getEventById } from "../lib/relay/utils.js";
import { getConfig, isModuleEnabled, setConfig } from "../lib/config/core.js";
import { acceptedSettigsFiles, settingsFileConfig } from "../interfaces/appearance.js";
import { listPlugins } from "../lib/plugins/core.js";
import { initRedis } from "../lib/redis/client.js";
import { wss } from "../routes/relay.route.js";
import { IpInfo } from "../interfaces/security.js";
import { getLatestRelease, compareVersions } from "../lib/updater.js";
import { AuditEvent } from "../interfaces/audit.js";

const redisCore = await initRedis(0, false);

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
    if (!isModuleEnabled("admin", "")) {
        logger.warn("ServerStatus - Attempt to access a non-active module:","admin","|","IP:", reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req,"serverStatus", true, true, true);
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
 * Retrieves the server update status.
 *  
 * @param req - The request object.
 * @param res - The response object.
 * @returns A promise that resolves to the server update status response.
 **/
const serverUpdates = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`serverUpdates - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", "")) {
        logger.warn("serverUpdates - Attempt to access a non-active module:","admin","|","IP:", reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req,"serverUpdates", true, true, true);
	if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

	const currentVersion = process.env.npm_package_version || "0.0.0";
	const latest = await getLatestRelease();
	const checkFailed = latest.version === null;

	const result: ServerUpdateMessage = {
        status: "success",
        message: "Nostrcheck-server update status.",
        currentVersion,
        latestVersion: latest.version,
        updateAvailable: !checkFailed && compareVersions(latest.version!, currentVersion) > 0,
        releaseUrl: latest.url,
        checkFailed,
    };

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
    if (!isModuleEnabled("admin", "")) {
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
    if (!isModuleEnabled("admin", "")) {
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

    // Audit snapshot, taken before the write. This endpoint is the one the file
    // viewer switches (Space / V / N) and the table toolbar buttons post to, so
    // without this the fastest moderation path in the admin would leave no trace.
    const singleEventType = table != "plugins" ? moderationEventType(req.body.field, req.body.value) : "";
    const singleSnapshot = singleEventType !== "" ? await readModerationSnapshot(table, [req.body.field], [Number(req.body.id)]) : {};

    let update;
    if (table == "plugins"){
        // Special case for plugins
        update = await setConfig(req.body.tenant, ["plugins", "list", req.body.id, "enabled"], Boolean(req.body.value));
    }else {
        // Update table with new value
        update = await dbUpdate(table, { [req.body.field]: req.body.value }, ["id"], [req.body.id]);
    }
    if (update) {

        if (singleEventType !== "") {
            const before = singleSnapshot[String(req.body.id)];
            await recordModerationEvent({
                eventtype: singleEventType,
                origintable: table,
                originid: String(req.body.id),
                actor: eventHeader.pubkey,
                source: "admin",
                tenant: req.hostname,
                pubkey: before ? String(before.pubkey || "") : "",
                ip: reqInfo.ip,
                filehash: before ? String(before.original_hash || "") : "",
                previous_value: before ? String(before[req.body.field]) : "",
                new_value: String(req.body.value),
            });
        }

        // Create redis key if necessary
        if (redisTableIndex && req.body.field === redisTableIndex) {
            await redisCore.set(`${table}:${req.body.value}`, req.body.id.toString());
        }

        // If we are updating ips table, we need to update the Redis cache
        if (table === "ips") {
            const ipData = await dbMultiSelect(["ip", "checked", "active"], table, "id = ?", [req.body.id]);
            await redisCore.hashSet(`ips:${ipData[0].ip}`, {
                checked: ipData[0].checked.toString(),
                active: ipData[0].active.toString()
            });
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

    if (!isModuleEnabled("admin", "")) {
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

    // Domain maps to a subdirectory, so it MUST be a simple tenant label.
    // Reject anything with path separators, traversal sequences, or non-safe chars.
    if (!/^[a-zA-Z0-9._-]+$/.test(domain) || domain == "." || domain == "..") {
        logger.warn(`updateSettingsFile - Rejected unsafe domain value: ${domain} | ${reqInfo.ip}`);
        return res.status(400).send({ status: "error", message: "Invalid domain" });
    }

    const tenantsBase = path.resolve("./src/pages/static/resources/tenants");

    for (const settingKey of acceptedSettigsFiles) {
        const file = (req.files as Express.Multer.File[]).find(f => f.fieldname === settingKey);
        const restore = req.body[`${settingKey}.default`] === "true";

        const config = settingsFileConfig[settingKey] || settingsFileConfig["default"];
        const outputPath = path.resolve(tenantsBase, domain);

        // Defence in depth: the resolved path must still sit inside the tenants dir.
        if (outputPath !== tenantsBase && !outputPath.startsWith(tenantsBase + path.sep)) {
            logger.warn(`updateSettingsFile - Path escapes tenants dir: ${outputPath} | ${reqInfo.ip}`);
            return res.status(400).send({ status: "error", message: "Invalid domain" });
        }

        const baseFilename = settingKey.replace(/\./g, "-");
    
        const targetExtension = config.format;
        const filePath = path.join(outputPath, `${baseFilename}.${targetExtension}`);
    
        if (restore) {
            const possibleFiles = [`${baseFilename}.png`, `${baseFilename}.webp`];
    
            let deleted = false;
            for (const file of possibleFiles) {
                try {
                    await fs.promises.rm(path.join(outputPath, file));
                    deleted = true;
                    logger.info(`updateSettingsFile - Removed override for ${settingKey} (${file})`, "|", reqInfo.ip);
                } catch {
                    // File not found, continue to the next one
                }
            }
    
            if (deleted) {
                return res.status(200).send({ status: "success", message: `Restored default for ${settingKey}` });
            } else {
                logger.warn(`updateSettingsFile - No override found to delete for ${settingKey}`, "|", reqInfo.ip);
                return res.status(404).send({ status: "error", message: `No override found to delete for ${settingKey}` });
            }
        }
    
        if (file) {
            if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
                return res.status(400).send({ status: "error", message: "Unsupported file type." });
            }
    
            await fs.promises.mkdir(outputPath, { recursive: true });
    
            const sharpFile = sharp(file.buffer, { limitInputPixels: getConfig(null, ["media", "maxInputPixels"]) }).resize(config.width, config.height, {
                fit: sharp.fit.contain,
                background: config.background
            });
    
            const transformer = config.format === "webp"
                ? sharpFile.webp({ quality: config.quality || 90 })
                : sharpFile.png({ quality: config.quality || 95 });
    
            await transformer.toFile(filePath);
    
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
    if (!isModuleEnabled("admin", "")) {
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
    if (!req.body.pubkey || !req.body.domain) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error(`resetUserPassword - Invalid parameters`, "|", reqInfo.ip);
        return res.status(400).send(result);
    }

    const newPass = await generatePassword(req.body.domain, req.body.pubkey, false, true)
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
    if (!isModuleEnabled("admin", "")) {
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

    // Special case for registered table (can't delete public user)
    if (table == "registered") {
        const dbData = await dbMultiSelect(["username"], table, "id = ?", [req.body.id]);
        if (dbData[0].username === "public") {
            const result : ResultMessagev2 = {
                status: "error",
                message: "Cannot delete public user"
            };
            logger.warn(`deleteDBRecord - Attempt to delete public user`, "|", reqInfo.ip);
            return res.status(400).send(result);
        }
    }

    // Unban the record if it was banned and delete it from banned redis cache.
    // Attributed too: the unban this triggers is an admin decision, not the
    // server's own.
    await unbanEntity(req.body.id, table, eventHeader.pubkey, "admin");

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
    if (!isModuleEnabled("admin", "")) {
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

    if (!isModuleEnabled("admin", "")) {
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
    if (!isModuleEnabled("admin", "")) {
        logger.warn(`getModuleData - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`getModuleData - ${req.method} ${req.path}`, "|", reqInfo.ip);

    // Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "getModuleData", true, true, true);
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
    const tenant = req.query.tenant as string || '';

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
 
   // const data = module === "logs" ? await getLogHistory(offset, limit, order, sort, search, filterObject) : await dbSelectModuleData(module,offset,limit,order,sort,search,filterObject);
    
    let data;
    if (module === "logs") {
        data = await getLogHistory(offset, limit, order, sort, search, filterObject);
    } else if (module === "plugins") {
        const allPlugins =  (await listPlugins(tenant)).map((p) => ({
            id: p.name,
            name: p.name,
            module: p.module,
            order: p.order ?? 0,
            enabled: p.enabled ? 1 : 0
        }));

        data = {
            total: allPlugins.length,
            totalNotFiltered: allPlugins.length,
            rows: allPlugins.slice(offset, offset + limit)
        };

    } else if (module == "relay.connections") {

        const reqInfos: IpInfo[] = [];
        wss?.clients.forEach((client) => {
            const ws = client as ExtendedWebSocket;
            if (ws.reqInfo) {
                reqInfos.push(ws.reqInfo);
            }
        });

        data = {
            total: reqInfos.length,
            totalNotFiltered: reqInfos.length,
            rows: reqInfos.slice(offset, offset + limit)
        };
    } else if (module == "reports") {

        // BUD-09 reports are stored as kind 1984 nostr events. Each `x` tag in
        // the event spawns one row in the admin view, joined to mediafiles by
        // hash so the admin can see which blob each row refers to.
        // dbSimpleSelect doesn't take params arrays, so search and sort have
        // to be sanitised in-place (same approach dbSelectModuleData uses).
        const sortColumn = sort && /^[a-zA-Z0-9_.]+$/.test(sort) ? sort : "events.created_at";
        const sortOrder = order && /^(ASC|DESC)$/i.test(order) ? order : "DESC";
        const safeSearch = (search || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64);
        const searchClause = safeSearch.length > 0 ? `AND (events.pubkey LIKE '%${safeSearch}%' OR events.content LIKE '%${safeSearch}%' OR eventtags.tag_value LIKE '%${safeSearch}%')` : "";

        // Custom filter handling. The frontend toolbar uses {checked: "!1"} to
        // mean "show only pending reports". We honour it here to scope the
        // SQL; same convention dbSelectModuleData uses for the other tables.
        let extraFilterClause = "";
        if (Array.isArray(filterObject)) {
            for (const item of filterObject as { field: string, value: string }[]) {
                if (item.field === "checked" && typeof item.value === "string") {
                    if (item.value.startsWith("!")) {
                        const v = item.value.split("!")[1];
                        if (v === "0" || v === "1") extraFilterClause += ` AND events.checked != '${v}'`;
                    } else if (item.value === "0" || item.value === "1") {
                        extraFilterClause += ` AND events.checked = '${item.value}'`;
                    }
                }
            }
        }

        const baseFrom = `FROM events INNER JOIN eventtags ON eventtags.event_id = events.event_id WHERE events.kind = 1984 AND eventtags.tag_name = 'x' ${searchClause} ${extraFilterClause}`;
        const baseFromUnfiltered = `FROM events INNER JOIN eventtags ON eventtags.event_id = events.event_id WHERE events.kind = 1984 AND eventtags.tag_name = 'x'`;

        const totalRow = await dbSimpleSelect("events", `SELECT COUNT(*) as total ${baseFrom}`);
        const totalNotFilteredRow = await dbSimpleSelect("events", `SELECT COUNT(*) as total ${baseFromUnfiltered}`);

        const rows = await dbSimpleSelect("events",
            `SELECT events.id, events.event_id, events.checked, events.pubkey AS reporter, events.content, events.created_at,
                    eventtags.tag_value AS blob_hash, eventtags.extra_values AS report_type_extra,
                    (SELECT mediafiles.id FROM mediafiles WHERE mediafiles.original_hash = eventtags.tag_value LIMIT 1) AS blob_id,
                    (SELECT mediafiles.active FROM mediafiles WHERE mediafiles.original_hash = eventtags.tag_value LIMIT 1) AS blob_active,
                    (SELECT mediafiles.filename FROM mediafiles WHERE mediafiles.original_hash = eventtags.tag_value LIMIT 1) AS blob_filename
             ${baseFrom}
             ORDER BY ${sortColumn} ${sortOrder}
             LIMIT ${Number(offset) || 0}, ${Number(limit) || 50}`
        );

        data = {
            total: totalRow ? JSON.parse(JSON.stringify(totalRow[0])).total : 0,
            totalNotFiltered: totalNotFilteredRow ? JSON.parse(JSON.stringify(totalNotFilteredRow[0])).total : 0,
            rows: rows || []
        };
    }

    else {
        data = await dbSelectModuleData(module, offset, limit, order, sort, search, filterObject);
    }

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
    if (!isModuleEnabled("admin", "")) {
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
        const data =  await getBalance(req.hostname, 1000);
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

    if (action == "bucketCount") {
        const bucketParam = (req.query.bucket || "month").toString();
        const bucket: "week" | "month" | "year" =
            (["week","month","year"] as const).includes(bucketParam as any)
                ? (bucketParam as "week" | "month" | "year")
                : "month";
        const count = await dbCountBucketModuleData(module, field, bucket);
        return res.status(200).send({data: count, bucket});
    }

    if (field != "" && field != undefined && field != 'undefined') {
        const countField = await dbCountModuleData(module, field);
        const countTotal = await dbCountModuleData(module);
        return res.status(200).send({total: countTotal, field: countField});
    }
    
    logger.debug(`getModuleCountData - Data retrieved succesfully`, "|", reqInfo.ip);
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
    if (!isModuleEnabled("admin", "")) {
        logger.warn(`moderateDBRecord - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    // Check if authorization header is valid
    const eventHeader = await parseAuthHeader(req, "moderateDBRecord", true, true, true);
    if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    if (req.body.id === "" || req.body.id === null ||  req.body.id === undefined || 
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

    logger.info(`moderateDBRecord - ${req.method} ${req.path}`, "|", reqInfo.ip, "|", req.body.id, "|");

    await moderateFile(table, req.body.id, "");

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
    if (!isModuleEnabled("admin", "")) {
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

    // Attribution: banEntity writes its own audit row, and without these it would
    // be filed under "system" instead of the admin who pressed the button.
    const banResult = await banEntity(req.body.id, table, req.body.reason, eventHeader.pubkey, "admin");

    if (banResult.status == "error") {
        logger.error(`banDBRecord - Failed to ban record`, "|", reqInfo.ip);
        return res.status(500).send({status: "error", message: banResult.message});
    }

    logger.info(`banDBRecord - Record banned succesfully`, "|", reqInfo.ip);
    return res.status(200).send({status: "success", message: banResult.message});
        
}

// The audit layer exports getNotificationStatusBulk(origintable, ids) from
// lib/audit/core. The specifier is held in a variable so this compiles and runs
// on installations where that module (or its table) isn't there yet: the import
// fails, we fall back to the bridge reader, and the worst case is a gallery with
// no notification badges.
// Pending, once that layer settles its schema: read the delivery state only from
// rows with notified = 1, or audit-only events would show up as "not notified".
const auditCorePath = "../lib/audit/core.js";

// Maps a moderation write to its audit event type. Fields that aren't moderation
// decisions (comments, username, ...) return "" and are not recorded: the event
// vocabulary is closed and inventing names would fragment the timeline.
const moderationEventType = (field: string, value: string | number): string => {

    const on = String(value) === "1";

    switch (field) {
        case "checked":    return on ? "checked_set" : "checked_unset";
        case "active":     return on ? "activated" : "deactivated";
        case "nsfw":       return on ? "nsfw_set" : "nsfw_unset";
        case "visibility": return "visibility_changed";
        default:           return "";
    }
};

/**
 * Reads the columns an audit entry needs before they are overwritten.
 *
 * previous_value has to be the value that was actually there. Taking it from the
 * request would only record what the client asked for, which is the one thing we
 * already know.
 *
 * @param table - Real table name.
 * @param fields - Columns whose previous value matters.
 * @param ids - Rows about to change.
 * @returns Map of row id to its pre-update row, empty when it can't be read.
 */
const readModerationSnapshot = async (table: string, fields: string[], ids: number[]): Promise<Record<string, Record<string, unknown>>> => {

    const snapshot: Record<string, Record<string, unknown>> = {};
    if (ids.length === 0 || fields.length === 0) return snapshot;

    // pubkey and the hash make the trail answerable by uploader and by blob, and
    // they cost nothing here since the row is already being read.
    const extra = table === "mediafiles" ? ["pubkey", "original_hash"] : [];

    try {
        const rows = await dbMultiSelect(["id", ...fields, ...extra],
                                        table,
                                        `id IN (${ids.map(() => "?").join(",")})`,
                                        ids,
                                        false);
        for (const row of rows) snapshot[String(row.id)] = row;
    } catch (error) {
        logger.error(`readModerationSnapshot - Could not read the previous values of ${table}: ${error}`);
    }

    return snapshot;
};

/**
 * Records one moderation change in the audit log.
 *
 * A logging failure never aborts the moderation that was already applied, but a
 * change with no trace is exactly what this exists to prevent, so every miss is
 * written to the application log.
 *
 * @param event - The audit event to record.
 */
const recordModerationEvent = async (event: AuditEvent): Promise<void> => {

    try {
        const auditCore = await import(auditCorePath);
        if (typeof auditCore.logAuditEvent !== "function") {
            logger.warn(`recordModerationEvent - audit core exports no logAuditEvent, ${event.eventtype} on ${event.origintable}:${event.originid} goes unrecorded`);
            return;
        }
        const result = await auditCore.logAuditEvent(event);
        if (result && result.status === "error") {
            logger.error(`recordModerationEvent - Could not record ${event.eventtype} on ${event.origintable}:${event.originid}: ${result.message}`);
        }
    } catch (error) {
        logger.error(`recordModerationEvent - Could not record ${event.eventtype} on ${event.origintable}:${event.originid}: ${error}`);
    }
};

const normaliseNotificationStatus = (bulk: Record<string, unknown>): Record<string, notificationStatusRow> => {

    const result: Record<string, notificationStatusRow> = {};

    for (const [key, value] of Object.entries(bulk)) {
        if (!value || typeof value !== "object") continue;
        const row = value as Partial<notificationStatusRow>;
        result[key] = {
            id: Number(row.id) || 0,
            status: String(row.status || ""),
            attempts: Number(row.attempts) || 0,
            lasterror: String(row.lasterror || ""),
        };
    }

    return result;
};

const getNotificationStatus = async (origintable: string, ids: number[]): Promise<Record<string, notificationStatusRow>> => {

    try {
        const auditCore = await import(auditCorePath);
        if (typeof auditCore.getNotificationStatusBulk === "function") {
            const bulk = await auditCore.getNotificationStatusBulk(origintable, ids);
            // The contract only promises "a map by id", so take either a Map or
            // a plain object and coerce the fields we render.
            if (bulk instanceof Map) return normaliseNotificationStatus(Object.fromEntries(bulk));
            if (bulk && typeof bulk === "object") return normaliseNotificationStatus(bulk);
        }
        logger.debug(`getNotificationStatus - audit core exports no getNotificationStatusBulk, falling back to the bridge reader`);
    } catch (error) {
        logger.debug(`getNotificationStatus - audit core not available, falling back to the bridge reader`);
    }

    return await dbSelectNotificationStatusBulk(origintable, ids);
};

/**
 * Retrieves a page of media files for the moderation gallery.
 *
 * @param req - The request object. Query: status, mimetype, pubkey, cursor, limit, order, facets.
 * @param res - The response object.
 * @returns A promise that resolves to the response object.
 */
const getMediaModerationData = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`getMediaModerationData - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", "")) {
        logger.warn(`getMediaModerationData - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.debug(`getMediaModerationData - ${req.method} ${req.path}`, "|", reqInfo.ip);

    // Check if authorization header is valid
    const eventHeader = await parseAuthHeader(req, "getMediaModerationData", true, true, true);
    if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    // Status. Unknown buckets fall back to the pending queue, which is the default view.
    const requestedStatus = typeof req.query.status === "string" ? req.query.status : "";
    const status = mediaModerationStatus.includes(requestedStatus) ? requestedStatus : "pending";

    // Mimetype. Either an exact type or a "image/*" style group.
    const requestedMimetype = typeof req.query.mimetype === "string" ? req.query.mimetype : "";
    const mimetype = /^[a-zA-Z0-9.+-]+\/([a-zA-Z0-9.+-]+|\*)$/.test(requestedMimetype) ? requestedMimetype : "";
    if (requestedMimetype != "" && mimetype == "") {
        logger.warn(`getMediaModerationData - Invalid mimetype filter: ${requestedMimetype}`, "|", reqInfo.ip);
        return res.status(400).send({"status": "error", "message": "Invalid mimetype filter"});
    }

    // Pubkey. npub is accepted for convenience, everything is stored as hex.
    // A malformed npub decodes to an empty string, don't let that silently turn
    // into "no filter at all".
    let pubkey = typeof req.query.pubkey === "string" ? req.query.pubkey.trim() : "";
    const pubkeyWasNpub = pubkey.startsWith("npub");
    if (pubkeyWasNpub) pubkey = await npubToHex(pubkey);
    if ((pubkeyWasNpub && pubkey == "") || (pubkey != "" && !/^[a-f0-9]{64}$/i.test(pubkey))) {
        logger.warn(`getMediaModerationData - Invalid pubkey filter`, "|", reqInfo.ip);
        return res.status(400).send({"status": "error", "message": "Invalid pubkey filter"});
    }

    const filters : mediaModerationFilters = {status, mimetype, pubkey};
    const cursor = Number(req.query.cursor) || 0;
    const limit = Number(req.query.limit) || 60;
    const order = typeof req.query.order === "string" ? req.query.order : "DESC";

    const data = await dbSelectMediaModerationData(filters, cursor, limit, order);

    // Notification state for the page, in one lookup instead of one per tile.
    const notifications = await getNotificationStatus("mediafiles", data.rows.map(row => Number(row.id)));

    // A manual retry writes the auditlog row by id. The audit layer's status map
    // now carries that id, so this normally resolves nothing; it stays as the
    // safety net for any reader that doesn't supply one, and it only asks about
    // rows that could actually be retried (almost none in a healthy queue).
    const pendingRetry = Object.keys(notifications).filter(key => {
        const status = notifications[key].status;
        return notifications[key].id === 0 && status !== "" && status !== "sent";
    });
    if (pendingRetry.length > 0) {
        const retryTargets = await dbSelectNotificationStatusBulk("mediafiles", pendingRetry.map(key => Number(key)));
        for (const key of pendingRetry) {
            if (retryTargets[key] && retryTargets[key].id > 0) notifications[key].id = retryTargets[key].id;
        }
    }

    for (const row of data.rows) {
        row.notification = notifications[String(row.id)] || null;
    }

    // Facets are only worth a couple of GROUP BY scans when the toolbar asks
    // for them (first load and whenever the status bucket changes).
    const facets = req.query.facets === "1" ? await dbSelectMediaModerationFacets(filters) : undefined;

    logger.info(`getMediaModerationData - Data retrieved succesfully, status: ${status} | total: ${data.total}`, "|", reqInfo.ip);
    return res.status(200).send({
        status: "success",
        message: "Moderation data retrieved succesfully",
        total: data.total,
        cursor,
        limit,
        rows: data.rows,
        facets,
    });

}

/**
 * Applies one moderation action to several records at once.
 *
 * The gallery selects dozens of files at a time, one request per file would
 * burn the rate limit before the batch is done. Field and table go through the
 * same allowlists updateDBRecord uses, and banning is delegated to banEntity.
 *
 * @param req - The request object. Body: table, ids, field, value and reason (bans only).
 * @param res - The response object.
 * @returns A promise that resolves to the response object.
 */
const bulkModerateRecords = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned == true) {
        logger.warn(`bulkModerateRecords - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": reqInfo.comments});
    }

    // Check if current module is enabled
    if (!isModuleEnabled("admin", "")) {
        logger.warn(`bulkModerateRecords - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`bulkModerateRecords - ${req.method} ${req.path}`, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');

    // Check if authorization header is valid
    const eventHeader = await parseAuthHeader(req, "bulkModerateRecords", true, true, true);
    if (eventHeader.status !== "success") {return res.status(401).send({"status": eventHeader.status, "message" : eventHeader.message});}
    setAuthCookie(res, eventHeader.authkey);

    // Check if the request has the required parameters
    if (!req.body.table || !req.body.field || !Array.isArray(req.body.ids) || req.body.ids.length === 0) {
        logger.error(`bulkModerateRecords - Invalid parameters`, "|", reqInfo.ip);
        return res.status(400).send({"status": "error", "message": "Invalid parameters"});
    }

    // One batch, one bite. Bigger selections come back as more requests.
    if (req.body.ids.length > 500) {
        logger.warn(`bulkModerateRecords - Too many records in a single batch: ${req.body.ids.length}`, "|", reqInfo.ip);
        return res.status(400).send({"status": "error", "message": "Too many records in a single batch (max 500)"});
    }

    const ids : number[] = req.body.ids.map((id: string | number) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) {
        logger.error(`bulkModerateRecords - No valid ids received`, "|", reqInfo.ip);
        return res.status(400).send({"status": "error", "message": "No valid ids received"});
    }

    // Don't show the user the real table names
    const table = moduleDataKeys[req.body.table];
    if (!table || !allowedTableNames.includes(table)) {
        logger.warn(`bulkModerateRecords - Invalid table name`, "|", reqInfo.ip);
        return res.status(400).send({"status": "error", "message": "Invalid table name"});
    }

    const field : string = String(req.body.field);
    const value = req.body.value;
    const failed : number[] = [];
    let processed = 0;

    // Ban / unban. It lives in its own table so it can't go through dbUpdate.
    if (field === "banned") {

        if (String(value) !== "0" && String(value) !== "1") {
            logger.error(`bulkModerateRecords - Invalid value for banned field`, "|", reqInfo.ip);
            return res.status(400).send({"status": "error", "message": "Invalid value for banned field"});
        }

        if (String(value) === "1" && (req.body.reason === "" || req.body.reason === null || req.body.reason === undefined)) {
            logger.error(`bulkModerateRecords - Reason cannot be empty`, "|", reqInfo.ip);
            return res.status(400).send({"status": "error", "message": "Reason cannot be empty"});
        }

        // banEntity / unbanEntity record their own audit event, so the only thing
        // needed here is the attribution: without actor and source the ban would
        // land in the log as "system".
        for (const id of ids) {
            const result = String(value) === "1"
                            ? await banEntity(id, table, req.body.reason, eventHeader.pubkey, "admin")
                            : await unbanEntity(id, table, eventHeader.pubkey, "admin");
            if (result.status === "error") {
                logger.warn(`bulkModerateRecords - Failed to ban record ${id}: ${result.message}`, "|", reqInfo.ip);
                failed.push(id);
                continue;
            }
            processed++;
        }

    } else if (field === "nsfw") {

        // nsfw is a real column, but it is never written alone: flagging a file
        // is a review decision, so checked goes to 1 with it. Both in a single
        // UPDATE per row (dbUpdate builds one SET) so the pair can't come apart
        // halfway through a 200 file batch. visibility is left alone on purpose,
        // that switch belongs to the uploader.
        if (String(value) !== "0" && String(value) !== "1") {
            logger.error(`bulkModerateRecords - Invalid value for nsfw field`, "|", reqInfo.ip);
            return res.status(400).send({"status": "error", "message": "Invalid value for nsfw field"});
        }

        // Only mediafiles carries these columns.
        if (table !== "mediafiles") {
            logger.warn(`bulkModerateRecords - nsfw is only available for media files, table: ${table}`, "|", reqInfo.ip);
            return res.status(400).send({"status": "error", "message": "nsfw is only available for media files"});
        }

        const nsfwFields = mediaModerationNsfwFields[String(value)];

        // Same allowlist gate the plain field path goes through, applied to each
        // of the two columns this action writes.
        for (const [nsfwField, nsfwValue] of Object.entries(nsfwFields)) {
            const nsfwRule = allowedFieldNamesAndValues.find(e => e.field === nsfwField);
            const nsfwAllowedValues = (nsfwRule?.values || []) as (string | number)[];
            if (!allowedFieldNames.includes(nsfwField) || !nsfwRule || !nsfwAllowedValues.includes(nsfwValue)) {
                logger.warn(`bulkModerateRecords - nsfw would write a field that is not allowed: ${nsfwField}`, "|", reqInfo.ip);
                return res.status(400).send({"status": "error", "message": "Invalid field name"});
            }
        }

        // Read before writing: the flag each row had is the previous_value.
        const snapshot = await readModerationSnapshot(table, ["nsfw"], ids);

        for (const id of ids) {
            const update = await dbUpdate(table, { ...nsfwFields }, ["id"], [id]);
            if (!update) {
                logger.warn(`bulkModerateRecords - Failed to update record ${id}`, "|", reqInfo.ip);
                failed.push(id);
                continue;
            }
            processed++;

            const before = snapshot[String(id)];
            await recordModerationEvent({
                eventtype: moderationEventType("nsfw", value),
                origintable: table,
                originid: String(id),
                actor: eventHeader.pubkey,
                source: "admin",
                tenant: req.hostname,
                pubkey: before ? String(before.pubkey || "") : "",
                ip: reqInfo.ip,
                filehash: before ? String(before.original_hash || "") : "",
                previous_value: before ? String(before.nsfw) : "",
                new_value: String(nsfwFields.nsfw),
                reason: req.body.reason || "",
            });
        }

    } else {

        // Check if the provided field name is allowed.
        if (!allowedFieldNames.includes(field) || !allowedFieldNamesAndValues.some(e => e.field === field)) {
            logger.warn(`bulkModerateRecords - Invalid field name: ${field}`, "|", reqInfo.ip);
            return res.status(400).send({"status": "error", "message": "Invalid field name"});
        }

        // Redis index fields (filename, domain, ...) are not moderation flags,
        // rewriting them in bulk would desync the cache.
        if (moduleDataIndex[req.body.table] === field) {
            logger.warn(`bulkModerateRecords - Field ${field} cannot be updated in bulk`, "|", reqInfo.ip);
            return res.status(400).send({"status": "error", "message": `Field ${field} cannot be updated in bulk`});
        }

        if (value === "" || value === null || value === undefined) {
            logger.error(`bulkModerateRecords - ${field} cannot be empty`, "|", reqInfo.ip);
            return res.status(400).send({"status": "error", "message": field + " cannot be empty."});
        }

        // Flag fields only accept their declared values. Those can be numbers
        // (0/1 switches) or a set of strings (auditlog.status), so check both
        // forms before rejecting.
        const fieldRule = allowedFieldNamesAndValues.find(e => e.field === field);
        const allowedValues = (fieldRule?.values || []) as (string | number)[];
        const freeform = allowedValues.includes("string") || allowedValues.includes("number");
        if (fieldRule && !freeform && !allowedValues.includes(Number(value)) && !allowedValues.includes(String(value))) {
            logger.warn(`bulkModerateRecords - Invalid value for field ${field}: ${value}`, "|", reqInfo.ip);
            return res.status(400).send({"status": "error", "message": `Invalid value for field ${field}`});
        }

        // Only moderation flags produce an audit event; the snapshot is skipped
        // entirely for anything else.
        const eventtype = moderationEventType(field, value);
        const snapshot = eventtype !== "" ? await readModerationSnapshot(table, [field], ids) : {};

        for (const id of ids) {
            const update = await dbUpdate(table, { [field]: value }, ["id"], [id]);
            if (!update) {
                logger.warn(`bulkModerateRecords - Failed to update record ${id}`, "|", reqInfo.ip);
                failed.push(id);
                continue;
            }
            processed++;

            if (eventtype === "") continue;
            const before = snapshot[String(id)];
            await recordModerationEvent({
                eventtype,
                origintable: table,
                originid: String(id),
                actor: eventHeader.pubkey,
                source: "admin",
                tenant: req.hostname,
                pubkey: before ? String(before.pubkey || "") : "",
                ip: reqInfo.ip,
                filehash: before ? String(before.original_hash || "") : "",
                previous_value: before ? String(before[field]) : "",
                new_value: String(value),
                reason: req.body.reason || "",
            });
        }

        // Same cache refresh updateDBRecord does for the ips table.
        if (table === "ips") {
            for (const id of ids) {
                const ipData = await dbMultiSelect(["ip", "checked", "active"], table, "id = ?", [id]);
                if (ipData.length === 0) continue;
                await redisCore.hashSet(`ips:${ipData[0].ip}`, {
                    checked: ipData[0].checked.toString(),
                    active: ipData[0].active.toString()
                });
            }
        }
    }

    if (processed === 0) {
        logger.error(`bulkModerateRecords - Failed to apply ${field} to ${ids.length} records`, "|", reqInfo.ip);
        return res.status(500).send({"status": "error", "message": `Failed to update ${ids.length} records`, "processed": 0, "failed": failed});
    }

    logger.info(`bulkModerateRecords - ${field} set to ${value} on ${processed} records from ${req.body.table}, ${failed.length} failed`, "|", reqInfo.ip);
    return res.status(200).send({
        status: "success",
        message: failed.length === 0 ? `${processed} records updated succesfully` : `${processed} records updated, ${failed.length} failed`,
        processed,
        failed,
    });

}

export {    serverStatus,
            serverUpdates,
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
            banDBRecord,
            getMediaModerationData,
            bulkModerateRecords
        };