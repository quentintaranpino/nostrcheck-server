import { Application, } from "express";
import {APIIndex} from "../controllers"

export const LoadIndexEndpoint = async (app: Application): Promise<void>=> {
	app.get("/", (_req, res) => {
		res.redirect("/api/v1");
	});
	app.get("/api", (_req, res) => {
		res.redirect("/api/v1");
	});

	app.get("/api/v1", APIIndex);
};
