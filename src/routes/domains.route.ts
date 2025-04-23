import { Application } from "express";
import express from "express";
import { listAvailableDomains, listAvailableUsers, updateUserDomain } from "../controllers/domains.js";
import { limiter } from "../lib/security/core.js";
import { getModuleInfo } from "../lib/config/core.js";

export const loadDomainsEndpoint = async (app: Application, version: string): Promise<void> => {

    if (version != "v1" && version != "v2") return;

    const base = `/api/${version}${getModuleInfo("domains", "")?.path}`;

    // Route to list available domains
    app.get(`${base}`, limiter(), listAvailableDomains);

    // Route to list users for a domain
    app.get(`${base}/:domain/users`, limiter(), listAvailableUsers);

    // Route to update user domain
    app.put(`${base}/:domain`, limiter(), express.json(), updateUserDomain);

};