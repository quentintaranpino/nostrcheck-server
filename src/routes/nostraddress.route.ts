import { Application } from "express";

import { Checknostraddress } from "../controllers/nostraddress.js";

export const LoadNostraddressEndpoint = async (app: Application, version:string): Promise<void> => {

	if (version == "v1" || version == "v2"){
		app.get("/api/" + version + "/nostraddress", Checknostraddress);
	}

};
