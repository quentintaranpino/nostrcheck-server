import { Request, Response } from "express";
import fs from "fs";
import { logger } from "../lib/logger.js";
import { markdownToHtml } from "../lib/utils.js";
import { dbMultiSelect, dbSelect} from "../lib/database/core.js";
import { generateAuthToken, generateOTC, isPubkeyAllowed, isPubkeyValid, isUserPasswordValid, verifyOTC } from "../lib/authorization.js";
import { countPubkeyFiles, generateSitemap, getLegalText, getResource, isAutoLoginEnabled, replaceTokens, setAuthCookie } from "../lib/frontend.js";
import { hextoNpub, npubToHex } from "../lib/nostr/NIP19.js";
import { dynamicbackgroundThemes, particles} from "../interfaces/appearance.js";
import { getUsernames } from "../lib/register.js";
import { getLightningAddress } from "../lib/lightning.js";
import { getClientInfo, isIpAllowed } from "../lib/security/ips.js";
import { getModules, getConfig, getTenants, isModuleEnabled } from "../lib/config/core.js";
import path from "path";
import { getDomains } from "../lib/domains.js";
import { isNIP98Valid } from "../lib/nostr/NIP98.js";
import { sitemapPages } from "../interfaces/frontend.js";

const loadDashboardPage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info("Attempt to access a non-active module:","frontend","|","IP:", getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/dashboard", "|", getClientInfo(req).ip);


    const activeModules = getModules(req.hostname,true)
    res.locals.activeModules = activeModules; 

    // General locals
    const page = "dashboard"
    res.locals.version = getConfig(req.hostname, ["version"]);
    res.locals.serverHost = getConfig(req.hostname, ["server", "host"]);
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Specific locals
    res.locals.settingsMedia = getConfig(req.hostname, ["media"]);

    // Set auth cookie
    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("dashboard.ejs", {request: req});
};

const loadSettingsPage = async (req: Request, res: Response, version: string): Promise<Response | void> => {

	if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info("Attempt to access a non-active module:", "frontend", "|", "IP:", getClientInfo(req).ip);
        return res.status(403).send({ status: "error", message: "Module is not enabled" });
    }
  
    logger.info("GET /api/" + version + "/settings", "|", getClientInfo(req).ip);
  
    const domain = typeof req.query.domain === "string" ? req.query.domain : null;
    const activeModules = getModules(req.hostname,true)
      
    const globalConfig = {
        version: getConfig(null, ["version"]),
        environment: getConfig(null, ["environment"]),
        multiTenancy: getConfig(null, ["multiTenancy"]),
        autoLogin: getConfig(null, ["autoLogin"]),
        server: getConfig(null, ["server"]),
        redis: getConfig(null, ["redis"]),
        storage: getConfig(null, ["storage"]),
        media: getConfig(null, ["media"]),
        payments: getConfig(null, ["payments"]),
        register: getConfig(null, ["register"]),
        logger: getConfig(null, ["logger"]),
        security: getConfig(null, ["security"]),
        database: getConfig(null, ["database"]),
        plugins: getConfig(null, ["plugins"]),
        relay: getConfig(null, ["relay"]),
        legal: getConfig(null, ["server", "legal"]),
        appearance: getConfig(null, ["appearance"]),
    };
  
    const domainConfig = {
        server: getConfig(domain, ["server"]),
        redis: getConfig(domain, ["redis"]),
        storage: getConfig(domain, ["storage"]),
        media: getConfig(domain, ["media"]),
        payments: getConfig(domain, ["payments"]),
        register: getConfig(domain, ["register"]),
        logger: getConfig(domain, ["logger"]),
        security: getConfig(domain, ["security"]),
        database: getConfig(domain, ["database"]),
        plugins: getConfig(domain, ["plugins"]),
        relay: getConfig(domain, ["relay"]),
        legal: getConfig(domain, ["server", "legal"]),
        appearance: getConfig(domain, ["appearance"]),
    };


    res.locals.activeModules = activeModules;
    res.locals.availableModules = globalConfig.server?.availableModules || {};

    // General locals
    const page = "settings"
    res.locals.version = getConfig(req.hostname, ["version"]);
    res.locals.serverHost = getConfig(req.hostname, ["server", "host"]);
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Specific locals
    res.locals.selectedDomain = domain;
    res.locals.globalConfig = globalConfig;
    res.locals.domainConfig = domainConfig;
    res.locals.domainsList = getTenants().map((tenant) => tenant.domain);
    res.locals.settingsLookAndFeelThemes = dynamicbackgroundThemes;
    res.locals.settingsLookAndFeelParticles = particles;

    // Set auth cookie
    setAuthCookie(res, req.cookies.authkey);
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);
  
    res.render("settings.ejs", { request: req });

};

