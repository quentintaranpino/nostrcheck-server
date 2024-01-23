import { Application } from "express";

import { AvailableDomains, AvailableUsers, UpdateUserDomain } from "../controllers/domains.js";

export const loadDomainsEndpoint = async (app: Application, version:string): Promise<void> => {

	if (version == "v1" || version == "v2"){

		app.get("/api/" + version + "/domains", AvailableDomains);

		app.get("/api/" + version + "/domains/:domain/users", AvailableUsers)

		app.put("/api/" + version + "/domains/:domain", UpdateUserDomain)
	}

};