import { Application } from "express";

import { Registernewpubkey } from "../controllers/register.js";

export const LoadRegisterEndpoint = async (app: Application, version:string): Promise<void> => {

	if (version == "v1"){
		app.post("/api/v1/register", Registernewpubkey);
	}
	
};
