
import { Request, Response } from "express";

import { logger } from "../lib/logger.js";
import { getClientIp, format } from "../lib/server.js";
import { ResultMessagev2, ServerStatusMessage } from "../interfaces/server.js";
import { IsAdminAuthorized, generateAuthKey, generateNewPassword, isPubkeyAllowed } from "../lib/authorization.js";
import { sendMessage } from "../lib/nostr/NIP04.js";
import { connect, dbSelect, dbUpdate } from "../lib/database.js";
import config from "config";
import { verifyNIP07login } from "../lib/nostr/NIP07.js";

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
    const authorized = await IsAdminAuthorized(req.headers.authorization);
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
    const authorized = await IsAdminAuthorized(req.headers.authorization)
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

    // Define a list of allowed table names and field names
    const allowedTableNames = ["registered", "mediafiles", "lightning", "domains"];
    const allowedFieldNames = ["allowed", "active", "visibility", "comments", "username", "pubkey", "hex", "domain", "checked"]; 

    const allowedFieldNamesAndValues = [
        {field: "allowed", values: [0, 1]},
        {field: "active", values: [0, 1]},
        {field: "visibility", values: [0, 1]},
        {field: "checked", values: [0, 1]},
        {field: "comments", values: ["string"]},
        {field: "username", values: ["string"]},
        {field: "pubkey", values: ["string"]},
        {field: "hex", values: ["string"]},
        {field: "domain", values: ["string"]}
    ];

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
    const authorized = await IsAdminAuthorized(req.headers.authorization)
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

    // Generate new password
    const newPass = await generateNewPassword();
    if (newPass == "") {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Failed to generate new password"
            };
        logger.error("RES -> Failed to generate new password" + " | " + getClientIp(req));
        return res.status(500).send(result);
    }

    // Update password in database
    let update = await dbUpdate("registered", "password", newPass, "hex", req.body.pubkey);
    if (!update) {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Failed to update password"
            };
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

    if (req.body.pubkey == "" && req.body.password == ""){
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
        logger.warn("No credentials used to login. Refusing", getClientIp(req));
        return res.status(401).send(false);
    }

    // Set session maxAge
    if (req.body.rememberMe == "true"){

        req.session.cookie.maxAge = config.get('session.maxAge');
        logger.debug("Remember me is true, max age:", req.session.cookie.maxAge);
    }

    // NIP07 login
    if (req.body.pubkey != undefined){
        // Check if pubkey is allowed to login
        const allowed = await isPubkeyAllowed(req.body.pubkey);
        if (!allowed) {
            logger.warn(`RES -> 401 unauthorized  - ${req.body.pubkey}`,"|",getClientIp(req));
            return res.status(401).send(false);
        }

        // Check if NIP07 credentials are correct
        let result = await verifyNIP07login(req);
        if (!result){return res.status(401).send(false);}

        // Set session identifier and generate authkey
        req.session.identifier = req.body.pubkey;
        req.session.authkey = await generateAuthKey(req.body.pubkey);

        if (req.session.authkey == ""){
            logger.error("Failed to generate authkey for", req.session.identifier);
            return res.status(500).send(false);
        }

        logger.info("logged in as", req.session.identifier, " - ", getClientIp(req));
        return res.status(200).send(true);
    }

    // Legacy login
    if (req.body.password != "" && req.body.password == config.get('server.adminPanel.legacyPassword')){
        req.session.identifier = "legacyLogin";
        req.session.authkey = config.get('server.adminPanel.legacyPassword');
        logger.info("logged in as", req.session.identifier, " - ", getClientIp(req));
        return res.status(200).send(true);
    }

    logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
    return res.status(401).send(false);
};


export { serverStatus, StopServer, resetUserPassword, adminLogin, updateDBRecord};