const loadProfilePage = async (req: Request, res: Response, version:string): Promise<Response | void> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadProfilePage - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadProfilePage - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.debug(`loadProfilePage - GET /api/${version}/profile`, "|", getClientInfo(req).ip);

    // Active modules
    const activeModules = getModules(req.hostname,true)
    res.locals.activeModules = activeModules;

    // General locals
    const page = "profile"
    res.locals.version = getConfig(req.hostname, ["version"]);
    res.locals.serverHost = getConfig(req.hostname, ["server", "host"]);
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Specific locals
    let identifier = req.params.param1 || req.session.identifier;

    if (!identifier) {
        logger.debug("loadProfilePage - No identifier provided. Redirecting to login page", "|", getClientInfo(req).ip);
        return res.render("register.ejs", {request: req});
    }

    // npub
    if (identifier.startsWith("npub")) {
        identifier = await npubToHex(identifier);
    }

    // username
    if (!identifier.startsWith("npub") && identifier.length != 64) {
        if (identifier.includes("@")) {
            const [username, domain] = identifier.split("@");
            const domains = await getDomains();
            if (domain in domains) {
                identifier = (await dbMultiSelect(["hex"], "registered", "username = ? and domain = ?", [username, domain], true))[0]?.hex;
            }
        }
        identifier = (await dbMultiSelect(["hex"], "registered", "username = ?", [identifier], true))[0]?.hex;
    }

    // User metadata
    req.session.metadata = {
        pubkey: identifier,
        npub: await hextoNpub(identifier),
        hostedFiles: await countPubkeyFiles(identifier),
        usernames: await getUsernames(identifier),
        lud16: await getLightningAddress(identifier)
    }

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    // Public identifier (for vanity URL)
    res.locals.publicIdentifier = identifier;
    res.locals.isPublic = identifier != req.session.identifier;

    if (req.session.metadata.usernames.length == 0){
        return loadRegisterPage(req,res,version);
    }

    // Set auth cookie
    setAuthCookie(res, req.cookies.authkey);


    return res.render("profile.ejs", {request: req});
};

const loadMdPage = async (req: Request, res: Response, mdFileName : string, version:string): Promise<Response | void> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadTosPage - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadTosPage - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`loadTosPage - GET /api/${version}/${mdFileName}`, "|", getClientInfo(req).ip);

    // Active modules
    const activeModules = getModules(req.hostname,true);
    res.locals.activeModules = activeModules;

    // General locals
    const page = mdFileName.replace(/FilePath$/, ""); 
    res.locals.version = getConfig(req.hostname, ["version"]);
    res.locals.serverHost = getConfig(req.hostname, ["server", "host"]);
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    let mdFile : string = "";
    try{
        mdFile = fs.readFileSync(getConfig(req.hostname, ["server", mdFileName])).toString();

        // Standard replacements
        mdFile = mdFile.replace(/SERVERHOST/g, getConfig(req.hostname, ["server", "host"]));
        mdFile = mdFile.replace(/SERVERCONTACT/g, getConfig(req.hostname, ["server", "pubkey"]));

        // Legal replacements
        mdFile = mdFile.replace(/LEGALINFO/g, getLegalText(req.hostname));
        mdFile = mdFile.replace(/SERVERCOUNTRY/g, getConfig(req.hostname, ["server", "legal", "country"]));
        mdFile = mdFile.replace(/SERVERJURISDICTION/g, getConfig(req.hostname, ["server", "legal", "jurisdiction"]));
        mdFile = mdFile.replace(/SERVEREMAIL/g, getConfig(req.hostname, ["server", "legal", "email"]));

        mdFile = markdownToHtml(mdFile);
        
    }catch(e){
        logger.error(`load - Failed to read markdown file: ${mdFileName}`, "|", getClientInfo(req).ip);
        mdFile = `Failed to read markdown file ${mdFileName}`;
    }

    // Set auth cookie
    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);
    
    res.render(mdFileName.split("FilePath")[0], {request: req, md: mdFile });
};

const loadLoginPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadLoginPage - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadLoginPage - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`loadLoginPage - GET /api/${version}/login`, "|", getClientInfo(req).ip);

    // Active modules
    const activeModules = getModules(req.hostname,true);
    res.locals.activeModules = activeModules; 

    // General locals
    const page = "login"
    res.locals.version = getConfig(req.hostname, ["version"]);
    res.locals.serverHost = getConfig(req.hostname, ["server", "host"]);
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Set auth cookie
    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("login.ejs", {request: req});
};

const loadHomePage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadIndexPage - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadIndexPage - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`loadIndexPage - GET /api/${version}/index`, "|", getClientInfo(req).ip);

    // Active modules
    const activeModules = getModules(req.hostname,true);
    res.locals.activeModules = activeModules; 

    // General locals
    const page = "home"
    res.locals.version = getConfig(req.hostname, ["version"]);
    res.locals.serverHost = getConfig(req.hostname, ["server", "host"]);
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Specific page locals
    res.locals.pageTitle = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "pageTitle"]));
    res.locals.pageSubtitle = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "pageSubtitle"]));
    res.locals.serverPubkey = await hextoNpub(getConfig(req.hostname, ["server", "pubkey"]));

    // Set auth cookie
    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);
    
    res.render(page +".ejs", {request: req});
};

