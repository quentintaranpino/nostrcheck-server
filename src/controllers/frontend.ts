import { Request, Response } from "express";
import fs from "fs";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { markdownToHtml } from "../lib/utils.js";
import { dbMultiSelect, dbSelect} from "../lib/database.js";
import { generateAuthToken, generateOTC, isPubkeyAllowed, isPubkeyValid, isUserPasswordValid, verifyOTC } from "../lib/authorization.js";
import { isModuleEnabled, loadconfigActiveModules } from "../lib/config.js";
import { countPubkeyFiles, isFirstUse, setAuthCookie } from "../lib/frontend.js";
import { hextoNpub } from "../lib/nostr/NIP19.js";
import { themes, particles} from "../interfaces/personalization.js";
import { verifyNIP07event } from "../lib/nostr/NIP07.js";
import { getUsernames } from "../lib/register.js";
import { getLightningAddress } from "../lib/lightning.js";
import { getClientIp, isIpAllowed } from "../lib/security/ips.js";

const loadDashboardPage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.info("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/dashboard", "|", getClientIp(req));


    const activeModules = loadconfigActiveModules(app);
    res.locals.activeModules = activeModules; 
    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];
    res.locals.settingsMedia = app.get("config.media");

    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("dashboard.ejs", {request: req});
};

const loadSettingsPage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.info("Attempt to access a non-active module:","frontend","|","IP:", getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

    logger.info("GET /api/" + version + "/settings", "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app);
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
    res.locals.settingsRelay = app.get("config.relay");
    res.locals.settingsLookAndFeelThemes = themes;
    res.locals.settingsLookAndFeelParticles = particles;

    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);
    
    res.render("settings.ejs", {request: req});
};

const loadProfilePage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadProfilePage - Attempt to access ${req.path} with unauthorized IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.info(`loadProfilePage - Attempt to access a non-active module: frontend | IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.debug(`loadProfilePage - GET /api/${version}/profile`, "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];

    setAuthCookie(res, req.cookies.authkey);

    // User metadata
    req.session.metadata = {
        pubkey: req.session.identifier,
        npub: await hextoNpub(req.session.identifier),
        hostedFiles: await countPubkeyFiles(req.session.identifier),
        usernames: await getUsernames(req.session.identifier),
        lud16: await getLightningAddress(req.session.identifier)
    }

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("profile.ejs", {request: req});
};

const loadTosPage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadTosPage - Attempt to access ${req.path} with unauthorized IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.info(`loadTosPage - Attempt to access a non-active module: frontend | IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`loadTosPage - GET /api/${version}/tos`, "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];
    let tosFile : string = "";
    try{
        tosFile = fs.readFileSync(app.get("config.server")["tosFilePath"]).toString();
        tosFile = markdownToHtml(fs.readFileSync(app.get("config.server")["tosFilePath"]).toString());
        tosFile = tosFile.replace(/\[SERVERADDRESS\]/g, app.get("config.server")["host"]);
    }catch(e){
        logger.error(`loadTosPage - Failed to read tos file:`, e);
        tosFile = "Failed to read tos file. Please contact the server administrator."
    }

    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);
    
    res.render("tos.ejs", {request: req, tos: tosFile });
};

const loadLoginPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadLoginPage - Attempt to access ${req.path} with unauthorized IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.info(`loadLoginPage - Attempt to access a non-active module: frontend | IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`loadLoginPage - GET /api/${version}/login`, "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];

    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("login.ejs", {request: req});
};

const loadIndexPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadIndexPage - Attempt to access ${req.path} with unauthorized IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.info(`loadIndexPage - Attempt to access a non-active module: frontend | IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`loadIndexPage - GET /api/${version}/index`, "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];
    res.locals.serverPubkey = await hextoNpub(app.get("config.server")["pubkey"]);

    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);
    
    res.render("index.ejs", {request: req});
};

const loadDocsPage = async (req: Request, res: Response, version: string): Promise<Response | void> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadDocsPage - Attempt to access ${req.path} with unauthorized IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
    if (!isModuleEnabled("frontend", app)) {
        logger.info(`loadDocsPage - Attempt to access a non-active module: frontend | IP:`, getClientIp(req));
        return res.status(403).send({ "status": "error", "message": "Module is not enabled" });
    }

    logger.info(`loadDocsPage - GET /api/${version}/docs`, "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];
    res.locals.serverPubkey = await hextoNpub(app.get("config.server")["pubkey"]);

    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    // Pass the data to the template using res.locals
    res.render("documentation.ejs", { request: req });
};

const loadGalleryPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadGalleryPage - Attempt to access ${req.path} with unauthorized IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.info(`loadGalleryPage - Attempt to access a non-active module: frontend | IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`loadGalleryPage - GET /api/${version}/gallery`, "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];

    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("gallery.ejs", {request: req});
};

const loadDirectoryPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadDirectoryPage - Attempt to access ${req.path} with unauthorized IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.info(`loadDirectoryPage - Attempt to access a non-active module: frontend | IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`loadDirectoryPage - GET /api/${version}/directory`, "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];

    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("directory.ejs", {request: req});
};

const loadRegisterPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadRegisterPage - Attempt to access ${req.path} with unauthorized IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.info(`loadRegisterPage - Attempt to access a non-active module: frontend | IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`loadRegisterPage - GET /api/${version}/register`, "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];

    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("register.ejs", {request: req});
};

const loadCdnPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadCdnPage - Attempt to access ${req.path} with unauthorized IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
    if (!isModuleEnabled("frontend", app)) {
        logger.info(`loadCdnPage - Attempt to access a non-active module: frontend | IP:`, getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`loadCdnPage - GET /api/${version}/cdn`, "|", getClientIp(req));

    if (await isFirstUse(req,res)){logger.info("First use detected. Showing alert on frontend", "|", )}

    // Active modules
    const activeModules = loadconfigActiveModules(app);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];

    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("cdn.ejs", {request: req});
};

const loadRelayPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadRelayPage - Attempt to access ${req.path} with unauthorized IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
    if (!isModuleEnabled("frontend", app)) {
        logger.info(`loadRelayPage - Attempt to access a non-active module: frontend | IP:`, getClientIp(req));
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`loadRelayPage - GET /api/${version}/relay`, "|", getClientIp(req));

    // Active modules
    const activeModules = loadconfigActiveModules(app);
    res.locals.activeModules = activeModules; 

    res.locals.version = app.get("version");
    res.locals.serverHost = app.get("config.server")["host"];
    res.locals.serverPubkey = await hextoNpub(app.get("config.server")["pubkey"]);

    res.locals.lastRelayNotes = await dbMultiSelect(["pubkey","created_at","content"], "events", "kind = ? AND active = ?", ["1", "1"], false,"ORDER BY id DESC LIMIT 15");

    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("relay.ejs", {request: req});
};

const frontendLogin = async (req: Request, res: Response): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`frontendLogin - Attempt to access ${req.path} with unauthorized IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", app)) {
        logger.warn(`frontendLogin - Attempt to access a non-active module: frontend | IP:`, getClientIp(req));
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

    logger.info(`frontendLogin - POST /api/login`, "|", getClientIp(req));

    // Check if secureCookie is true and if the request is not secure
    if (req.session.cookie.secure && !req.secure) {
        logger.warn("Attempt to access a secure session over HTTP:","|","IP:", getClientIp(req));
        return res.status(400).send({"status": "error", "message": "Insecure connection"});
    }

    // OTC code request and return.
    if (req.params.param1 && req.params.param1.length <= 64) {
        const OTC = await generateOTC(req.params.param1);
        if (OTC == true) {
            logger.info(`frontendLogin - One-time code generated for ${req.params.param1}`, "|", getClientIp(req));
            return res.status(200).send({"status": "success", "message": "One-time code generated"});
        } else {
            logger.warn(`frontendLogin - Failed to generate one-time code for ${req.params.param1}`, "|", getClientIp(req));
            return res.status(401).send({"status": "error", "message": "Failed to generate one-time code"});
        }
    }

    if ((req.body.pubkey === "" || req.body.pubkey == undefined) && (req.body.username === '' || req.body.password === '')){
        logger.warn(`frontendLogin - No credentials used to login. Refusing`, getClientIp(req));
        return res.status(401).send({"status": "error", "message": "No credentials used to login"});
    }

    const rememberMe = req.body.rememberMe || (Array.isArray(req.body.tags) ? req.body.tags.find((tag: string[]) => tag[0] === "cookie")?.[1] : "false");
    if (rememberMe == "true"){req.session.cookie.maxAge = app.get("config.session")["maxAge"];}

    let canLogin = false;
    let loginMessage = "Invalid credentials";
    if (req.body.pubkey != undefined){
        canLogin = await isPubkeyValid(req.session.identifier || req.body.pubkey, false);
        if (canLogin == true) {canLogin == await verifyNIP07event(req)}
        if (!canLogin) {loginMessage = "Pubkey not registered"};
    }
    if (req.body.username != undefined && req.body.password != undefined){
        canLogin = await isUserPasswordValid(req.body.username, req.body.password, false);
        if (!canLogin) {loginMessage = "Invalid username or password"}
        if (canLogin == true) {req.body.pubkey = await dbSelect("SELECT hex FROM registered WHERE username = ?", "hex", [req.body.username]) as string}
    }
    if (req.body.otc != undefined){
        const result = await verifyOTC(req.body.otc);
        if(result != ""){
            req.body.pubkey = result;
            canLogin = await isPubkeyValid(req.session.identifier || req.body.pubkey, false);
            if (!canLogin) {loginMessage = "Invalid one-time code"}
        }
    } 
    if (!canLogin) {
        logger.warn(`frontendLogin - Failed login attempt for ${req.body.pubkey || req.body.username}`, "|", getClientIp(req));
        return res.status(401).send({"status": "error", "message": loginMessage});
    }

    // Set session identifier and generate authkey
    req.session.identifier = req.body.pubkey;

    const authToken = generateAuthToken(req.session.identifier, await(isPubkeyAllowed(req.session.identifier)));
    
    if (!authToken) {
        logger.error("Failed to set authToken for", req.session.identifier);
        return res.status(500).send({"status": "error", "message": "Internal server error"});
    }
    setAuthCookie(res, authToken);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    logger.info(`frontendLogin - logged in as ${req.session.identifier} successfully`, "|", getClientIp(req));
    return res.status(200).send({"status": "success", "message": "Logged in successfully"});
    
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
        loadProfilePage,
        loadDirectoryPage,
        loadRelayPage};