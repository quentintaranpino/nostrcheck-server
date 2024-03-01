import { Application } from "express";

import { redirectlightningddress, updateLightningAddress, deleteLightningAddress } from "../controllers/lightningaddress.js";

export const loadLightningaddressEndpoint = async (app: Application, version:string): Promise<void> => {

	//Get lightning redirect
	app.get("/api/" + version + app.get("config.server")["availableModules"]["lightning"]["path"], redirectlightningddress); // V0 and V1
	app.get("/api/" + version + app.get("config.server")["availableModules"]["lightning"]["path"] + "/:name", redirectlightningddress);

	//Update lightning address
	app.put("/api/" + version + app.get("config.server")["availableModules"]["lightning"]["path"] + "/:lightningaddress", updateLightningAddress);

	//Delete lightning address
	app.delete("/api/" + version + app.get("config.server")["availableModules"]["lightning"]["path"], deleteLightningAddress);

};