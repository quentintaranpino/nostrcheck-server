import { Application } from "express";

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

	app.get("/api/v2", (_req, res) => res.render("index.ejs", {request: _req}))

	app.get("/tos", (_req, res) => res.render("tos.ejs", {request: _req}))
	app.get("/login", (_req, res) => res.render("login.ejs", {request: _req}))



};
