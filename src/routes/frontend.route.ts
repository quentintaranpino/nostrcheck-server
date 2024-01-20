import { Application } from "express";
import { adminLogin } from "../controllers/admin.js";


declare module 'express-session' {
	interface Session {
	   username: string;
	 }
}

export const LoadFrontendEndpoint = async (app: Application, _version:string): Promise<void> => {

	//Legacy routes
	app.get("/", (_req, res) => {
		res.redirect("/api/v2");
	});
	app.get("/api", (_req, res) => {
		res.redirect("/api/v2");
	});
	app.get("/api/v1", (_req, res) => {
		res.redirect("/api/v2");
	});

	//Current v2 routes
	app.get("/api/v2", (req, res) => {
		if (req.session.username == null){
			res.redirect('/login');
		}else{
		res.render("index.ejs", {request: req});
		}
	});

	//Login
	app.get("/login", (req, res) => {
		res.render("login.ejs", {request: req});
	});
	app.post("/login", (req, res) => {
		adminLogin(req).then((result) => {
			if (result){
				res.redirect('/api/v2');
			}else{
				res.redirect('/login');
			}
		});
	});

	//Tos
	app.get("/tos", (req, res) => {
		res.render("tos.ejs", {request: req});
	});

};
