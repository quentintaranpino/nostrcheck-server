import { Application } from "express";

import { Redirectlightningddress, UpdateLightningAddress, DeleteLightningAddress } from "../controllers/lightningaddress.js";

export const LoadLightningaddressEndpoint = async (app: Application): Promise<void> => {

	//Get lightning redirect
	app.get("/api/v1/lightningaddress", Redirectlightningddress);

	//Update lightning address
	app.put("/api/v1/lightningaddress/:lightningaddress", UpdateLightningAddress);

	//Delete lightning address
	app.delete("/api/v1/lightningaddress", DeleteLightningAddress);

};