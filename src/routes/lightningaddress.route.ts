import { Application } from "express";

import { Redirectlightningddress, UpdateLightningAddress, DeleteLightningAddress } from "../controllers/lightningaddress.js";

export const loadLightningaddressEndpoint = async (app: Application, version:string): Promise<void> => {

	if(version == "v1" || version == "v2"){

		//Get lightning redirect
		app.get("/api/" + version + app.get("activeEndpoints")["lightning"]["path"], Redirectlightningddress);

		//Update lightning address
		app.put("/api/" + version + app.get("activeEndpoints")["lightning"]["path"] + "/:lightningaddress", UpdateLightningAddress);

		//Delete lightning address
		app.delete("/api/" + version + app.get("activeEndpoints")["lightning"]["path"], DeleteLightningAddress);

	}

};