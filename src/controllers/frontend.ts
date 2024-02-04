import { Request, Response } from "express";
import fs from "fs";
import config from "config";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { getClientIp, markdownToHtml } from "../lib/server.js";
import { dbSelectModuleData} from "../lib/database.js";

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

export {loadDashboardPage, loadTosPage, loadLoginPage, loadIndexPage};