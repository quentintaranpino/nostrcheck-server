
import { Request, Response } from "express";
import fs from "fs";
import sharp from "sharp";

import app from "../app.js";

import { logHistory, logger } from "../lib/logger.js";
import { getClientIp, format, getNewDate } from "../lib/utils.js";
import { ResultMessagev2, ServerStatusMessage, authkeyResultMessage } from "../interfaces/server.js";
import { generateCredentials } from "../lib/authorization.js";
import { dbDelete, dbInsert, dbUpdate } from "../lib/database.js";
import { allowedFieldNames, allowedFieldNamesAndValues, allowedTableNames, moduleDataReturnMessage, moduleDataKeys } from "../interfaces/admin.js";
import { parseAuthHeader} from "../lib/authorization.js";
import { isModuleEnabled, updateLocalConfigKey } from "../lib/config.js";
import { flushRedisCache } from "../lib/redis.js";
import { getFileMimeType } from "../lib/media.js";
import { npubToHex } from "../lib/nostr/NIP19.js";
import { dbCountModuleData, dbCountMonthModuleData, dbSelectModuleData } from "../lib/admin.js";
import { getBalance, getUnpaidTransactionsBalance } from "../lib/payments/core.js";
import { themes } from "../interfaces/themes.js";
import { moderateFile } from "../lib/moderation/core.js";
import { addNewUsername } from "../lib/register.js";
import { banRecord } from "../lib/banned.js";
import { generateInviteCode } from "../lib/invitations.js";

let hits = 0;
/**
 * Retrieves the server status.
 * 
 * @param req - The request object.
 * @param res - The response object.
 * @returns A promise that resolves to the server status response.
 */
