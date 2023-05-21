import { Application, } from "express";
import {Uploadmedia} from "../controllers/media"
import * as multer from "multer";

const upload = multer.default({
	storage: multer.memoryStorage(),
	limits: { fileSize: 100 * 1024 * 1024 }, //100MB max file size
});

export const LoadMediaEndpoint = async (app: Application): Promise<void>=> {
	app.post("/api/v1/media", upload.single("mediafile"), Uploadmedia);
};
