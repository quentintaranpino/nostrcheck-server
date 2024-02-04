import { Application } from "express";
import { loadDashboardPage, loadTosPage, loadLoginPage, loadIndexPage } from "../controllers/frontend.js";
import { adminLogin } from "../controllers/admin.js";

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
	app.get("/api/" + version, (req, res) => {
		loadIndexPage(req,res,version);
	});

	// Login page
	app.get("/api/" +  version + "/login", (req, res) => {
		loadLoginPage(req,res,version);
	});

	// Login POST
	app.post("/api/" +  version + "/login", (req, res) => {
		adminLogin(req,res)
	});

	// Tos
	app.get("/api/" +  version + "/tos", (req, res) => {
		loadTosPage(req,res,version);
	});

	// Dashboard
	app.get("/api/" +  version + "/dashboard", async (req, res) => {
		if (req.session.identifier == null){
			res.redirect("/api/" +  version + "/login");
		}else{
		loadDashboardPage(req,res,version);
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