const loadDocsPage = async (req: Request, res: Response, version: string): Promise<Response | void> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadDocsPage - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
    if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadDocsPage - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
        return res.status(403).send({ "status": "error", "message": "Module is not enabled" });
    }

    logger.info(`loadDocsPage - GET /api/${version}/docs`, "|", getClientInfo(req).ip);

    // Active modules
    const activeModules = getModules(req.hostname,true);
    res.locals.activeModules = activeModules; 

    // General locals
    const page = "docs"
    res.locals.version = getConfig(req.hostname, ["version"]);
    res.locals.serverHost = getConfig(req.hostname, ["server", "host"]);
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Specific locals
    res.locals.serverPubkey = await hextoNpub(getConfig(req.hostname, ["server", "pubkey"]));

    // Set auth cookie
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
		logger.info(`loadGalleryPage - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadGalleryPage - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`loadGalleryPage - GET /api/${version}/gallery`, "|", getClientInfo(req).ip);

    // Active modules
    const activeModules = getModules(req.hostname,true);
    res.locals.activeModules = activeModules; 

    // General locals
    const page = "gallery"
    res.locals.version = getConfig(req.hostname, ["version"]);
    res.locals.serverHost = getConfig(req.hostname, ["server", "host"]);
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Set auth cookie
    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("gallery.ejs", {request: req});
};

const loadDirectoryPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadDirectoryPage - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadDirectoryPage - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`loadDirectoryPage - GET /api/${version}/directory`, "|", getClientInfo(req).ip);

    // Active modules
    const activeModules = getModules(req.hostname,true);
    res.locals.activeModules = activeModules; 

    // General locals
    const page = "directory"
    res.locals.version = getConfig(req.hostname, ["version"]);
    res.locals.serverHost = getConfig(req.hostname, ["server", "host"]);
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Set auth cookie
    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("directory.ejs", {request: req});
};

const loadConverterPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadConverterPage - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadConverterPage - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`loadConverterPage - GET /api/${version}/directory`, "|", getClientInfo(req).ip);

    // Active modules
    const activeModules = getModules(req.hostname,true);
    res.locals.activeModules = activeModules; 

    // General locals
    const page = "converter"
    res.locals.version = getConfig(req.hostname, ["version"]);
    res.locals.serverHost = getConfig(req.hostname, ["server", "host"]);
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Set auth cookie
    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("converter.ejs", {request: req});
};

const loadRegisterPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadRegisterPage - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadRegisterPage - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`loadRegisterPage - GET /api/${version}/register`, "|", getClientInfo(req).ip);

    // Active modules
    const activeModules = getModules(req.hostname,true);
    res.locals.activeModules = activeModules; 

    // General locals
    const page = "register"
    res.locals.version = getConfig(req.hostname, ["version"]);
    res.locals.serverHost = getConfig(req.hostname, ["server", "host"]);
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Set auth cookie
    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("register.ejs", {request: req});
};

const loadCdnPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadCdnPage - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
    if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadCdnPage - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`loadCdnPage - GET /api/${version}/cdn`, "|", getClientInfo(req).ip);

    if (await isAutoLoginEnabled(req,res)){logger.info("First use detected. Showing alert on frontend", "|", )}

    // Active modules
    const activeModules = getModules(req.hostname,true);
    res.locals.activeModules = activeModules; 

    // General locals
    const page = "cdn"
    res.locals.version = getConfig(req.hostname, ["version"]);
    res.locals.serverHost = getConfig(req.hostname, ["server", "host"]);
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Set auth cookie
    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("cdn.ejs", {request: req});
};

const loadRelayPage = async (req: Request, res: Response, version:string): Promise<Response | void>  => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadRelayPage - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
    if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadRelayPage - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`loadRelayPage - GET /api/${version}/relay`, "|", getClientInfo(req).ip);

    // Active modules
    const activeModules = getModules(req.hostname,true);
    res.locals.activeModules = activeModules; 

    // General locals
    const page = "relay"
    res.locals.version = getConfig(req.hostname, ["version"]);
    res.locals.serverHost = getConfig(req.hostname, ["server", "host"]);
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Specific locals
    res.locals.serverPubkey = await hextoNpub(getConfig(req.hostname, ["server", "pubkey"]));
    res.locals.lastRelayNotes = await dbMultiSelect(["event_id","pubkey","created_at","content", "kind"], "events", "active = ?", ["1"], false,"ORDER BY id DESC LIMIT 500");

    // Set auth cookie
    setAuthCookie(res, req.cookies.authkey);

    // Check admin privileges. Only for information, never used for authorization
    req.session.allowed = await isPubkeyAllowed(req.session.identifier);

    res.render("relay.ejs", {request: req});
};

const frontendLogin = async (req: Request, res: Response): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`frontendLogin - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", req.hostname)) {
        logger.warn(`frontendLogin - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

    logger.info(`frontendLogin - POST /api/login`, "|", getClientInfo(req).ip);

    // Check if secureCookie is true and if the request is not secure
    if (req.session.cookie.secure && !req.secure) {
        logger.warn("Attempt to access a secure session over HTTP:","|","IP:", getClientInfo(req).ip);
        return res.status(400).send({"status": "error", "message": "Insecure connection"});
    }

    // OTC code request and return.
    if (req.params.param1 && req.params.param1.length <= 64) {
        const OTC = await generateOTC(req.hostname, req.params.param1);
        if (OTC == true) {
            logger.info(`frontendLogin - One-time code generated for ${req.params.param1}`, "|", getClientInfo(req).ip);
            return res.status(200).send({"status": "success", "message": "One-time code generated"});
        } else {
            logger.warn(`frontendLogin - Failed to generate one-time code for ${req.params.param1}`, "|", getClientInfo(req).ip);
            return res.status(401).send({"status": "error", "message": "Failed to generate one-time code"});
        }
    }

    if ((req.body.pubkey === "" || req.body.pubkey == undefined) && (req.body.username === '' || req.body.password === '')){
        logger.warn(`frontendLogin - No credentials used to login. Refusing`, getClientInfo(req).ip);
        return res.status(401).send({"status": "error", "message": "No credentials used to login"});
    }

    const rememberMe = req.body.rememberMe || (Array.isArray(req.body.tags) ? req.body.tags.find((tag: string[]) => tag[0] === "cookie")?.[1] : "false");
    if (rememberMe === "true"){req.session.cookie.maxAge = getConfig(req.hostname, ["session", "maxAge"]);}

    let canLogin = false;
    let loginMessage = "Invalid credentials";
    if (req.body.pubkey != undefined){
        canLogin = ((await isNIP98Valid(req.body, req, false, true, true)).status === "success")
        if (!canLogin) loginMessage = "NIP98 event verification failed";
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
            canLogin = await isPubkeyValid(req.body.pubkey || req.body.pubkey, false);
            if (!canLogin) {loginMessage = "Invalid one-time code"}
        }
    } 
    if (!canLogin) {
        logger.warn(`frontendLogin - Failed login attempt for ${req.body.pubkey || req.body.username}`, "|", getClientInfo(req).ip);
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

    logger.info(`frontendLogin - logged in as ${req.session.identifier} successfully`, "|", getClientInfo(req).ip);
    return res.status(200).send({"status": "success", "message": "Logged in successfully"});
    
};

const loadResource = async (req: Request, res: Response): Promise<Response | void> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`loadResource - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
        res.status(404).send();
        return;
	}

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadResource - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
        res.status(404).send();
        return;
	}

    logger.debug(`loadResource - GET /api/resource/${req.params.filename}`, "|", getClientInfo(req).ip);
    
    const tenant = getConfig("", ["multiTenancy"]) ? req.query.domain || req.hostname : "" as string;
    if (typeof tenant !== "string") {
        logger.error("loadResource - Invalid tenant name:", tenant, "|", getClientInfo(req).ip);
        res.status(404).send();
        return;
    }
    const resourcePath = await getResource(tenant, req.params.filename || req.path.replace("/", ""));
    if (resourcePath == null) {
        logger.error(`loadResource - Resource not found: ${req.params.filename}`, "|", getClientInfo(req).ip);
        res.status(404).send();
        return;
    }

    // Set headers
    const ext = path.extname(resourcePath).toLowerCase();
    const mimeTypes: {[key: string]: string} = {
        ".js": "application/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".json": "application/json",
        ".html": "text/html",
        ".svg": "image/svg+xml",    
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".eot": "application/vnd.ms-fontobject",
        ".otf": "font/otf"
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=14400, immutable");
    if (
        contentType.startsWith("image/") ||
        contentType.startsWith("font/")  ||
        contentType.startsWith("video/") ||
        contentType.startsWith("audio/")
    ) {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    }
    res.removeHeader("Cross-Origin-Opener-Policy");

    res.sendFile(path.resolve(resourcePath));
    return;

};

