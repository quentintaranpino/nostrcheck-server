import { Application } from "express";

import { VerifyNote } from "../controllers/verify";

export const LoadVerifyEndpoint = async (app: Application): Promise<void> => {
	 app.post("/api/v1/verify", VerifyNote);

	// app.get("/api/v1/verify", (_req, res) => {
	// 	res.status(200).send("Verify endpoint");
	// }
	// );
};
