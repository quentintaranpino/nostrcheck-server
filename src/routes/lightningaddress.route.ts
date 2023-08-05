import { Application } from "express";

import { Redirectlightningddress } from "../controllers/lightningaddress.js";

export const LoadLightningaddressEndpoint = async (app: Application): Promise<void> => {
	app.get("/api/v1/lightningaddress", Redirectlightningddress);
};
