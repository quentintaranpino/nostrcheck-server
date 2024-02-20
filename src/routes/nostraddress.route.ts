import { Application } from "express";

import { checkNostrAddress } from "../controllers/nostraddress.js";

export const loadNostraddressEndpoint = async (app: Application, version:string): Promise<void> => {

	if (version == "v1" || version == "v2"){
		app.get("/api/" + version + app.get("availableModules")["nostraddress"]["path"], checkNostrAddress);
	}

};
