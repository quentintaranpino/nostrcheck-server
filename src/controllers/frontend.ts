import { Request, Response } from "express";
import fs from "fs";
import { logger } from "../lib/logger.js";
import { markdownToHtml } from "../lib/utils.js";
import { dbMultiSelect, dbSelect, dbUpdate} from "../lib/database/core.js";
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
import { initRedis } from "../lib/redis/client.js";
import { getFileUrl } from "../lib/media.js";
import { supported_nips } from "../interfaces/nostr.js";

const homeFeedCache = async <T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> => {
	try {
		const redis = await initRedis();
		const cached = await redis.getJSON<T>(key);
		if (cached !== null) return cached;
		const fresh = await loader();
		await redis.set(key, JSON.stringify(fresh), { EX: ttl });
		return fresh;
	} catch {
		return loader();
	}
};

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
    res.locals.siteName = getConfig(req.hostname, ["appearance", "siteName"]) || res.locals.serverHost;
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
    res.locals.siteName = getConfig(req.hostname, ["appearance", "siteName"]) || res.locals.serverHost;
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
    res.locals.siteName = getConfig(req.hostname, ["appearance", "siteName"]) || res.locals.serverHost;
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

    // No match → don't propagate undefined to hextoNpub / dbMultiSelect downstream.
    if (!identifier) {
        logger.debug(`loadProfilePage - No user found for ${req.params.param1 || req.session.identifier}`, "|", getClientInfo(req).ip);
        return res.status(404).send("User not found");
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
    res.locals.siteName = getConfig(req.hostname, ["appearance", "siteName"]) || res.locals.serverHost;
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
    res.locals.siteName = getConfig(req.hostname, ["appearance", "siteName"]) || res.locals.serverHost;
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
    res.locals.siteName = getConfig(req.hostname, ["appearance", "siteName"]) || res.locals.serverHost;
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]) || "");
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Specific page locals
    res.locals.pageTitle = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "pageTitle"]));
    res.locals.pageSubtitle = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "pageSubtitle"]));
    res.locals.serverPubkey = await hextoNpub(getConfig(req.hostname, ["server", "pubkey"]));

    // Narrative paragraph rendered under the hero subtitle. Optional
    res.locals.intro = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "intro"]) || "");

    // Guest dashboard data, per-section Redis cache.
    const hostKey = req.hostname || "default";
    const mediaEnabled = isModuleEnabled("media", req.hostname);
    const relayEnabled = isModuleEnabled("relay", req.hostname);
    const registerEnabled = isModuleEnabled("register", req.hostname);

    const [stats, recentMedia, recentUsers, recentNotes] = await Promise.all([
        homeFeedCache(`home:${hostKey}:stats`, 120, async () => {
            const users = registerEnabled
                ? Number(await dbSelect("SELECT COUNT(*) AS c FROM registered WHERE active = 1", "c", []) || 0)
                : 0;
            const files = mediaEnabled
                ? Number(await dbSelect("SELECT COUNT(*) AS c FROM mediafiles WHERE active = 1 AND visibility = 1", "c", []) || 0)
                : 0;
            const bytes = mediaEnabled
                ? Number(await dbSelect("SELECT COALESCE(SUM(filesize), 0) AS s FROM mediafiles WHERE active = 1 AND visibility = 1", "s", []) || 0)
                : 0;
            const eventsTotal = relayEnabled
                ? Number(await dbSelect("SELECT COUNT(*) AS c FROM events WHERE active = 1", "c", []) || 0)
                : 0;
            return { users, files, bytes, eventsTotal };
        }),
        mediaEnabled ? homeFeedCache(`home:${hostKey}:media`, 60, async () => {
            const rows = await dbMultiSelect(
                ["id", "filename", "hash", "mimetype", "dimensions", "blurhash", "pubkey"],
                "mediafiles",
                "active = '1' AND visibility = '1' AND checked = '1' AND original_hash IS NOT NULL ORDER BY id DESC LIMIT 16",
                [], false);
            return rows.map((r: any) => ({
                ...r,
                url: getFileUrl(r.filename, "", req.hostname),
                ext: (r.filename || "").toString().toLowerCase().split(".").pop() || "",
            }));
        }) : Promise.resolve([]),
        registerEnabled ? homeFeedCache(`home:${hostKey}:users`, 120, async () => {
            return await dbMultiSelect(
                ["username", "domain", "hex"],
                "registered",
                "active = '1' ORDER BY id DESC LIMIT 8",
                [], false);
        }) : Promise.resolve([]),
        relayEnabled ? homeFeedCache(`home:${hostKey}:notes`, 30, async () => {
            return await dbMultiSelect(
                ["event_id", "pubkey", "created_at", "content"],
                "events",
                "active = '1' AND kind = '1' ORDER BY id DESC LIMIT 8",
                [], false);
        }) : Promise.resolve([]),
    ]);

    res.locals.homeStats = stats;
    res.locals.homeMedia = recentMedia;
    res.locals.homeUsers = recentUsers;
    res.locals.homeNotes = recentNotes;
    const lightningEnabled = isModuleEnabled("payments", req.hostname);
    res.locals.homeFlags = { media: mediaEnabled, relay: relayEnabled, register: registerEnabled, lightning: lightningEnabled };

    // Connectable endpoints (relay WS, NIP-96 upload, Blossom CDN) for power
    // users to paste into their Nostr client. Shown with copy buttons.
    const useCDNPrefix = getConfig(req.hostname, ["media", "useCDNPrefix"]);
    res.locals.homeEndpoints = {
        relay: relayEnabled ? `wss://relay.${req.hostname}` : null,
        nip96: mediaEnabled ? `https://${req.hostname}/.well-known/nostr/nip96.json` : null,
        blossom: mediaEnabled ? (useCDNPrefix ? `https://cdn.${req.hostname}` : `https://${req.hostname}`) : null,
    };

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
    res.locals.siteName = getConfig(req.hostname, ["appearance", "siteName"]) || res.locals.serverHost;
    res.locals.title = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "title"]));
    res.locals.description = replaceTokens(req.hostname, getConfig(req.hostname, ["appearance", "pages", page, "description"]));
    res.locals.noindex = getConfig(req.hostname, ["appearance", "pages", page, "noindex"]);
    res.locals.socialImage = getConfig(req.hostname, ["appearance", "pages", page, "socialImage"]) || getConfig(req.hostname, ["appearance", "socialImage"]);

    // Specific locals
    res.locals.serverPubkey = await hextoNpub(getConfig(req.hostname, ["server", "pubkey"]));

    const docsMediaEnabled = isModuleEnabled("media", req.hostname);
    const docsRelayEnabled = isModuleEnabled("relay", req.hostname);
    const docsRegisterEnabled = isModuleEnabled("register", req.hostname);
    const docsNostraddressEnabled = isModuleEnabled("nostraddress", req.hostname);
    const docsUseCDNPrefix = getConfig(req.hostname, ["media", "useCDNPrefix"]);

    res.locals.docsEndpoints = {
        relay: docsRelayEnabled ? `wss://relay.${req.hostname}` : null,
        nip96: docsMediaEnabled ? `https://${req.hostname}/.well-known/nostr/nip96.json` : null,
        blossom: docsMediaEnabled ? (docsUseCDNPrefix ? `https://cdn.${req.hostname}` : `https://${req.hostname}`) : null,
        nip05: docsNostraddressEnabled ? `https://${req.hostname}/.well-known/nostr.json` : null,
    };

    // NIPs and BUDs with short human descriptions for the documentation page.
    // Order kept stable for the chip grid.
    const nipDescriptions: Record<number, string> = {
        1: "Basic protocol flow",
        2: "Follow lists",
        3: "OpenTimestamps",
        4: "Encrypted DMs (deprecated)",
        5: "Mapping Nostr keys to DNS identifiers (name@server)",
        7: "Browser extension signing",
        9: "Event deletion",
        11: "Relay information document",
        13: "Proof of work",
        14: "Sensitive content tag",
        19: "bech32 entities (npub, note, nprofile)",
        28: "Public chat",
        40: "Expiration timestamp",
        42: "Auth on relays",
        44: "Encrypted payloads (v2)",
        45: "Event counts",
        47: "Nostr Wallet Connect",
        48: "Proxy tags",
        50: "Search filter",
        56: "Reports",
        62: "Request to vanish",
        65: "Relay list metadata",
        70: "Protected events",
        73: "External content IDs",
        78: "Application-specific data",
        94: "File metadata",
        96: "HTTP file storage integration",
        98: "HTTP auth",
    };
    const budDescriptions: Record<string, string> = {
        "01": "Server requirements and blob descriptor",
        "02": "Blob retrieval and listing",
        "03": "User server list",
        "04": "Mirror blobs from another server",
        "05": "Media optimization",
        "06": "Upload requirements",
        "08": "Nostr file metadata events",
        "09": "Blob reports",
        "11": "Authorization with NIP-98",
    };
    res.locals.docsNips = supported_nips.map(n => ({ num: n, label: String(n).padStart(2, "0"), desc: nipDescriptions[n] || "" }));
    res.locals.docsBuds = ["01", "02", "03", "04", "05", "06", "08", "09", "11"].map(b => ({ num: b, desc: budDescriptions[b] || "" }));
    res.locals.docsLightning = isModuleEnabled("payments", req.hostname);
    res.locals.docsMediaEnabled = docsMediaEnabled;
    res.locals.docsRelayEnabled = docsRelayEnabled;
    res.locals.docsRegisterEnabled = docsRegisterEnabled;

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
    res.locals.siteName = getConfig(req.hostname, ["appearance", "siteName"]) || res.locals.serverHost;
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
    res.locals.siteName = getConfig(req.hostname, ["appearance", "siteName"]) || res.locals.serverHost;
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
    res.locals.siteName = getConfig(req.hostname, ["appearance", "siteName"]) || res.locals.serverHost;
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
    res.locals.siteName = getConfig(req.hostname, ["appearance", "siteName"]) || res.locals.serverHost;
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
    res.locals.siteName = getConfig(req.hostname, ["appearance", "siteName"]) || res.locals.serverHost;
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
    res.locals.siteName = getConfig(req.hostname, ["appearance", "siteName"]) || res.locals.serverHost;
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
            const row = await dbMultiSelect(["pendingotc"], "registered", "hex = ?", [req.body.pubkey], true);
            if (row.length > 0 && row[0].pendingotc == 1) {
                await dbUpdate("registered", {"pendingotc": 0}, ["hex"], [req.body.pubkey]);
            }
            canLogin = await isPubkeyValid(req.body.pubkey, false);
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
    const resourcePath = await getResource(tenant, req.params.filename || req.path.toString().split("/").pop() || "");
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

