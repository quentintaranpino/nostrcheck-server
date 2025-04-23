import { Application } from "express";

import { getNostraddress } from "../controllers/nostraddress.js";
import { limiter } from "../lib/security/core.js";
import { getModuleInfo } from "../lib/config/core.js";

export const loadNostraddressEndpoint = async (app: Application, version:string): Promise<void> => {

	const base = `/api/${version}${getModuleInfo("nostraddress", "")?.path}`;

	// Nostraddress endpoint
	app.get(`${base}`, limiter(), getNostraddress);

};
