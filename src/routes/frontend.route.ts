import { Application } from "express";
import { adminLogin } from "../controllers/admin.js";
import { markdownToHtml } from "../lib/server.js";

import fs from "fs";
import config from "config";
import { dbSelectAllUsernames } from "../lib/database.js";

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

	// Current v2 routes
	app.get("/api/" + version, (req, res) => {
		req.body.version = app.get("version");
		req.body.APIversion = version;
		req.body.activeModules = app.get("activeModules");
		res.render("index.ejs", {request: req});
	});

	// Login
	app.get("/api/" +  version + "/login", (req, res) => {
		req.body.version = app.get("version");
		res.render("login.ejs", {request: req});
	});
	app.post("/api/" +  version + "/login", (req, res) => {
		adminLogin(req,res)
	});

	// Tos
	app.get("/api/" +  version + "/tos", (req, res) => {
		req.body.version = app.get("version");
		const tosFile = markdownToHtml(fs.readFileSync(config.get("server.tosFilePath")).toString());
		res.render("tos.ejs", { request: req, tos: tosFile });
	});

	// Dashboard
	app.get("/api/" +  version + "/dashboard", async (req, res) => {
		if (req.session.identifier == null){
			res.redirect("/api/" +  version + "/login");
		}else{
			req.body.version = app.get("version");
			req.body.registeredUsernames = await dbSelectAllUsernames();
			console.debug(req.body.registeredUsernames)
			for (const key in req.body.registeredUsernames) {
				console.debug("Registered username: " + req.body.registeredUsernames[key]);
			}
			res.render("dashboard.ejs", {request: req});
		}
	});

	// Logout
	app.get("/api/" +  version + "/logout", (req, res) => {
		req.session.destroy((err) => {
			if (err) {
				return console.log(err);
			}
			res.redirect("/api/" +  version + "/login");
		});
	});

};
