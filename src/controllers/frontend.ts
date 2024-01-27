import { Request, Response } from "express";
import fs from "fs";
import config from "config";

import { logger } from "../lib/logger.js";
import { getClientIp, markdownToHtml } from "../lib/server.js";
import { verifyNIP07login } from "../lib/nostr/NIP07.js";
import app from "../app.js";
import { dbSelectAllLightning, dbSelectAllMediaFiles, dbSelectAllRegistered, dbSelectAllDomains } from "../lib/database.js";

const loadDashboardPage = async (req: Request, res: Response, version:string): Promise<void> => {
	logger.info("GET /api/" + version + "/dashboard", "|", getClientIp(req));

        req.body.version = app.get("version");
        req.body.registeredData = await dbSelectAllRegistered();
        req.body.mediafilesData = await dbSelectAllMediaFiles();
        req.body.lightningData = await dbSelectAllLightning();
        req.body.domainsData = await dbSelectAllDomains();
        console.log(req.body.registeredUsernames);
        res.render("dashboard.ejs", {request: req});
};

const loadTosPage = async (req: Request, res: Response, version:string): Promise<void> => {
	logger.info("GET /api/" + version + "/tos", "|", getClientIp(req));

    req.body.version = app.get("version");
    const tosFile = markdownToHtml(fs.readFileSync(config.get("server.tosFilePath")).toString());
    
    res.render("tos.ejs", {request: req, tos: tosFile });
};

const loadLoginPage = async (req: Request, res: Response, version:string): Promise<void> => {
	logger.info("GET /api/" + version + "/login", "|", getClientIp(req));

    req.body.version = app.get("version");
    res.render("login.ejs", {request: req});
};

const loadIndexPage = async (req: Request, res: Response, version:string): Promise<void> => {
	logger.info("GET /api/" + version + "/index", "|", getClientIp(req));

    req.body.version = app.get("version");
    req.body.APIversion = version;
    req.body.activeModules = app.get("activeModules");
    res.render("index.ejs", {request: req});
};

const frontendLogin = async (req: Request, res: Response): Promise<Response> => {

    // Check if NIP07 credentials are correct
    if (req.body.pubkey != "" && req.body.pubkey == config.get('server.adminPanel.pubkey')){
        let result = await verifyNIP07login(req);
        if (!result){return res.status(401).send(false);}
        req.session.identifier = req.body.pubkey;
    }

    // Check if legacy credentials are correct
    if (req.body.password != "" && req.body.password == config.get('server.adminPanel.legacyPassword')){
        req.session.identifier = "legacyLogin";
    }

    // Check if we have a valid session
    if (req.session.identifier == null){
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
        logger.warn("Incorrect admin credentials used to login. Refusing", getClientIp(req));
        return res.status(401).send(false);
    }

    // Remember me logic
    if (req.body.rememberMe == "true"){req.session.cookie.maxAge = config.get('session.maxAge');}
    logger.info("logged in as", req.session.identifier, " - ", getClientIp(req));
    return res.status(200).send(true);

};

export {frontendLogin, loadDashboardPage, loadTosPage, loadLoginPage, loadIndexPage};