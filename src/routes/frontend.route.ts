import { Application } from "express";
import { Session } from "express-session";

export const LoadFrontendEndpoint = async (app: Application, _version:string): Promise<void> => {

	app.get("/", (_req, res) => {
		res.redirect("/api/v2");
	});
	app.get("/api", (_req, res) => {
		res.redirect("/api/v2");
	});

	app.get("/api/v1", (_req, res) => {
		res.redirect("/api/v2");
	});

	//Frontend
	app.get("/login", (req, res) => {
		res.render("login.ejs", {request: req});
	});

	app.get("/api/v2", (req, res, next) => {
		if (req.session == null){
			res.redirect('/login');
		}   else{
			next();
		}
		res.render("index.ejs", {request: req});
	});
	app.get("/tos", (req, res) => {
		res.render("tos.ejs", {request: req});
	});




};
