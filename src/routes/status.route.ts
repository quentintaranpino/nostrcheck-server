import { Application } from "express";

import { ServerStatus } from "../controllers/status.js";

export const LoadStatusesEndpoint = async (app: Application): Promise<void> => {
	app.get("/api/v1/status", ServerStatus);
};