const serverStatus = async (req: Request, res: Response): Promise<Response> => {

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }
	
    hits++;
    if (hits % 100 == 0) {
        logger.info("RES -> ServerStatus calls: ", hits, " | ", getClientIp(req));
    }

	const result: ServerStatusMessage = {
        status: "success",
        message: "Nostrcheck API server is running.",
		version: process.env.npm_package_version || "0.0.0",
		uptime: format(process.uptime()),
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

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> StopServer", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');
    
    // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req,"StopServer", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    logger.info("RES -> 200 Stopping server from IP:", getClientIp(req));
    const result : authkeyResultMessage = {
        status: "success",
        message: "Stopping server...",
        authkey: EventHeader.authkey
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

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> updateDBRecord", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');

     // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "updateDBRecord", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}
    
    // Check if the request has the required parameters
     if (!req.body.table || !req.body.field || req.body.value === undefined || req.body.value === null || !req.body.id) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    // Don't show the user the real table names
    const table = moduleDataKeys[req.body.table];
	if (!table) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table name"
            };
        logger.warn("RES -> Invalid table name" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    logger.debug("table: ", table, " | field: ", req.body.field, " | value: ", req.body.value, " | id: ", req.body.id)

    // Check if the provided table name and field name are allowed.
    if (!allowedTableNames.includes(table) || 
        !allowedFieldNamesAndValues.some(e => e.field === req.body.field) ||
        !allowedFieldNames.includes(req.body.field)     
        ){
            const result : ResultMessagev2 = {
                status: "error",
                message: "Invalid table name or field name"
            };
            logger.warn("RES -> Invalid table name or field name" + " | " + getClientIp(req));
            return res.status(400).send(result);
    }

    // Check if the provided value is empty
    if (req.body.value === "" && req.body.field != "comments" || req.body.value === null || req.body.value === undefined){
        const result : authkeyResultMessage = {
            status: "error",
            message: req.body.field + " cannot be empty.",
            authkey: EventHeader.authkey
            };
        logger.warn("RES -> Value is empty: " + req.body.field +  " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    // Update table with new value
    const update = await dbUpdate(table, req.body.field, req.body.value, ["id"], [req.body.id]);
    if (update) {
        
        const result : authkeyResultMessage = {
            status: "success",
            message: req.body.value,
            authkey: EventHeader.authkey
            };
        logger.info("RES -> Record updated" + " | " + getClientIp(req));
        return res.status(200).send(result);
    } else {
        
        const result : ResultMessagev2 = {
            status: "error",
            message: "Failed to update record"
            };
        logger.error("RES -> Failed to update record" + " | " + getClientIp(req));
        return res.status(500).send(result);
    }
}

const updateLogo = async (req: Request, res: Response): Promise<Response> => {

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.debug("POST /api/v2/admin/updatelogo", "|", getClientIp(req));

     // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "updateDBRecord", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    const theme = req.body.theme || "light";

    let file: Express.Multer.File | null = null;
	if (Array.isArray(req.files) && req.files.length > 0) {
		file = req.files[0];
	}

    if (!req.files || req.files == undefined || req.files.length == 0 || !file) {
        try {
            await fs.promises.copyFile(`./src/pages/static/resources/navbar-logo-${theme}.default.png`, `./src/pages/static/resources/navbar-logo-${theme}.png`);
            logger.info("RES -> Default logo restored" + " | " + getClientIp(req));
            return res.status(200).send({status: "success", message: "Default logo restored", authkey: EventHeader.authkey});
        } catch (error) {
            logger.error("RES -> Failed to restore default logo" + " | " + getClientIp(req));
            return res.status(500).send({status: "error", message: "Failed to restore default logo", authkey: EventHeader.authkey});
        }
    }

	if (await getFileMimeType(req, file) == "") {
		logger.error(`RES -> 400 Bad request - `, file.mimetype, ` filetype not detected`, "|", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "file type not detected or not allowed", "authkey": EventHeader.authkey});
	}

    await sharp(file.buffer)
        .resize(180, 61, { fit: sharp.fit.contain, background: { r: 0, g: 0, b: 0, alpha: 0 } }) 
        .png({ quality: 95 })
        .toBuffer()
        .then(async data => { 
            await fs.promises.writeFile(`./src/pages/static/resources/navbar-logo-${theme}.png`, data);
            logger.info("RES -> Logo updated" + " | " + getClientIp(req));
        })
        .catch(err => { 
            logger.error("RES -> Error updating logo" + " | " + err);
            return res.status(500).send({"status": "error", "message": "Error updating logo", "authkey": EventHeader.authkey});
        });

     return res.status(200).send({"status": "success", "message": "Logo updated", "authkey": EventHeader.authkey});

}

const updateTheme = async (req: Request, res: Response): Promise<Response> => {

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.debug("POST /api/v2/admin/updatetheme", "|", getClientIp(req));

     // Check if authorization header is valid
    const EventHeader = await parseAuthHeader(req, "updateDBRecord", true);
    if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    if (!req.body || req.body == undefined || req.body.length == 0) {
        logger.error("RES -> 400 Bad request - Empty body", "|", getClientIp(req));
        return res.status(400).send({"status": "error", "message": "Empty body", "authkey": EventHeader.authkey});
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
        logger.info("RES -> Theme updated" + " | " + getClientIp(req));
        return res.status(200).send({status: "success", message: "Theme updated", authkey: EventHeader.authkey});
    }catch(e){
        logger.error("RES -> Error updating theme" + " | " + e);
        return res.status(500).send({status: "error", message: "Error updating theme", authkey: EventHeader.authkey});
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

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }
   
    logger.info("REQ -> reset user password", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');
    
     // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "resetUserPassword", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    // Check if the request has the required parameters
    if (!req.body.pubkey) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    const newPass = await generateCredentials('password', req.body.pubkey, false, true)
    if (newPass == "") {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Failed to generate new password"
            };
        logger.error("RES -> Failed to generate new password" + " | " + getClientIp(req));
        return res.status(500).send(result);
    }

    const result : authkeyResultMessage = {
        status: "success",
        message: "New password generated for " + req.body.pubkey,
        authkey: EventHeader.authkey
        };
    logger.info("RES -> New password sent to " + req.body.pubkey);
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

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> deleteDBRecord", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');

     // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "deleteDBRecord", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    // Check if the request has the required parameters
    if (!req.body.table || !req.body.id) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

      // Verify that table is a string
      if (typeof req.body.table !== 'string') {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table parameter"
        };
        logger.error("RES -> Invalid table parameter" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    // Verify that id is a number
    if (typeof req.body.id !== 'number') {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid id parameter"
        };
        logger.error("RES -> Invalid id parameter" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    // Don't show the user the real table names
    const table = moduleDataKeys[req.body.table];
	if (!table) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table name"
            };
        logger.warn("RES -> Invalid table name" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    // Check if the provided table name is allowed.
    if (!allowedTableNames.includes(table)){
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table name"
        };
        logger.warn("RES -> Invalid table name" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    // Delete record from table
    const deletedRecord = await dbDelete(table, ['id'], [req.body.id]);
    if(deletedRecord){
        const result : authkeyResultMessage = {
            status: "success",
            message: "Record deleted succesfully",
            authkey: EventHeader.authkey
            };
        logger.info("RES -> Record deleted - id: " + req.body.id + " from table: " + table + " | " + getClientIp(req));
        return res.status(200).send(result);
    } else {
        const result : authkeyResultMessage = {
            status: "error",
            message: "Failed to delete record",
            authkey: EventHeader.authkey
            };
        logger.error("RES -> Failed to delete record" + " | " + getClientIp(req));
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

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> insertDBRecord", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');

     // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "insertDBRecord", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    // Check if the request has the required parameters
    if (!req.body.table || !req.body.row) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    // Don't show the user the real table names
    const table = moduleDataKeys[req.body.table];
	if (!table) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table name"
            };
        logger.warn("RES -> Invalid table name" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    let errorFound = false;
    await Object.entries(req.body.row).forEach(([field, value]) => {
        if (field == "id" || field == "date" || field == "comments"){return;}
        if (!allowedTableNames.includes(table) || 
            !allowedFieldNamesAndValues.some(e => e.field === field) ||
            !allowedFieldNames.includes(field)     
            ){
                logger.warn("RES -> Invalid table name or field name: " + " table: " + table + " field: " +  field + " | " + getClientIp(req));
                errorFound = true;
        }

        // Check if the provided value is empty
        if (value === ""){
            logger.warn("RES -> Value is empty: " + field +  " | " + getClientIp(req));
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
    if (req.body.table == "nostraddressData"){
        if (await npubToHex(req.body.row["pubkey"]) != req.body.row["hex"]){
            const result : authkeyResultMessage = {
                status: "error",
                message: "Invalid npub / hex",
                authkey: EventHeader.authkey
                };
            logger.error("RES -> Invalid pubkey" + " | " + getClientIp(req));
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
    if (req.body.table == "nostraddressData"){
        insert = await addNewUsername(req.body.row["username"], req.body.row["hex"], req.body.row["password"], req.body.row["domain"], req.body.row["comments"], true, "", false, false);
    }else{

        insert = await dbInsert(table, Object.keys(req.body.row), Object.values(req.body.row));
    }
    if (insert === 0) {
        const result : authkeyResultMessage = {
            status: "error",
            message: "Failed to insert records",
            authkey: EventHeader.authkey
            };
        logger.error("RES -> Failed to insert records" + " | " + getClientIp(req));
        return res.status(500).send(result);
    }

    const result : authkeyResultMessage = {
        status: "success",
        message: insert.toString(),
        authkey: EventHeader.authkey
        };

    logger.info("RES -> Records inserted" + " | " + getClientIp(req));
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

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> updateSettings", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');

     // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "updateSettings", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    if (req.body.name === "" || req.body.name === null || req.body.name === undefined) {
        const result: authkeyResultMessage = {
            status: "error",
            message: "Invalid parameters",
            authkey: ""
        }
        return res.status(400).send(result);
    }

    const updated = await updateLocalConfigKey(req.body.name, req.body.value);
    if (!updated) {
        const result : authkeyResultMessage = {
            status: "error",
            message: "Failed to update settings.",
            authkey: EventHeader.authkey
            };
        logger.error("RES -> Failed to update settings" + " | " + getClientIp(req));
        return res.status(500).send(result);
    }

    const parts = req.body.name.includes('.') ? req.body.name.split('.') : [req.body.name];
    const mainConfigName = req.body.name.includes('.') ? `config.${parts.shift()}` : `config.${req.body.name}`;
    const configField = parts.length > 0 ? parts.pop() : req.body.name;
    const rootConfig = JSON.parse(JSON.stringify(app.get(mainConfigName))); // Deep copy
    let currentConfig = rootConfig;
    
    for (const part of parts) {
        if (currentConfig[part] === undefined) {
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
        await flushRedisCache();
        logger.debug("Purging cache");
    }

    const result : authkeyResultMessage = {
        status: "success",
        message: "Succesfully updated settings.",
        authkey: EventHeader.authkey
        };

    logger.info("RES -> Settings updated" + " | " + getClientIp(req));
    return res.status(200).send(result);
    
}

const getModuleData = async (req: Request, res: Response): Promise<Response> => {

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> getModuleData", req.hostname, "|", getClientIp(req));

    // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "updateSettings", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    // Check if the request has the required parameters
    if (!req.query.module) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
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
            logger.error("Error parsing filter: ", e);
            return res.status(400).send({"status": "error", "message": "Invalid filter"});
        }
    }

    logger.debug("module, offset, limit, order, search, sort, filter) : ", module, offset, limit, order, search, sort, filterObject);
 
    const data = await dbSelectModuleData(module,offset,limit,order,sort,search,filterObject);
    const returnMessage : moduleDataReturnMessage = {
        total: data.total,
        totalNotFiltered: data.totalNotFiltered,
        rows: data.rows,
        authkey: EventHeader.authkey
    }
    return res.status(200).send(returnMessage);

}

const getModuleCountData = async (req: Request, res: Response): Promise<Response> => {
    
    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> getModuleCountData", req.hostname, "|", getClientIp(req));

    // Check if authorization header is valid
    const EventHeader = await parseAuthHeader(req, "updateSettings", true);
    if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    // Check if the request has the required parameters
    if (!req.query.module || !req.query.action) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    const module : string = req.query.module as string;
    const action : string = req.query.action as string;
    const field : string = req.query.field as string;

    if (module == "payments" && action == "serverBalance") {
        return res.status(200).send({total: await getBalance(1000), authkey: EventHeader.authkey});
    }
    if (module == "payments" && action == "unpaidTransactions") {
        return res.status(200).send({total: await getUnpaidTransactionsBalance(), authkey: EventHeader.authkey});
    }
    if (module == "logger" && action == "countWarning") {
        return res.status(200).send({total: logHistory.length, authkey: EventHeader.authkey});
    }

    if (action == "monthCount") {
        const count = await dbCountMonthModuleData(module, field);
        return res.status(200).send({data: count, authkey: EventHeader.authkey});
    }

    if (field != "" && field != undefined && field != 'undefined') {
        const countField = await dbCountModuleData(module, field);
        const countTotal = await dbCountModuleData(module);
        return res.status(200).send({total: countTotal, field: countField, authkey: EventHeader.authkey});
    }
    
    const count = await dbCountModuleData(module);
    return res.status(200).send({total: count, authkey: EventHeader.authkey});

}

const moderateDBRecord = async (req: Request, res: Response): Promise<Response> => {
  
    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> moderateFile", req.hostname, "|", getClientIp(req));

    // Check if authorization header is valid
    const EventHeader = await parseAuthHeader(req, "updateSettings", true);
    if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    if (req.body.id === "" || req.body.id === null || req.body.id === undefined || req.body.filename === "" || req.body.filename === null || req.body.filename === undefined) {
        const result: authkeyResultMessage = {
            status: "error",
            message: "Invalid parameters",
            authkey: ""
        }
        return res.status(400).send(result);
    }

    logger.info(`Moderating file: ${req.body.filename}`);

    let returnURL = app.get("config.media")["returnURL"];
    returnURL != "" && returnURL != undefined
    ? returnURL = `${returnURL}/${req.body.filename}`
    : returnURL = `${"https://" + req.hostname}/media/${req.body.filename}`;

    const result = await moderateFile(returnURL);
    if (result.code == "NA"){
        const update = await dbUpdate('mediafiles','checked','1',['id'], [req.body.id]);
        if (!update) {
            return res.status(500).send({status: "error", message: "Failed to update record", authkey: EventHeader.authkey});
        }
    } 

    return res.status(200).send({status: "success", message: result.code, authkey: EventHeader.authkey});

}

const banDBRecord = async (req: Request, res: Response): Promise<Response> => {

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> banSource", req.hostname, "|", getClientIp(req));

    // Check if authorization header is valid
    const EventHeader = await parseAuthHeader(req, "updateSettings", true);
    if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}
    
    if (req.body.id === "" || 
        req.body.id === null || 
        req.body.id === undefined || 
        req.body.table === "" ||
        req.body.table === null ||
        req.body.table === undefined) {
            const result: authkeyResultMessage = {
                status: "error",
                message: "Invalid parameters",
                authkey: ""
            }
        return res.status(400).send(result);
    }

    if (req.body.reason === "" || req.body.reason === null || req.body.reason === undefined) {
        const result: authkeyResultMessage = {
            status: "error",
            message: "Reason cannot be empty",
            authkey: EventHeader.authkey
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
        logger.warn("RES -> Invalid table name" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    const banResult = await banRecord(req.body.id, table, req.body.reason);

    if (banResult.status == "error") {
        return res.status(500).send({status: "error", message: banResult.message, authkey: EventHeader.authkey});
    }

    return res.status(200).send({status: "success", message: banResult.message, authkey: EventHeader.authkey});
        
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
            banDBRecord         
        };