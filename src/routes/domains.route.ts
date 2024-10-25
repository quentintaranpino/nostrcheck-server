import { Application } from "express";
import express from "express";
import { listAvailableDomains, listAvailableUsers, updateUserDomain } from "../controllers/domains.js";
import { limiter } from "../lib/session.js";

export const loadDomainsEndpoint = async (app: Application, version: string): Promise<void> => {

    if (version == "v1" || version == "v2") {

        // Route to list available domains
        app.get("/api/" + version + app.get("config.server")["availableModules"]["domains"]["path"], limiter(), listAvailableDomains);

        // Route to list users for a domain
        app.get("/api/" + version + app.get("config.server")["availableModules"]["domains"]["path"] + "/:domain/users", limiter(), listAvailableUsers);

        // Route to update user domain
        app.put("/api/" + version + app.get("config.server")["availableModules"]["domains"]["path"] + "/:domain", 
            limiter(),
            express.json(), 
            updateUserDomain);
    }

};
