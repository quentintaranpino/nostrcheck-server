import { Request, Response } from "express";
import fs from "fs";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { getClientIp, markdownToHtml } from "../lib/utils.js";
import { dbSelect} from "../lib/database.js";
import { generateCredentials, isAuthkeyValid, isPubkeyAllowed, isPubkeyValid, isUserPasswordValid } from "../lib/authorization.js";
import { isModuleEnabled, loadconfigActiveModules } from "../lib/config.js";
import { getProfileNostrMetadata, getProfileLocalMetadata, getProfileNostrNotes } from "../lib/frontend.js";
import { hextoNpub } from "../lib/nostr/NIP19.js";
import { logHistory } from "../lib/logger.js";
import themes from "../interfaces/themes.js";
import { verifyNIP07event } from "../lib/nostr/NIP07.js";

const loadDashboardPage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/dashboard", "|", getClientIp(req));

    const activeModules = loadconfigActiveModules(app).map((module) => module[0]);

    // Active modules
    req.body.activeModules = activeModules; 

    // Logger history greater or equal to 4 (warn)
    req.body.logHistory = logHistory.length != 0 ? JSON.stringify(logHistory).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'") : [0];
    activeModules.push("logHistory");

    req.body.version = app.get("version");
    req.body.serverHost = app.get("config.server")["host"];
    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    // User metadata from nostr
    req.session.metadata = await getProfileNostrMetadata(req.session.identifier);

    // Check admin privileges. Only for information, never used for authorization
    req.session.metadata.allowed = await isPubkeyAllowed(req.body.pubkey || req.session.identifier);

    res.render("dashboard.ejs", {request: req});
};

const loadSettingsPage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

    logger.info("GET /api/" + version + "/settings", "|", getClientIp(req));

    req.body.version = app.get("version");
    req.body.serverHost = app.get("config.server")["host"];
    req.body.availableModules = app.get("config.server")["availableModules"];
    req.body.settingsEnvironment = app.get("config.environment");
    req.body.settingsServerHost = app.get("config.server")["host"];
    req.body.settingServerPubkey = app.get("config.server")["pubkey"];
    req.body.settingServerSecretkey =  app.get("config.server")["secretKey"];
    req.body.settingsRedisExpireTime = app.get("config.redis")["expireTime"];
    req.body.settingsStorage = app.get("config.storage");
    req.body.settingsMedia = app.get("config.media");
    req.body.settingsPayments = app.get("config.payments");
    req.body.settingsRegister = app.get("config.register");
    req.body.settingsLogger = app.get("config.logger");
    req.body.logHistory = logHistory;
    req.body.settingsLookAndFeelThemes = themes;
    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    // User metadata from nostr
    req.session.metadata = await getProfileNostrMetadata(req.session.identifier);

    // Check admin privileges. Only for information, never used for authorization
    req.session.metadata.allowed = await isPubkeyAllowed(req.body.pubkey || req.session.identifier);
    
    res.render("settings.ejs", {request: req});
};

const loadProfilePage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/profile", "|", getClientIp(req));

    req.body.version = app.get("version");
    req.body.serverHost = app.get("config.server")["host"];
    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    // User metadata from nostr
    req.session.metadata = await getProfileNostrMetadata(req.session.identifier);

    // User nostr notes
    req.session.metadata.nostr_notes = await getProfileNostrNotes(req.session.identifier);

    // User metadata from local database
    req.session.metadata.mediaFiles =  await getProfileLocalMetadata(req.session.identifier);

    // Check admin privileges. Only for information, never used for authorization
    req.session.metadata.allowed = await isPubkeyAllowed(req.body.pubkey || req.session.identifier);

    res.render("profile.ejs", {request: req});
};

const loadTosPage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/tos", "|", getClientIp(req));

    req.body.version = app.get("version");
    req.body.serverHost = app.get("config.server")["host"];
    let tosFile : string = "";
    try{
        tosFile = fs.readFileSync(app.get("config.server")["tosFilePath"]).toString();
        tosFile = markdownToHtml(fs.readFileSync(app.get("config.server")["tosFilePath"]).toString());
        tosFile = tosFile.replace(/\[SERVERADDRESS\]/g, app.get("config.server")["host"]);
    }catch(e){
        logger.error("Failed to read tos file", e);
        tosFile = "Failed to read tos file. Please contact the server administrator."
    }

    req.session.authkey = await generateCredentials('authkey', req.session.identifier);
    
    res.render("tos.ejs", {request: req, tos: tosFile });
};

const loadLoginPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/login", "|", getClientIp(req));

    req.body.version = app.get("version");
    req.body.serverHost = app.get("config.server")["host"];

    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    res.render("login.ejs", {request: req});
};

const loadIndexPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/index", "|", getClientIp(req));

    req.body.version = app.get("version");
    req.body.serverHost = app.get("config.server")["host"];
    req.body.serverPubkey = await hextoNpub(app.get("config.server")["pubkey"]);

    req.session.authkey = await generateCredentials('authkey', req.session.identifier);
    
    res.render("index.ejs", {request: req});
};

const loadDocsPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/documentation", "|", getClientIp(req));

    const availableModules = Object.entries(app.get("config.server")["availableModules"]);
     req.body.activeModules = [];
    for (const [key] of availableModules) {
        if(app.get("config.server")["availableModules"][key]["enabled"] == true){
            req.body.activeModules.push(app.get("config.server")["availableModules"][key]);
        }
    }

    logger.debug(req.session.metadata)
    
    req.body.version = app.get("version");
    req.body.serverHost = app.get("config.server")["host"];
    req.body.serverPubkey = await hextoNpub(app.get("config.server")["pubkey"]);

    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    res.render("documentation.ejs", {request: req});
};

const loadGalleryPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/gallery", "|", getClientIp(req));

    req.body.version = app.get("version");
    req.body.serverHost = app.get("config.server")["host"];

    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    res.render("gallery.ejs", {request: req});
};

const loadRegisterPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/register", "|", getClientIp(req));

    req.body.version = app.get("version");
    req.body.serverHost = app.get("config.server")["host"];

    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    res.render("register.ejs", {request: req});
};

const loadMediaPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
    if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("GET /api/" + version + "/media", "|", getClientIp(req));

    req.body.version = app.get("version");
    req.body.serverHost = app.get("config.server")["host"];

    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    res.render("media.ejs", {request: req});
};

const frontendLogin = async (req: Request, res: Response): Promise<Response> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

    logger.info("POST /api/v2/login", "|", getClientIp(req));

    // Check if secureCookie is true and if the request is not secure
    if (req.session.cookie.secure && !req.secure) {
        logger.warn("Attempt to access a secure session over HTTP:","|","IP:", getClientIp(req));
        return res.status(400).send(false);
    }

    // OTC code request and return.
    if (req.params.param1 && req.params.param1.length <= 64) {
        const OTC = await generateCredentials('otc', req.params.param1, true, true)
        if (OTC) {
            logger.info("One-time code generated for", req.params.param1, "|", getClientIp(req));
            return res.status(200).send(true);
        } else {
            logger.warn("Failed to generate one-time code for", req.params.param1, "|", getClientIp(req));
            return res.status(401).send(false);
        }
    }

    if ((req.body.pubkey === "" || req.body.pubkey == undefined) && (req.body.username === '' || req.body.password === '')){
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
        logger.info("No credentials used to login. Refusing", getClientIp(req));
        return res.status(401).send(false);
    }

    const rememberMe = req.body.rememberMe || (Array.isArray(req.body.tags) ? req.body.tags.find((tag: string[]) => tag[0] === "cookie")?.[1] : "false");
    if (rememberMe == "true"){req.session.cookie.maxAge = app.get("config.session")["maxAge"];}

    let canLogin = false;
    if (req.body.pubkey != undefined){
        canLogin = await isPubkeyValid(req.session.identifier || req.body.pubkey, false, true);
    }
    if (req.body.username != undefined && req.body.password != undefined){
        canLogin = await isUserPasswordValid(req.body.username, req.body.password, false);
    }
    if (req.body.OTC != undefined){
        const result = await isAuthkeyValid(req.body.OTC);
        if(result.status = 'success'){
            req.body.pubkey = result.pubkey;
            canLogin = true;
        }
    }
    if (req.body.pubkey != undefined){
        canLogin = await verifyNIP07event(req);
    }
    if (!canLogin) {
        logger.warn(`RES -> 401 unauthorized  - ${req.body.pubkey}`,"|",getClientIp(req));
        return res.status(401).send(false);
    }

    if (req.body.pubkey == '' || req.body.pubkey == undefined){
        req.body.pubkey = await dbSelect("SELECT hex FROM registered WHERE username = ?", "hex", [req.body.username]) as string;
    }

    // Set session identifier and generate authkey
    req.session.identifier = req.body.pubkey;
    req.session.authkey = await generateCredentials('authkey', req.body.pubkey, false);

    if (req.session.authkey == ""){
        logger.error("Failed to generate authkey for", req.session.identifier);
        return res.status(500).send(false);
    }

    // User metadata from nostr
    req.session.metadata = await getProfileNostrMetadata(req.session.identifier);

    // Check admin privileges. Only for information, never used for authorization
    req.session.metadata.allowed = await isPubkeyAllowed(req.body.pubkey || req.session.identifier);

    logger.info("logged in as", req.session.identifier, " - ", getClientIp(req));
    return res.status(200).send(true);
    
};

export {loadDashboardPage, 
        loadSettingsPage, 
        loadTosPage, 
        loadGalleryPage,
        loadDocsPage, 
        loadRegisterPage,
        loadLoginPage, 
        loadIndexPage,
        loadMediaPage,
        frontendLogin,
        loadProfilePage};