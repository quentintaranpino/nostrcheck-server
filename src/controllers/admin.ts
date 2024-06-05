
import { Request, Response } from "express";
import fs from "fs";
import sharp from "sharp";

import app from "../app.js";

import { logger } from "../lib/logger.js";
import { getClientIp, format } from "../lib/utils.js";
import { ResultMessagev2, ServerStatusMessage, authkeyResultMessage } from "../interfaces/server.js";
import { generateCredentials } from "../lib/authorization.js";
import { dbDelete, dbInsert, dbUpdate } from "../lib/database.js";
import { allowedFieldNames, allowedFieldNamesAndValues, allowedTableNames } from "../interfaces/admin.js";
import { parseAuthHeader} from "../lib/authorization.js";
import { isModuleEnabled, updateLocalConfigKey } from "../lib/config.js";
import { flushRedisCache } from "../lib/redis.js";
import { ParseFileType } from "../lib/media.js";
import { npubToHex } from "../lib/nostr/NIP19.js";
import { payInvoiceFromExpenses } from "../lib/payments/core.js";

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
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
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
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> StopServer", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');
    
    // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req,"StopServer", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    logger.warn("RES -> 200 Stopping server from IP:", getClientIp(req));
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
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
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
    let table = req.body.table;
    if (req.body.table == "nostraddressData") {table = "registered";}
    if (req.body.table == "mediaData") {table = "mediafiles";}
    if (req.body.table == "lightningData") {table = "lightning";}
    if (req.body.table == "domainsData") {table = "domains";}

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
    const update = await dbUpdate(table, req.body.field, req.body.value, "id", req.body.id);
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
    return res.status(400).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.debug("POST /api/v2/admin/updatelogo", "|", getClientIp(req));

     // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "updateDBRecord", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    if (!req.files || req.files == undefined || req.files.length == 0) {
        // Check if is server.logo.default for restoring default logo
        try {
            await fs.promises.copyFile('./src/pages/static/resources/navbar-logo.default.webp', './src/pages/static/resources/navbar-logo.webp');
            logger.info("RES -> Default logo restored" + " | " + getClientIp(req));
            return res.status(200).send({status: "success", message: "Default logo restored", authkey: EventHeader.authkey});
        } catch (error) {
            logger.error("RES -> Failed to restore default logo" + " | " + getClientIp(req));
            return res.status(500).send({status: "error", message: "Failed to restore default logo", authkey: EventHeader.authkey});
        }
    }

    let file: Express.Multer.File | null = null;
	if (Array.isArray(req.files) && req.files.length > 0) {
		file = req.files[0];
	}

    if (!file) {
		logger.warn(`RES -> 400 Bad request - Empty file`, "|", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Empty file", "authkey": EventHeader.authkey});
	}

	file.mimetype = await ParseFileType(req, file);
	if (file.mimetype === "") {
		logger.error(`RES -> 400 Bad request - `, file.mimetype, ` filetype not detected`, "|", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "file type not detected or not allowed", "authkey": EventHeader.authkey});
	}


    await sharp(file.buffer)
    .resize(150, 51, { fit: sharp.fit.cover })
    .webp({ quality: 95 })
    .toBuffer()
    .then( async data => { 
        await fs.promises.writeFile('./src/pages/static/resources/navbar-logo.webp', data);
        logger.info("RES -> Logo updated" + " | " + getClientIp(req));
    })
    .catch( err => { 
        logger.error("RES -> Error updating logo" + " | " + err);
        return res.status(500).send({"status": "error", "message": "Error updating logo", "authkey": EventHeader.authkey});
     });

     return res.status(200).send({"status": "success", "message": "Logo updated", "authkey": EventHeader.authkey});

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
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
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

    const newPass = await generateCredentials('password',false, req.body.pubkey, true)
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
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
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
    let table = req.body.table;
    if (req.body.table == "nostraddressData") {table = "registered";}
    if (req.body.table == "mediaData") {table = "mediafiles";}
    if (req.body.table == "lightningData") {table = "lightning";}
    if (req.body.table == "domainsData") {table = "domains";}

    // Define a list of allowed table names
    const allowedTableNames = ["registered", "mediafiles", "lightning", "domains"];

    logger.debug("table: ", table, " | id: ", req.body.id)

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
 * Pays an item from the expenses account.
 * 
 * @param req - The request object.
 * @param res - The response object.
 * @returns A promise that resolves to the response object.
 */
