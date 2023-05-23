import { Application } from "express";
import * as multer from "multer";

import { GetMediabyID, Uploadmedia } from "../controllers/media";

const upload = multer.default({
	storage: multer.memoryStorage(),
	limits: { fileSize: 100 * 1024 * 1024 }, //100MB max file size
});

export const LoadMediaEndpoint = async (app: Application): Promise<void> => {

	app.post("/api/v1/media",upload.single("mediafile"), Uploadmedia);

	app.get("/api/v1/media", GetMediabyID);

};
