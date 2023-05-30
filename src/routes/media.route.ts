import { Application } from "express";
import * as multer from "multer";
const config = require('config');

import { GetMediaStatusbyID, GetMediabyURL, Uploadmedia } from "../controllers/media";

const upload = multer.default({
	storage: multer.memoryStorage(),
	limits: { fileSize: config.get('media.maxMBfilesize') * 1024 * 1024 },
});

export const LoadMediaEndpoint = async (app: Application): Promise<void> => {

	
	app.post("/api/v1/media",  upload.fields([{
										name: 'mediafile', maxCount: 1
									}, {
										name: 'publicgallery', maxCount: 1
									}]), Uploadmedia);


	app.get("/api/v1/media", GetMediaStatusbyID);

	app.get("/media/*", GetMediabyURL);

};
