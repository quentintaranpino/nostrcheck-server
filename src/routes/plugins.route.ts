import { Application } from "express";
import { getPlugins } from "../controllers/plugins.js";
import { reloadPlugins } from "../controllers/plugins.js";
import { limiter } from "../lib/security/core.js";

export const loadPluginsEndpoint = async (app: Application, version:string): Promise<void> => {

	app.get("/api/" + version + app.get("config.server")["availableModules"]["plugins"]["path"], limiter(), getPlugins);

	app.post("/api/" + version + app.get("config.server")["availableModules"]["plugins"]["path"] + "/reload", limiter(), reloadPlugins);

};