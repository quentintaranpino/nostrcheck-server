import { Application } from "express";
import { getPlugins } from "../controllers/plugins.js";
import { reloadPlugins } from "../controllers/plugins.js";
import { limiter } from "../lib/security/core.js";
import { getModuleInfo } from "../lib/config/core.js";

export const loadPluginsEndpoint = async (app: Application, version:string): Promise<void> => {

	if (version != "v2") return;

	const base = `/api/${version}${getModuleInfo("plugins", "")?.path}`;
	
	// Get plugins
	app.get(`${base}`, limiter(), getPlugins);

	// Reload plugins
	app.post(`${base}/reload`, limiter(), reloadPlugins);

};