import { Application } from "express";

import { Checknostraddress } from "../controllers/nostraddress";

export const LoadNostraddressEndpoint = async (app: Application): Promise<void> => {
	app.get("/api/v1/nostraddress", Checknostraddress);
};
