
import { Request, Response } from "express";

import { logger } from "../lib/logger.js";
import { getClientIp, format } from "../lib/server.js";
import { ResultMessagev2, ServerStatusMessage } from "../interfaces/server.js";
import { IsAdminAuthorized, generateAuthKey, isPubkeyAllowed } from "../lib/authorization.js";
import { sendMessage } from "../lib/nostr/NIP04.js";
import { connect } from "../lib/database.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
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

    if (!req.body.pubkey) {
        let result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    // Update registered table with new password
    const newPass = crypto.randomBytes(20).toString('hex');
    const saltRounds = 10
    const hashPass = await bcrypt.genSalt(saltRounds).then(salt => {return bcrypt.hash(newPass, salt).catch(err => {logger.error(err)})});

    const conn = await connect("resetUserPassword");
    try {
        await conn.query("UPDATE registered SET password = ? WHERE hex = ?", [hashPass, req.body.pubkey]);
        conn.end();
    } catch (error) {
        logger.error(error);
        conn.end();
        let result : ResultMessagev2 = {
            status: "error",
            message: "Failed to update password"
            };
        return res.status(500).send(result);
    }

    //send new password to pubkey
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


export { serverStatus, StopServer, resetUserPassword, adminLogin};