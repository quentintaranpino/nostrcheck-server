import { Application } from "express";

import { AvailableDomains, AvailableUsers } from "../controllers/domains.js";

export const LoadDomainsEndpoint = async (app: Application): Promise<void> => {
	app.get("/api/v1/domains", AvailableDomains);

	app.get("/api/v1/domains/:domain/users", AvailableUsers)
};
