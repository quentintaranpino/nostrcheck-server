import { Application } from "express";

import { registerUsername } from "../controllers/register.js";

export const loadRegisterEndpoint = async (app: Application, version:string): Promise<void> => {

	if (version == "v1" || version == "v2"){
		app.post("/api/" + version + app.get("config.server")["availableModules"]["register"]["path"], registerUsername);
	}
	
};
