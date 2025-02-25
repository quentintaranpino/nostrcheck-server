import { Application } from "express";
import express from "express";
import { 	loadDashboardPage, 
			loadSettingsPage, 
			loadMdPage, 
			loadDocsPage, 
			loadLoginPage, 
			loadIndexPage, 
			loadProfilePage,
			loadGalleryPage,
			loadRegisterPage,
			loadDirectoryPage,
		} from "../controllers/frontend.js";
import { frontendLogin } from "../controllers/frontend.js";
import { logger } from "../lib/logger.js";
import { isPubkeyValid } from "../lib/authorization.js";
import { limiter } from "../lib/security/core.js";
import { isFirstUse } from "../lib/frontend.js";
import { getClientIp } from "../lib/security/ips.js";
import { redisDel } from "../lib/redis.js";

export const loadFrontendEndpoint = async (app: Application, version: string): Promise<void> => {

	// Legacy frontend routes
	app.get("/", (_req, res) => {
		res.redirect("/api/v2/");
	});
	app.get("/api", (_req, res) => {
		res.redirect("/api/v2/");
	});
	app.get("/api/v1", (_req, res) => {
		res.redirect("/api/v2/");
	});

	// Current v2 routes (index)
	app.get("/api/" + version, async (req, res) => {
		if(req.originalUrl.slice(-1) !== '/') {
			return res.redirect(301, req.originalUrl + '/');
		}
		if (await isFirstUse(req,res)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
		loadIndexPage(req, res, version);
	});

	// Login page
	app.get("/api/" + version + "/login", limiter(10), async (req, res) => {
		if (req.session.identifier != null && req.session.identifier != undefined && req.session.identifier != "") {
			res.redirect("/api/v2/");
		} else {
			if (await isFirstUse(req,res)) {
				res.redirect("/api/v2/");
			} else {
				loadLoginPage(req, res, version);
			}
		}
	});

	// Login POST
	app.post("/api/" + version + "/login/:param1?", 
		limiter(4), 
		express.json({limit: '1mb'}), 
		(req, res) => {
			frontendLogin(req, res);
		}
	);

	// Tos
	app.get("/api/" +  version + "/tos", limiter(), async (req, res) => {
		if (await isFirstUse(req,res)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
		loadMdPage(req,res,"tosFilePath",version);
	});

	// Privacy
	app.get("/api/" +  version + "/privacy", limiter(), async (req, res) => {
		if (await isFirstUse(req,res)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
		loadMdPage(req,res,"privacyFilePath",version);
	});

	// Legal
	app.get("/api/" +  version + "/legal", limiter(), async (req, res) => {
		if (await isFirstUse(req,res)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
		loadMdPage(req,res,"legalFilePath",version);
	});

	// Documentation
	app.get("/api/" +  version + "/documentation", limiter(), async (req, res) => {
		if (await isFirstUse(req,res)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
		loadDocsPage(req,res,version);
	});

	// Gallery
	app.get("/api/" +  version + "/gallery", limiter(),  async (req, res) => {
		if (await isFirstUse(req,res)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
		loadGalleryPage(req,res,version);
	});

	// Register
	app.get("/api/" +  version + "/register", limiter(), async (req, res) => {
		if (await isFirstUse(req,res)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
		loadRegisterPage(req,res,version);
	});

	// Directory
	app.get("/api/" +  version + "/directory", limiter(), async (req, res) => {
		if (await isFirstUse(req,res)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
		loadDirectoryPage(req,res,version);
	});

	// Dashboard
	app.get("/api/" +  version + "/dashboard", limiter(), async (req, res) => {
		if (req.session.identifier == null){
			res.redirect("/api/" +  version + "/login");
		}else if (await isPubkeyValid(req.session.identifier, true) == false){
			res.redirect("/api/v2/");
		}else{
			if (await isFirstUse(req,res)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
			loadDashboardPage(req,res,version);
		}
	});

	// Settings
	app.get("/api/" +  version + "/settings", limiter(), async (req, res) => {
		if (req.session.identifier == null){
			res.redirect("/api/" +  version + "/login");
		}else if (await isPubkeyValid(req.session.identifier, true) == false){
			res.redirect("/api/v2/");
		}else{
			if (await isFirstUse(req,res)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
			loadSettingsPage(req,res,version);
		}
	});

	// Profile
	app.get("/api/" +  version + "/profile", limiter(), async (req, res) => {
		if (req.session.identifier == null){
			res.redirect("/api/" +  version + "/login");
		}else if (await isPubkeyValid(req.session.identifier, false) == false){
			res.redirect("/api/v2/");
		}else{
			if (await isFirstUse(req,res)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
			loadProfilePage(req,res,version);
		}
	});

	// Logout
	app.get("/api/" +  version + "/logout", limiter(), (req, res) => {
		const identifier = req.session.identifier;
		req.session.destroy(async (err) => {
			if (err) {
				logger.error("Failed to destroy session:", err);
			}

			res.clearCookie("connect.sid");
			res.clearCookie("authkey");
			await redisDel(`activeStatus:${identifier}`);

			res.redirect("/api/" +  version + "/login");
		});
	});

	// The relay frontend page is managed by the relay.route.ts file
};
