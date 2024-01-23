import { Application } from "express";

import { verifyEventController } from "../controllers/verify.js";

export const loadVerifyEndpoint = async (app: Application, version:string): Promise<void> => {

	if (version == "v1" || version == "v2"){
	app.post("/api/" + version + app.get("activeEndpoints")["verify"]["path"], verifyEventController);
	}

};
