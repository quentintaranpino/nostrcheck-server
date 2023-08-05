import { Application } from "express";

import { Redirectlightningddress, UpdateLightningAddress } from "../controllers/lightningaddress.js";

export const LoadLightningaddressEndpoint = async (app: Application): Promise<void> => {

	//Get lightning redirect
	app.get("/api/v1/lightningaddress", Redirectlightningddress);

	//Update lightning address
	app.put("/api/v1/lightningaddress/:lightningaddress", UpdateLightningAddress);

};