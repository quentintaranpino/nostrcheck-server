import { Application } from "express";
import multer from "multer";
import config from "config";


import { GetMediaStatusbyID, GetMediabyURL, Uploadmedia } from "../controllers/media.js";

const maxMBfilesize :number = config.get('media.maxMBfilesize');

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: maxMBfilesize * 1024 * 1024 },
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
