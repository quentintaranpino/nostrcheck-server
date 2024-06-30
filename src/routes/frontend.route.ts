import { Application } from "express";
import { 	loadDashboardPage, 
			loadSettingsPage, 
			loadTosPage, 
			loadDocsPage, 
			loadLoginPage, 
			loadIndexPage, 
			loadProfilePage,
			loadGalleryPage,
		} from "../controllers/frontend.js";
import { frontendLogin } from "../controllers/frontend.js";
import { logger } from "../lib/logger.js";
import { isPubkeyValid } from "../lib/authorization.js";

import { limiter } from "../lib/session.js"
import { isFirstUse } from "../lib/frontend.js";
import { getClientIp } from "../lib/utils.js";

export const loadFrontendEndpoint = async (app: Application, version:string): Promise<void> => {

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
	app.get("/api/" + version, limiter(100), async (req, res) => {
		if(req.originalUrl.slice(-1) !== '/') {
			return res.redirect(301, req.originalUrl + '/');
		}
		if (await isFirstUse(req)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
		loadIndexPage(req,res,version);
	});

	// Login page
	app.get("/api/" +  version + "/login", limiter(10), async (req, res) => {
		if (req.session.identifier != null){
			res.redirect("/api/v2/");
		}else{
			if (await isFirstUse(req)){
				// we are going to set the first use to true and redirect to the front page and there we will show the alert
				app.set("firstUse", true);
				res.redirect("/api/v2/");
			}else{
				loadLoginPage(req,res,version);
			}
		}
	});

	// Login POST
	app.post("/api/" +  version + "/login", limiter(5), (req, res) => {
		frontendLogin(req,res)
	});

	// Tos
	app.get("/api/" +  version + "/tos", async (req, res) => {
		if (await isFirstUse(req)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
		loadTosPage(req,res,version);
	});

	// Documentation
	app.get("/api/" +  version + "/documentation", async (req, res) => {
		if (await isFirstUse(req)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
		loadDocsPage(req,res,version);
	});

	// Gallery
	app.get("/api/" +  version + "/gallery", async (req, res) => {
		if (await isFirstUse(req)){logger.info("First use detected. Showing alert on frontend", "|", getClientIp(req))}
		loadGalleryPage(req,res,version);
	});

	// Dashboard
	app.get("/api/" +  version + "/dashboard", limiter(100), async (req, res) => {
		if (req.session.identifier == null){
			res.redirect("/api/" +  version + "/login");
		}else if (await isPubkeyValid(req, true) == false){
			res.redirect("/api/v2/");
		}else{
			loadDashboardPage(req,res,version);
		}
	});

	// Settings
	app.get("/api/" +  version + "/settings", limiter(100), async (req, res) => {
		if (req.session.identifier == null){
			res.redirect("/api/" +  version + "/login");
		}else if (await isPubkeyValid(req, true) == false){
			res.redirect("/api/v2/");
		}else{
			loadSettingsPage(req,res,version);
		}
	});

	// Profile
	app.get("/api/" +  version + "/profile", limiter(100), async (req, res) => {
		if (req.session.identifier == null){
			res.redirect("/api/" +  version + "/login");
		}else if (await isPubkeyValid(req, false) == false){
			res.redirect("/api/v2/");
		}else{
			loadProfilePage(req,res,version);
		}
	});

	// Logout
	app.get("/api/" +  version + "/logout", (req, res) => {
		req.session.destroy((err) => {
			if (err) {
				logger.error(err)
				res.redirect("/api/v2/");
			}
			res.redirect("/api/" +  version + "/login");
		});
	});

};
