import { Application } from "express";
import { getPlugins } from "../controllers/plugins.js";
import { reloadPlugins } from "../controllers/plugins.js";

export const loadPluginsEndpoint = async (app: Application, version:string): Promise<void> => {

	app.get("/api/" + version + app.get("config.server")["availableModules"]["plugins"]["path"], getPlugins);

	app.post("/api/" + version + app.get("config.server")["availableModules"]["plugins"]["path"] + "/reload", reloadPlugins);

};