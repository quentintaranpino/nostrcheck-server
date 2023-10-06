import { Application } from "express";
import { NIP96Data } from "../controllers/NIP96.js";

export const LoadNIP96Endpoint = async (app: Application, version:string): Promise<void> => {

	if (version == "v1"){
        //NIP96 json file
        app.get("/api/v1/nip96", NIP96Data);
	}

};
	
    
    
