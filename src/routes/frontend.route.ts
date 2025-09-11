import { Application } from "express";
import express from "express";

import { 	loadDashboardPage, 
			loadSettingsPage, 
			loadMdPage, 
			loadDocsPage, 
			loadLoginPage, 
			loadHomePage, 
			loadProfilePage,
			loadGalleryPage,
			loadRegisterPage,
			loadDirectoryPage,
			loadConverterPage,
			loadResource,
			loadTheme,
			loadSitemap,
		} from "../controllers/frontend.js";
import { frontendLogin } from "../controllers/frontend.js";
import { logger } from "../lib/logger.js";
import { isPubkeyValid } from "../lib/authorization.js";
import { limiter } from "../lib/security/core.js";
import { getResource, getSiteManifest, isAutoLoginEnabled } from "../lib/frontend.js";
import { getClientInfo } from "../lib/security/ips.js";

export const loadFrontendEndpoint = async (app: Application, version: string): Promise<void> => {

	// Legacy frontend routes
	app.get("/api", (_req, res) => {
		res.redirect("/api/v2/");
	});
	app.get("/api/v1", (_req, res) => {
		res.redirect("/api/v2/");
	});

	// Current v2 routes (index)
	app.get([`/api/${version}`, `/`], async (req, res) => {
		if(req.originalUrl.slice(-1) !== '/') {
			return res.redirect(301, req.originalUrl + '/');
		}
		if (await isAutoLoginEnabled(req,res)){logger.info("Autologin enabled.  Showing alert on frontend", "|", getClientInfo(req).ip)}
		loadHomePage(req, res, version);
	});

	// Login page
	app.get([`/api/${version}/login`, `/login`], limiter(10), async (req, res) => {
		if (req.session.identifier != null && req.session.identifier != undefined && req.session.identifier != "") {
			res.redirect("/api/v2/");
		} else {
			if (await isAutoLoginEnabled(req,res)) {
				res.redirect("/api/v2/");
			} else {
				loadLoginPage(req, res, version);
			}
		}
	});

	// Login POST
	app.post(["/api/" + version + "/login/:param1?", "/login/:param1?"], 
		limiter(4), 
		express.json({limit: '1mb'}), 
		(req, res) => {
			frontendLogin(req, res);
		}
	);

	// Tos
	app.get([`/api/${version}/tos`, `/tos`], limiter(), async (req, res) => {
		if (await isAutoLoginEnabled(req,res)){logger.info("Autologin enabled.  Showing alert on frontend", "|", getClientInfo(req).ip)}
		loadMdPage(req,res,"tosFilePath",version);
	});

	// Privacy
	app.get([`/api/${version}/privacy`, `/privacy`], limiter(), async (req, res) => {
		if (await isAutoLoginEnabled(req,res)){logger.info("Autologin enabled.  Showing alert on frontend", "|", getClientInfo(req).ip)}
		loadMdPage(req,res,"privacyFilePath",version);
	});

	// Legal
	app.get([`/api/${version}/legal`, `/legal`], limiter(), async (req, res) => {
		if (await isAutoLoginEnabled(req,res)){logger.info("Autologin enabled.  Showing alert on frontend", "|", getClientInfo(req).ip)}
		loadMdPage(req,res,"legalFilePath",version);
	});

	// Documentation
	app.get([`/api/${version}/documentation`, `/documentation`], limiter(), async (req, res) => {
		if (await isAutoLoginEnabled(req,res)){logger.info("Autologin enabled.  Showing alert on frontend", "|", getClientInfo(req).ip)}
		loadDocsPage(req,res,version);
	});

	// Gallery
	app.get([`/api/${version}/gallery`, `/gallery`, `/public`], limiter(),  async (req, res) => {
		if (await isAutoLoginEnabled(req,res)){logger.info("Autologin enabled.  Showing alert on frontend", "|", getClientInfo(req).ip)}
		loadGalleryPage(req,res,version);
	});

	// Register
	app.get([`/api/${version}/register`, `/register`], limiter(), async (req, res) => {
		if (await isAutoLoginEnabled(req,res)){logger.info("Autologin enabled.  Showing alert on frontend", "|", getClientInfo(req).ip)}
		loadRegisterPage(req,res,version);
	});

	// Directory
	app.get([`/api/${version}/directory`, `/directory`], limiter(), async (req, res) => {
		if (await isAutoLoginEnabled(req,res)){logger.info("Autologin enabled.  Showing alert on frontend", "|", getClientInfo(req).ip)}
		loadDirectoryPage(req,res,version);
	});

	// Converter
	app.get([`/api/${version}/converter`, `/converter`], limiter(), async (req, res) => {
		if (await isAutoLoginEnabled(req,res)){logger.info("Autologin enabled.  Showing alert on frontend", "|", getClientInfo(req).ip)}
		loadConverterPage(req,res,version);
	});

	// Dashboard
	app.get([`/api/${version}/dashboard`, `/dashboard`], limiter(), async (req, res) => {
		if (req.session.identifier == null){
			res.redirect("/api/" +  version + "/login");
		}else if (await isPubkeyValid(req.session.identifier, true) == false){
			res.redirect("/api/v2/");
		}else{
			if (await isAutoLoginEnabled(req,res)){logger.info("Autologin enabled.  Showing alert on frontend", "|", getClientInfo(req).ip)}
			loadDashboardPage(req,res,version);
		}
	});

	// Settings
	app.get([`/api/${version}/settings`, `/settings`], limiter(), async (req, res) => {
		if (req.session.identifier == null){
			res.redirect("/api/" +  version + "/login");
		}else if (await isPubkeyValid(req.session.identifier, true) == false){
			res.redirect("/api/v2/");
		}else{
			if (await isAutoLoginEnabled(req,res)){logger.info("Autologin enabled.  Showing alert on frontend", "|", getClientInfo(req).ip)}
			loadSettingsPage(req,res,version);
		}
	});

	// Profile (private and public)
	app.get([`/api/${version}/profile/:param1?`, `/profile/:param1?`, `/u/:param1?`], limiter(), async (req, res) => {
		if (await isAutoLoginEnabled(req,res)){
			logger.info("Autologin enabled. Showing alert on frontend", "|", getClientInfo(req).ip)
		}
		loadProfilePage(req,res,version);
	});

	// Serve dynamic resources with multi-tenant and fallback logic
	app.get("/static/resources/:filename", limiter(), loadResource);

	// Dynamic themes
	app.get("/static/css/theme.css", limiter(), loadTheme);


	// Logout
	app.get("/api/" +  version + "/logout", limiter(), (req, res) => {
		req.session.destroy(async (err) => {
			if (err) {
				logger.error("Failed to destroy session:", err);
			}
			res.clearCookie("connect.sid");
			res.clearCookie("authkey");

			res.redirect("/api/" +  version + "/login");
		});
	});

	// The relay frontend page is managed by the relay.route.ts file

	// Favicons
	app.get(["/favicon.ico", "/favicon-32x32.png", "/favicon-16x16.png", "/apple-touch-icon.png", "/android-chrome-192x192.png", "/android-chrome-512x512.png"],
			limiter(), loadResource);

	// Manifest
	app.get("/site.webmanifest", getSiteManifest);

	// Sitemap
	app.get("/sitemap.xml", loadSitemap);

};
