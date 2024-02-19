
import { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { getClientIp, format } from "../lib/server.js";
import { ResultMessagev2, ServerStatusMessage, authkeyResultMessage } from "../interfaces/server.js";
import { generateCredentials } from "../lib/authorization.js";
import { dbDelete, dbInsert, dbUpdate } from "../lib/database.js";
import { allowedFieldNames, allowedFieldNamesAndValues, allowedTableNames } from "../interfaces/admin.js";
import { parseAuthHeader} from "../lib/authorization.js";
import { updateLocalConfigKey } from "../lib/config.js";
import app from "../app.js";

let hits = 0;
/**
 * Retrieves the server status.
 * 
 * @param req - The request object.
 * @param res - The response object.
 * @returns A promise that resolves to the server status response.
 */
const serverStatus = async (req: Request, res: Response): Promise<Response> => {
	
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
        
    logger.debug("test no")
        const result : ResultMessagev2 = {
            status: "error",
            message: "Failed to update record"
            };
        logger.error("RES -> Failed to update record" + " | " + getClientIp(req));
        return res.status(500).send(result);
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
    const deletedRecord = await dbDelete(table, 'id', req.body.id);
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

    let updated = await updateLocalConfigKey(req.body.name, req.body.value.toString());
    if (!updated) {
        const result : authkeyResultMessage = {
            status: "error",
            message: "Failed to update settings.",
            authkey: EventHeader.authkey
            };
        logger.error("RES -> Failed to update settings" + " | " + getClientIp(req));
        return res.status(500).send(result);
    }

    app.set(req.body.name, req.body.value.toString());

    const result : authkeyResultMessage = {
        status: "success",
        message: "Succesfully updated settings.",
        authkey: EventHeader.authkey
        };

    logger.info("RES -> Settings updated" + " | " + getClientIp(req));
    return res.status(200).send(result);
    
}

export { serverStatus, StopServer, resetUserPassword, updateDBRecord, deleteDBRecord, insertDBRecord, updateSettings};