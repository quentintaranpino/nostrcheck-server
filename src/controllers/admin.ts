
import { Request, Response } from "express";
import config from "config";

import { logger } from "../lib/logger.js";
import { getClientIp, format } from "../lib/server.js";
import { ResultMessagev2, ServerStatusMessage } from "../interfaces/server.js";
import { checkAuthkey, generateCredentials, isPubkeyAllowed, isUserAllowed } from "../lib/authorization.js";
import { sendMessage } from "../lib/nostr/NIP04.js";
import { dbDelete, dbInsert, dbSelect, dbUpdate } from "../lib/database.js";
import { allowedFieldNames, allowedFieldNamesAndValues, allowedTableNames } from "../interfaces/admin.js";
import { registeredTableFields } from "../interfaces/database.js";

let hits = 0;
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

const StopServer = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request is authorized
    const authorized = await checkAuthkey(req.headers.authorization);
    if ( !authorized) {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Unauthorized"
            };
        logger.error("RES -> Unauthorized" + " | " + getClientIp(req));
        return res.status(401).send(result);
    }

    logger.warn("RES -> 200 Stopping server from IP:", getClientIp(req));
    let result : ResultMessagev2 = {
        status: "success",
        message: "Stopping server..."
        };
    res.status(200).json(result);
    process.exit(0);
};