const loadTheme = async (req: Request, res: Response): Promise<void> => {

    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned || !isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadTheme - Attempt to access ${req.path} with unauthorized IP:`, getClientInfo(req).ip);
        res.status(404).send();
        return;
    }

    // Check if current module is enabled
	if (!isModuleEnabled("frontend", req.hostname)) {
        logger.info(`loadTheme - Attempt to access a non-active module: frontend | IP:`, getClientInfo(req).ip);
        res.status(404).send();
        return;
	}

    logger.debug(`loadTheme - GET /api/resource/${req.params.filename}`, "|", getClientInfo(req).ip);

    const tenant = getConfig("", ["multiTenancy"]) ? req.hostname : "";
    const theme = getConfig(tenant, ["appearance", "dynamicbackground"]) || dynamicbackgroundThemes["default"];

    const css = `
        :root {
            --primary-color: ${theme.color1};
            --secondary-color: ${theme.color2};
            --tertiary-color: ${theme.color3};
            --primary-color-percent: ${theme.color1Percent};
            --secondary-color-percent: ${theme.color2Percent};
            --tertiary-color-percent: ${theme.color3Percent};
            --gradient-orientation: ${theme.orientation};
            --particles: ${theme.particles};
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

    res.setHeader("Content-Type", "text/css");
    res.send(css);
};

const loadSitemap = async (req: Request, res: Response): Promise<void> => {
    const baseUrl = `${req.protocol}://${req.hostname}`;
    const sitemap = generateSitemap(sitemapPages, baseUrl);
    res.setHeader("Content-Type", "application/xml");
    res.send(sitemap);
};

export {loadDashboardPage, 
        loadSettingsPage, 
        loadMdPage, 
        loadGalleryPage,
        loadDocsPage, 
        loadRegisterPage,
        loadLoginPage, 
        loadHomePage,
        loadCdnPage,
        frontendLogin,
        loadProfilePage,
        loadDirectoryPage,
        loadConverterPage,
        loadRelayPage,
        loadResource,
        loadTheme,
        loadSitemap
    };