const payDBRecord = async (req: Request, res: Response): Promise<Response> => {

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> payItem", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');

     // Check if authorization header is valid
    const EventHeader = await parseAuthHeader(req, "payItem", true);
    if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    // Check if the request has the required parameters
    if (req.body.transactionid === undefined || req.body.transactionid === null) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    const payTransaction = await payInvoiceFromExpenses(req.body.transactionid)
    if (payTransaction) {
        const result : authkeyResultMessage = {
            status: "success",
            message: "Item paid",
            authkey: EventHeader.authkey
            };
        logger.info("RES -> Item paid" + " | " + getClientIp(req));
        return res.status(200).send(result);
    }
    return res.status(500).send({"status": "error", "message": "Failed to pay item", "authkey": EventHeader.authkey});
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
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
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
    let table = req.body.table;
    if (req.body.table == "nostraddressData") {table = "registered";}
    if (req.body.table == "mediaData") {table = "mediafiles";}
    if (req.body.table == "lightningData") {table = "lightning";}
    if (req.body.table == "domainsData") {table = "domains";}

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

    // Check if the provided pubkey is valid
    let decodedHex = await npubToHex(req.body.row["pubkey"]);
    if (decodedHex != req.body.row["hex"]){
        const result : authkeyResultMessage = {
            status: "error",
            message: "Invalid npub / hex",
            authkey: EventHeader.authkey
            };
        logger.error("RES -> Invalid pubkey" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    req.body.row["date"] = new Date().toISOString().slice(0, 19).replace('T', ' ');
    req.body.row["password"] = await generateCredentials('password'); // Generate a random password only for user creation (can't be empty) the we recreate it in the next step
    
    }

    // Insert records into the table
    const insert = await dbInsert(table, Object.keys(req.body.row), Object.values(req.body.row));
    if (insert === 0) {
        const result : authkeyResultMessage = {
            status: "error",
            message: "Failed to insert records",
            authkey: EventHeader.authkey
            };
        logger.error("RES -> Failed to insert records" + " | " + getClientIp(req));
        return res.status(500).send(result);
    }

    // If table is 'registered', we generate a new password and insert it into new created record. Then we send it to the user via DM
    if (req.body.table == "nostraddressData"){
        const newPass = await generateCredentials('password', false, req.body.row["hex"], true)
        if (newPass == "") {
            const result : authkeyResultMessage = {
                status: "error",
                message: "Failed to generate new password",
                authkey: EventHeader.authkey
                };
            logger.error("RES -> Failed to generate new password" + " | " + getClientIp(req));
            return res.status(500).send(result);
        }
        logger.debug(newPass)
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
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> updateSettings", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');

     // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "updateSettings", true);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    if (req.body.name === "" || req.body.name === null || req.body.name === undefined || req.body.value === "" || req.body.value === null || req.body.value === undefined) {
        // return error 
        const result: authkeyResultMessage = {
            status: "error",
            message: "Invalid parameters",
            authkey: ""
        }
        return res.status(400).send(result);
    }

    let updated = await updateLocalConfigKey(req.body.name, req.body.value);
    if (!updated) {
        const result : authkeyResultMessage = {
            status: "error",
            message: "Failed to update settings.",
            authkey: EventHeader.authkey
            };
        logger.error("RES -> Failed to update settings" + " | " + getClientIp(req));
        return res.status(500).send(result);
    }

    let parts = req.body.name.includes('.') ? req.body.name.split('.') : [req.body.name];
    let mainConfigName = req.body.name.includes('.') ? `config.${parts.shift()}` : `config.${req.body.name}`;
    let configField = parts.length > 0 ? parts.pop() : req.body.name;
    let rootConfig = JSON.parse(JSON.stringify(app.get(mainConfigName))); // Deep copy
    let currentConfig = rootConfig;
    
    for (let part of parts) {
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
        let result = await flushRedisCache();
        logger.debug("Purging cache", result);
    }

    const result : authkeyResultMessage = {
        status: "success",
        message: "Succesfully updated settings.",
        authkey: EventHeader.authkey
        };

    logger.info("RES -> Settings updated" + " | " + getClientIp(req));
    return res.status(200).send(result);
    
}

export { serverStatus, StopServer, resetUserPassword, updateDBRecord, deleteDBRecord, insertDBRecord, updateSettings, updateLogo, payDBRecord};