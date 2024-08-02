import { Application } from "express";

import { validateRegisterOTC, registerUsername } from "../controllers/register.js";
import { limiter } from "../lib/session.js";

export const loadRegisterEndpoint = async (app: Application, version:string): Promise<void> => {

	if (version == "v1" || version == "v2"){
		app.post("/api/" + version + app.get("config.server")["availableModules"]["register"]["path"], limiter(5), registerUsername);
	}

	if (version == "v1" || version == "v2"){
		app.post("/api/" + version + app.get("config.server")["availableModules"]["register"]["path"] + "/validate", limiter(5), validateRegisterOTC);
	}

};
