import { Application } from "express";

import { VerifyNote } from "../controllers/verify.js";

export const LoadVerifyEndpoint = async (app: Application, version:string): Promise<void> => {

	if (version == "v1"){
	app.post("/api/v1/verify", VerifyNote);
	}

};
