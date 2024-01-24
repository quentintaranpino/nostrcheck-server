import { Application } from "express";
import { adminLogin } from "../controllers/admin.js";
import { markdownToHtml } from "../lib/server.js";

import fs from "fs";
import config from "config";

export const loadFrontendEndpoint = async (app: Application, version:string): Promise<void> => {

	// Legacy frontend routes
	app.get("/", (_req, res) => {
		res.redirect("/api/");
	});
	app.get("/api", (_req, res) => {
		res.redirect("/api/v1");
	});
	app.get("/api/v1", (_req, res) => {
		res.redirect("/api/v2");
	});

	// Current v2 routes
	app.get("/api/" + version, (req, res) => {
		req.body.version = app.get("version");
		req.body.APIversion = version;
		req.body.activeModules = app.get("activeModules");
		res.render("index.ejs", {request: req});
	});

	// Login
	app.get("/login", (req, res) => {
		req.body.version = app.get("version");
		res.render("login.ejs", {request: req});
	});
	app.post("/login", (req, res) => {
		adminLogin(req,res)
	});

	// Tos
	app.get("/tos", (req, res) => {
		req.body.version = app.get("version");
		const tosFile = markdownToHtml(fs.readFileSync(config.get("server.tosFilePath")).toString());
		res.render("tos.ejs", { request: req, tos: tosFile });
	});

	// Dashboard
	app.get("/dashboard", (req, res) => {
		if (req.session.identifier == null){
			res.redirect('/login');
		}else{
			req.body.version = app.get("version");
			res.render("dashboard.ejs", {request: req});
		}
	});

	// Logout
	app.get("/logout", (req, res) => {
		req.session.destroy((err) => {
			if (err) {
				return console.log(err);
			}
			res.redirect("/login");
		});
	});

};
