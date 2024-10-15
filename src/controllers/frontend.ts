import { Request, Response } from "express";
import fs from "fs";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { getClientIp, markdownToHtml } from "../lib/utils.js";
import { dbSelect} from "../lib/database.js";
import { generateCredentials, isAuthkeyValid, isPubkeyAllowed, isPubkeyValid, isUserPasswordValid } from "../lib/authorization.js";
import { isModuleEnabled, loadconfigActiveModules } from "../lib/config.js";
import { countPubkeyFiles } from "../lib/frontend.js";
import { hextoNpub } from "../lib/nostr/NIP19.js";
import { logHistory } from "../lib/logger.js";
import { themes, particles} from "../interfaces/themes.js";
import { verifyNIP07event } from "../lib/nostr/NIP07.js";
import { getUsernames } from "../lib/register.js";

const loadDashboardPage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/dashboard", "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app).map((module) => module[0]);
    res.locals.activeModules = activeModules; 

    // Logger history greater or equal to 4 (warn)
    res.locals.logHistory = logHistory.length != 0 ? JSON.stringify(logHistory).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'") : [0];
    activeModules.push("logHistory");

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];
    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("dashboard.ejs", {request: req});
};

const loadSettingsPage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

    logger.info("GET /api/" + version + "/settings", "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app).map((module) => module[0]);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");

    res.locals.serverHost = app.get("config.server")["host"];
    res.locals.availableModules = app.get("config.server")["availableModules"];
    res.locals.settingsEnvironment = app.get("config.environment");
    res.locals.settingsServerHost = app.get("config.server")["host"];
    res.locals.settingServerPubkey = app.get("config.server")["pubkey"];
    res.locals.settingServerSecretkey =  app.get("config.server")["secretKey"];
    res.locals.settingsRedisExpireTime = app.get("config.redis")["expireTime"];

    res.locals.settingsStorage = app.get("config.storage");
    res.locals.settingsMedia = app.get("config.media");
    res.locals.settingsPayments = app.get("config.payments");
    res.locals.settingsRegister = app.get("config.register");
    res.locals.settingsLogger = app.get("config.logger");
    res.locals.settingsSecurity = app.get("config.security");
    res.locals.settingsDatabase = app.get("config.database");
    res.locals.settingsPlugins = app.get("config.plugins");
    res.locals.logHistory = logHistory;
    res.locals.settingsLookAndFeelThemes = themes;
    res.locals.settingsLookAndFeelParticles = particles;
    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);
    
    res.render("settings.ejs", {request: req});
};

const loadProfilePage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/profile", "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app).map((module) => module[0]);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];
    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    // User metadata
    req.session.metadata = {
        pubkey: req.session.identifier,
        npub: await hextoNpub(req.session.identifier),
        hostedFiles: await countPubkeyFiles(req.session.identifier),
        usernames: await getUsernames(req.session.identifier)
    }

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("profile.ejs", {request: req});
};

const loadTosPage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/tos", "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app).map((module) => module[0]);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];
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

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);
    
    res.render("tos.ejs", {request: req, tos: tosFile });
};

const loadLoginPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/login", "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app).map((module) => module[0]);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];

    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("login.ejs", {request: req});
};

const loadIndexPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/index", "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app).map((module) => module[0]);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];
    res.locals.serverPubkey = await hextoNpub(app.get("config.server")["pubkey"]);

    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);
    
    res.render("index.ejs", {request: req});
};

const loadDocsPage = async (req: Request, res: Response, version: string): Promise<Response | void> => {

    // Check if current module is enabled
    if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:", "frontend", "|", "IP:", getClientIp(req));
        return res.status(400).send({ "status": "error", "message": "Module is not enabled" });
    }

    logger.info("GET /api/" + version + "/documentation", "|", getClientIp(req));

    // Doc active modules
    const availableModules = Object.entries(app.get("config.server")["availableModules"]);
    res.locals.docModules = [];
    for (const [key] of availableModules) {
        if (app.get("config.server")["availableModules"][key]["enabled"] == true) {
            res.locals.docModules.push(app.get("config.server")["availableModules"][key]);
        }
    }

    // Active modules
    const activeModules = loadconfigActiveModules(app).map((module) => module[0]);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];
    res.locals.serverPubkey = await hextoNpub(app.get("config.server")["pubkey"]);

    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    // Pass the data to the template using res.locals
    res.render("documentation.ejs", { request: req });
};

const loadGalleryPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/gallery", "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app).map((module) => module[0]);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];

    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("gallery.ejs", {request: req});
};

const loadRegisterPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/register", "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app).map((module) => module[0]);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];

    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("register.ejs", {request: req});
};

const loadCdnPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

    // Check if current module is enabled
    if (!isModuleEnabled("frontend", app)) {
        logger.warn("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("GET /api/" + version + "/cdn", "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app).map((module) => module[0]);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];

    req.session.authkey = await generateCredentials('authkey', req.session.identifier);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("cdn.ejs", {request: req});
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
        canLogin = await isPubkeyValid(req.session.identifier || req.body.pubkey, false);
        if (canLogin == true) {canLogin == await verifyNIP07event(req)}
    }
    if (req.body.username != undefined && req.body.password != undefined){
        canLogin = await isUserPasswordValid(req.body.username, req.body.password, false);
        if (canLogin == true) {req.body.pubkey = await dbSelect("SELECT hex FROM registered WHERE username = ?", "hex", [req.body.username]) as string}

    }
    if (req.body.otc != undefined){
        const result = await isAuthkeyValid(req.body.otc, false);
        if(result.status == 'success'){
            req.body.pubkey = result.pubkey;
            canLogin = await isPubkeyValid(req.session.identifier || req.body.pubkey, false);
        }
    } 
    if (!canLogin) {
        logger.warn(`RES -> 401 unauthorized  - ${req.body.pubkey}`,"|",getClientIp(req));
        return res.status(401).send(false);
    }

    // Set session identifier and generate authkey
    req.session.identifier = req.body.pubkey;
    req.session.authkey = await generateCredentials('authkey', req.body.pubkey, false);

    if (req.session.authkey == ""){
        logger.error("Failed to generate authkey for", req.session.identifier);
        return res.status(500).send(false);
    }

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

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
        loadCdnPage,
        frontendLogin,
        loadProfilePage};