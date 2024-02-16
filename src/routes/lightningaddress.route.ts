import { Application } from "express";

import { redirectlightningddress, updateLightningAddress, deleteLightningAddress } from "../controllers/lightningaddress.js";

export const loadLightningaddressEndpoint = async (app: Application, version:string): Promise<void> => {

	//Get lightning redirect
	app.get("/api/" + version + app.get("activeModules")["lightning"]["path"], redirectlightningddress);

	//Update lightning address
	app.put("/api/" + version + app.get("activeModules")["lightning"]["path"] + "/:lightningaddress", updateLightningAddress);

	//Delete lightning address
	app.delete("/api/" + version + app.get("activeModules")["lightning"]["path"], deleteLightningAddress);

};