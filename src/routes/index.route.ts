import { Application } from "express";

import { APIIndexV1 } from "../controllers/index.js";

export const LoadIndexEndpoint = async (app: Application, version:string): Promise<void> => {

	if (version == "v1"){
	app.get("/", (_req, res) => {
		res.redirect("/api/v1");
	});
	app.get("/api", (_req, res) => {
		res.redirect("/api/v1");
	});

	app.get("/api/v1", APIIndexV1);

	}

		
};
