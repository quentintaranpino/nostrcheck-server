import { Request, Response } from "express";
import fs from "fs";
import config from "config";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { getClientIp, markdownToHtml } from "../lib/server.js";
import { dbSelect, dbSelectModuleData} from "../lib/database.js";
import { generateCredentials, isPubkeyValid, isUserPasswordValid } from "../lib/authorization.js";
import { registeredTableFields } from "../interfaces/database.js";
import { isModuleEnabled } from "../lib/config.js";
import { getProfileMetadata } from "../lib/nostr/core.js";
import { hextoNpub } from "../lib/nostr/NIP19.js";
import { logHistory } from "../lib/logger.js";

const loadDashboardPage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
		logger.warn("RES -> Module is not enabled" + " | " + getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/dashboard", "|", getClientIp(req));

    req.body.version = app.get("version");
    const availableModules = Object.entries(app.get("config.server")["availableModules"]);
    for (const [key] of availableModules) {
        if(app.get("config.server")["availableModules"][key]["enabled"] == true){
            let data = await dbSelectModuleData(key);
            if (data != undefined && data != null && data != ""){
                req.body[key + "Data"] = data;
            }
        }
    }

    req.session.authkey = await generateCredentials('authkey', false, req.session.identifier);
    res.render("dashboard.ejs", {request: req});
};

const loadSettingsPage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
		logger.warn("RES -> Module is not enabled" + " | " + getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

    logger.info("GET /api/" + version + "/settings", "|", getClientIp(req));

    req.body.version = app.get("version");
    req.body.availableModules = app.get("config.server")["availableModules"];
    req.body.settingServerPubkey = app.get("config.server")["pubkey"];
    req.body.settingServerSecretkey =  app.get("config.server")["secretKey"];
    req.body.settingsMedia = app.get("config.media");
    req.body.settingsLogger = app.get("config.logger");
    req.body.logHistory = logHistory;
    req.session.authkey = await generateCredentials('authkey', false, req.session.identifier);
    
    res.render("settings.ejs", {request: req});
};

const loadTosPage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
		logger.warn("RES -> Module is not enabled" + " | " + getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/tos", "|", getClientIp(req));

    req.body.version = app.get("version");
    let tosFile = markdownToHtml(fs.readFileSync(config.get("server.tosFilePath")).toString());
    tosFile = tosFile.replace(/\[SERVERADDRESS\]/g, app.get("config.server")["host"]);
    
    res.render("tos.ejs", {request: req, tos: tosFile });
};

const loadLoginPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
		logger.warn("RES -> Module is not enabled" + " | " + getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/login", "|", getClientIp(req));

    req.body.version = app.get("version");
    res.render("login.ejs", {request: req});
};

const loadIndexPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
		logger.warn("RES -> Module is not enabled" + " | " + getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/index", "|", getClientIp(req));

    req.body.version = app.get("version");
    req.body.APIversion = version;
    req.body.serverHost = app.get("config.server")["host"];
    const availableModules = Object.entries(app.get("config.server")["availableModules"]);
     req.body.activeModules = [];
    for (const [key] of availableModules) {
        if(app.get("config.server")["availableModules"][key]["enabled"] == true){
            req.body.activeModules.push(app.get("config.server")["availableModules"][key]);
        }
    }
    
    req.body.serverPubkey = await hextoNpub(app.get("config.server")["pubkey"]);
    res.render("index.ejs", {request: req});
};

const loadDocsPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
		logger.warn("RES -> Module is not enabled" + " | " + getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/index", "|", getClientIp(req));

    req.body.version = app.get("version");
    req.body.APIversion = version;
    const availableModules = Object.entries(app.get("config.server")["availableModules"]);
     req.body.activeModules = [];
    for (const [key] of availableModules) {
        if(app.get("config.server")["availableModules"][key]["enabled"] == true){
            req.body.activeModules.push(app.get("config.server")["availableModules"][key]);
        }
    }
    
    req.body.serverPubkey = await hextoNpub(app.get("config.server")["pubkey"]);
    res.render("documentation.ejs", {request: req});
};

const frontendLogin = async (req: Request, res: Response): Promise<Response> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
		logger.warn("RES -> Module is not enabled" + " | " + getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

    logger.info("POST /api/v2/login", "|", getClientIp(req));

    if ((req.body.pubkey === "" || req.body.pubkey == undefined) && (req.body.username === '' || req.body.password === '')){
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
        logger.warn("No credentials used to login. Refusing", getClientIp(req));
        return res.status(401).send(false);
    }

    // Set session maxAge
    if (req.body.rememberMe == "true"){req.session.cookie.maxAge = config.get('session.maxAge');}

    let canLogin = false;
    if (req.body.pubkey != undefined){
        canLogin = await isPubkeyValid(req, false);
    }
    if (req.body.username != undefined && req.body.password != undefined){
        canLogin = await isUserPasswordValid(req.body.username, req.body.password);
        if (canLogin){req.body.pubkey = await dbSelect("SELECT hex FROM registered WHERE username = ?", "hex", [req.body.username], registeredTableFields)}
    }
    if (!canLogin) {
        logger.warn(`RES -> 401 unauthorized  - ${req.body.pubkey}`,"|",getClientIp(req));
        return res.status(401).send(false);
    }

    // Set session identifier and generate authkey
    req.session.identifier = req.body.pubkey;
    req.session.authkey = await generateCredentials('authkey', false, req.body.pubkey);

    if (req.session.authkey == ""){
        logger.error("Failed to generate authkey for", req.session.identifier);
        return res.status(500).send(false);
    }


    // User metadata from nostr
    const metadata = await getProfileMetadata(req.session.identifier);
    logger.debug("Metadata for", req.session.identifier, ":", metadata);
    req.session.metadata = metadata;

    logger.info("logged in as", req.session.identifier, " - ", getClientIp(req));
    return res.status(200).send(true);
    
};

export {loadDashboardPage, loadSettingsPage, loadTosPage, loadDocsPage, loadLoginPage, loadIndexPage, frontendLogin};