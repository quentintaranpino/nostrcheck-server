import { Application } from "express";

import { listDomains, listDomainUsers } from "../controllers/domains.js";
import { limiter } from "../lib/security/core.js";
import { getModuleInfo } from "../lib/config/core.js";

export const loadDomainsEndpoint = async (app: Application, version: string): Promise<void> => {

    if (version != "v1" && version != "v2") return;

    const base = `/api/${version}${getModuleInfo("domains", "")?.path}`;

    // Route to list available domains
    app.get(`${base}`, limiter(), listDomains);

    // Route to list users for a domain
    app.get(`${base}/:domain/users`, limiter(), listDomainUsers);

};