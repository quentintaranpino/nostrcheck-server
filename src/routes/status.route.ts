import { Application } from "express";

import { ServerStatus } from "../controllers/status.js";

export const LoadStatusesEndpoint = async (app: Application, version:string): Promise<void> => {

	if (version == "v1"){
		app.get("/api/v1/status", ServerStatus);
	}

};
