import { Application } from "express";

import { getFrontendIndex } from "../controllers/frontend/index.js";
import { getFrontendTOS } from "../controllers/frontend/tos.js";

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

	app.get("/api/v2", getFrontendIndex);
	app.get("/tos",getFrontendTOS);
		
};
