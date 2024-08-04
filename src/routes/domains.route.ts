import { Application } from "express";

import { listAvailableDomains, listAvailableUsers, updateUserDomain } from "../controllers/domains.js";

export const loadDomainsEndpoint = async (app: Application, version:string): Promise<void> => {

	if (version == "v1" || version == "v2"){

		app.get("/api/" + version + app.get("config.server")["availableModules"]["domains"]["path"], listAvailableDomains);

		app.get("/api/" + version + app.get("config.server")["availableModules"]["domains"]["path"] + "/:domain/users", listAvailableUsers)

		app.put("/api/" + version + app.get("config.server")["availableModules"]["domains"]["path"] + "/:domain", updateUserDomain)
	}

};