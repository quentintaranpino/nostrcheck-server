import { Request, Response } from "express";
import fs from "fs";
import config from "config";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { getClientIp, markdownToHtml } from "../lib/server.js";
import { dbSelect, dbSelectModuleData} from "../lib/database.js";
import { generateCredentials, isPubkeyAllowed, isUserAllowed } from "../lib/authorization.js";
import { registeredTableFields } from "../interfaces/database.js";

const loadDashboardPage = async (req: Request, res: Response, version:string): Promise<void> => {
	logger.info("GET /api/" + version + "/dashboard", "|", getClientIp(req));

    req.body.version = app.get("version");
    const activeModules = Object.entries(app.get("activeModules"));
    req.body.activeModules = [];
    for (const [key] of activeModules) {
        req.body[key + "Data"] = await dbSelectModuleData(key);
    }

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
    req.body.serverPubkey = config.get("server.pubkey");
    res.render("index.ejs", {request: req});
};

const frontendLogin = async (req: Request, res: Response): Promise<Response> => {

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

export {loadDashboardPage, loadTosPage, loadLoginPage, loadIndexPage, frontendLogin};