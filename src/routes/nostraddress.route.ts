import { Application } from "express";

import { getNostraddress } from "../controllers/nostraddress.js";
import { limiter } from "../lib/security/core.js";

export const loadNostraddressEndpoint = async (app: Application, version:string): Promise<void> => {

	if (version == "v1" || version == "v2"){
		app.get("/api/" + version + app.get("config.server")["availableModules"]["nostraddress"]["path"], limiter(), getNostraddress);
	}

};