const updateDBRecord = async (req: Request, res: Response): Promise<Response> => {

    logger.info("REQ -> updateDBRecord", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');

    // Check header has authorization token
    const authorized = await checkAuthkey(req.headers.authorization)
    if ( !authorized) {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Unauthorized"
            };
        logger.error("RES -> Unauthorized" + " | " + getClientIp(req));
        return res.status(401).send(result);
    }
    
    // Check if the request has the required parameters
     if (!req.body.table || !req.body.field || req.body.value === undefined || req.body.value === null || !req.body.id) {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    // Fon't show the user the real table names
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
            let result : ResultMessagev2 = {
                status: "error",
                message: "Invalid table name or field name"
            };
            logger.warn("RES -> Invalid table name or field name" + " | " + getClientIp(req));
            return res.status(400).send(result);
    }

    // Check if the provided value is empty
    if (req.body.value === "" && req.body.field != "comments" || req.body.value === null || req.body.value === undefined){
        let result : ResultMessagev2 = {
            status: "error",
            message: req.body.field + " cannot be empty."
            };
        logger.warn("RES -> Value is empty: " + req.body.field +  " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    // Update table with new value
    const update = await dbUpdate(table, req.body.field, req.body.value, "id", req.body.id);
    if (update) {
        let result : ResultMessagev2 = {
            status: "success",
            message: req.body.value
            };
        logger.info("RES -> Record updated" + " | " + getClientIp(req));
        return res.status(200).send(result);
    } else {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Failed to update record"
            };
        logger.error("RES -> Failed to update record" + " | " + getClientIp(req));
        return res.status(500).send(result);
    }
}

const resetUserPassword = async (req: Request, res: Response): Promise<Response> => {
   
    logger.info("REQ -> reset user password", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');
    
    // Check header has authorization token
    const authorized = await checkAuthkey(req.headers.authorization)
    if ( !authorized) {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Unauthorized"
            };
        logger.error("RES -> Unauthorized" + " | " + getClientIp(req));
        return res.status(401).send(result);
    }

    // Check if the request has the required parameters
    if (!req.body.pubkey) {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    const newPass = await generateCredentials('password',req.body.pubkey)
    if (newPass == "") {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Failed to generate new password"
            };
        logger.error("RES -> Failed to generate new password" + " | " + getClientIp(req));
        return res.status(500).send(result);
    }

    // Send new password to pubkey
    try{
        await sendMessage("Your new password: ",req.body.pubkey);
        await sendMessage(newPass,req.body.pubkey);
        let result : ResultMessagev2 = {
            status: "success",
            message: "New password generated for " + req.body.pubkey
            };
        logger.info("RES -> New password sent to " + req.body.pubkey);
        return res.status(200).send(result);

    }catch (error) {
        logger.error(error);
        let result : ResultMessagev2 = {
            status: "error",
            message: "Failed to send DM to " + req.body.pubkey + " with new password."
            };
        return res.status(500).send(result);
    }
};

const adminLogin = async (req: Request, res: Response): Promise<Response> => {

    logger.info("POST /api/v1/login", "|", getClientIp(req));

    if ((req.body.pubkey == "" && req.body.username) || (req.body.pubkey == "" && req.body.password == "")){
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
        logger.warn("No credentials used to login. Refusing", getClientIp(req));
        return res.status(401).send(false);
    }

    // Set session maxAge
    if (req.body.rememberMe == "true"){
        req.session.cookie.maxAge = config.get('session.maxAge');
    }

    let allowed = false;

    if (req.body.pubkey != undefined){
        allowed = await isPubkeyAllowed(req);
    };
    if (req.body.username != undefined && req.body.password != undefined){
        allowed = await isUserAllowed(req.body.username, req.body.password);
        req.body.pubkey = await dbSelect("SELECT hex FROM registered WHERE username = ?", "hex", [req.body.username], registeredTableFields);
    };
    if (!allowed) {
        logger.warn(`RES -> 401 unauthorized  - ${req.body.pubkey}`,"|",getClientIp(req));
        return res.status(401).send(false);
    }

    // Set session identifier and generate authkey
    req.session.identifier = req.body.pubkey;
    req.session.authkey = await generateCredentials('authkey',req.body.pubkey);

    if (req.session.authkey == ""){
        logger.error("Failed to generate authkey for", req.session.identifier);
        return res.status(500).send(false);
    }

    logger.info("logged in as", req.session.identifier, " - ", getClientIp(req));
    return res.status(200).send(true);

    
};


const deleteDBRecord = async (req: Request, res: Response): Promise<Response> => {

    logger.info("REQ -> deleteDBRecord", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');

    // Check header has authorization token
    const authorized = await checkAuthkey(req.headers.authorization)
    if ( !authorized) {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Unauthorized"
            };
        logger.error("RES -> Unauthorized" + " | " + getClientIp(req));
        return res.status(401).send(result);
    }

    // Check if the request has the required parameters
    if (!req.body.table || !req.body.id) {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

      // Verify that table is a string
      if (typeof req.body.table !== 'string') {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table parameter"
        };
        logger.error("RES -> Invalid table parameter" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    // Verify that id is a number
    if (typeof req.body.id !== 'number') {
        let result : ResultMessagev2 = {
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
        let result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table name"
        };
        logger.warn("RES -> Invalid table name" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    // Delete record from table
    const deletedRecord = await dbDelete(table, 'id', req.body.id);
    if(deletedRecord){
        let result : ResultMessagev2 = {
            status: "success",
            message: "Record deleted succesfully"
            };
        logger.info("RES -> Record deleted - id: " + req.body.id + " from table: " + table + " | " + getClientIp(req));
        return res.status(200).send(result);
    } else {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Failed to delete record"
            };
        logger.error("RES -> Failed to delete record" + " | " + getClientIp(req));
        return res.status(500).send(result);
    }
}

const insertDBRecord = async (req: Request, res: Response): Promise<Response> => {

    logger.info("REQ -> insertDBRecord", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');

    // Check header has authorization token
    const authorized = await checkAuthkey(req.headers.authorization)
    if ( !authorized) {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Unauthorized"
            };
        logger.error("RES -> Unauthorized" + " | " + getClientIp(req));
        return res.status(401).send(result);
    }

    // Check if the request has the required parameters
    if (!req.body.table || !req.body.row) {
        let result : ResultMessagev2 = {
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
        let result : ResultMessagev2 = {
            status: "error",
            message: "Invalid table name or field name"
        };
        return res.status(400).send(result);
    }

    // Remove id from row object
    delete req.body.row["id"];

    // Update req.body.row (field date) with current date in mysql format
    req.body.row["date"] = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // If table is 'registered', we generate a new password and insert it into row object
    if (req.body.table == "nostraddressData"){
        req.body.row["password"] = await generateCredentials('password');
        if (req.body.row["password"] == "") {
            let result : ResultMessagev2 = {
                status: "error",
                message: "Failed to generate new password"
                };
            logger.error("RES -> Failed to generate new password" + " | " + getClientIp(req));
            return res.status(500).send(result);
        }
    }
    
    // Insert records into table
    const insert = await dbInsert(table, Object.keys(req.body.row), Object.values(req.body.row));
    if (insert === 0) {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Failed to insert records"
            };
        logger.error("RES -> Failed to insert records" + " | " + getClientIp(req));
        return res.status(500).send(result);
    }

    let result : ResultMessagev2 = {
        status: "success",
        message: insert.toString()
        };

    logger.info("RES -> Records inserted" + " | " + getClientIp(req));
    return res.status(200).send(result);
}

export { serverStatus, StopServer, resetUserPassword, adminLogin, updateDBRecord, deleteDBRecord, insertDBRecord};