const loadRobots = async (req: Request, res: Response): Promise<void> => {
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
    const baseUrl = `${proto}://${req.hostname}`;
    const body = [
        "User-agent: *",
        "Disallow: /api/v2/admin",
        "Disallow: /dashboard",
        "Disallow: /settings",
        "Allow: /",
        "",
        `Sitemap: ${baseUrl}/sitemap.xml`,
        "",
    ].join("\n");
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(body);
};

const unifiedSearch = async (req: Request, res: Response): Promise<Response | void> => {

    const reqInfo = await isIpAllowed(req);
    if (reqInfo.banned) return res.status(403).send({status:"error", message:reqInfo.comments});
    if (!isModuleEnabled("frontend", req.hostname)) return res.status(403).send({status:"error", message:"Module is not enabled"});

    const q = (req.query.q || "").toString().trim();
    if (q.length < 2 || q.length > 64) return res.json({ users: [], media: [], events: [] });

    const mediaEnabled = isModuleEnabled("media", req.hostname);
    const relayEnabled = isModuleEnabled("relay", req.hostname);
    const registerEnabled = isModuleEnabled("register", req.hostname);
    const like = `%${q.replace(/[%_]/g, c => "\\" + c)}%`;
    const hostKey = req.hostname || "default";

    const result = await homeFeedCache(`search:${hostKey}:${q.toLowerCase()}`, 30, async () => {
        const [users, media, events] = await Promise.all([
            registerEnabled
                ? dbMultiSelect(["username", "domain", "hex"], "registered",
                    "active = 1 AND username LIKE ? ORDER BY id DESC LIMIT 8",
                    [like], false)
                : Promise.resolve([]),
            mediaEnabled
                ? dbMultiSelect(["id", "filename", "hash", "mimetype", "dimensions", "blurhash", "pubkey"], "mediafiles",
                    "active = 1 AND visibility = 1 AND checked = 1 AND original_hash IS NOT NULL AND filename LIKE ? ORDER BY id DESC LIMIT 8",
                    [like], false)
                : Promise.resolve([]),
            relayEnabled
                ? dbMultiSelect(["event_id", "pubkey", "created_at", "content"], "events",
                    "active = 1 AND kind = '1' AND content LIKE ? ORDER BY id DESC LIMIT 5",
                    [like], false)
                : Promise.resolve([]),
        ]);
        const mediaWithUrl = (media as any[]).map(m => ({ ...m, url: getFileUrl(m.filename, "", req.hostname) }));
        return { users, media: mediaWithUrl, events };
    });

    return res.json(result);
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
        loadSitemap,
        loadRobots,
        unifiedSearch
    };