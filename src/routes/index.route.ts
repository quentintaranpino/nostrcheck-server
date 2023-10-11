import { Application } from "express";

import { APIIndex } from "../controllers/index.js";

export const LoadIndexEndpoint = async (app: Application, _version:string): Promise<void> => {

	app.get("/", (_req, res) => {
		res.redirect("/api/v2");
	});
	app.get("/api", (_req, res) => {
		res.redirect("/api/v2");
	});

	app.get("/api/v1", (_req, res) => {
		res.redirect("/api/v2");
	});

	app.get("/api/v2", APIIndex);
		
};
