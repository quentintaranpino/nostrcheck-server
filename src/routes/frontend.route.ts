import { Application } from "express";
import { loadDashboardPage, loadTosPage, loadLoginPage, loadIndexPage } from "../controllers/frontend.js";
import { frontendLogin } from "../controllers/frontend.js";
import { logger } from "../lib/logger.js";
import { isPubkeyValid } from "../lib/authorization.js";

import { limiter } from "../lib/session.js"

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
	app.get("/api/" + version, limiter(100), (req, res) => {
		loadIndexPage(req,res,version);
	});

	// Login page
	app.get("/api/" +  version + "/login", limiter(10), (req, res) => {
		loadLoginPage(req,res,version);
	});

	// Login POST
	app.post("/api/" +  version + "/login", limiter(5), (req, res) => {
		frontendLogin(req,res)
	});

	// Tos
	app.get("/api/" +  version + "/tos", (req, res) => {
		loadTosPage(req,res,version);
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
