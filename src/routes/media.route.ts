import { Application } from "express";
import multer from "multer";
import config from "config";


import { GetMediaStatusbyID, GetMediabyURL, Uploadmedia, UpdateMediaVisibility, GetMediaTagsbyID, GetMediabyTags } from "../controllers/media.js";

const maxMBfilesize :number = config.get('media.maxMBfilesize');

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: maxMBfilesize * 1024 * 1024 },
});

export const LoadMediaEndpoint = async (app: Application): Promise<void> => {
	
	//Upload media
	app.post("/api/v1/media",  upload.fields([{
										name: 'mediafile', maxCount: 1
									}, {
										name: 'publicgallery', maxCount: 1
									}]), Uploadmedia);


	//Get media status by id 
	app.get("/api/v1/media", GetMediaStatusbyID);
	app.get("/api/v1/media/:id", GetMediaStatusbyID);

	//Get media tags by id
	app.get("/api/v1/media/:fileId/tags/", GetMediaTagsbyID);

	//Get media by tags
    app.get("/api/v1/media/tag/:tag", GetMediabyTags);

	//Get media by url
	app.get("/media/*", GetMediabyURL);

	//Update media visibility
	app.put("/api/v1/media/:fileId/public/:visibility", UpdateMediaVisibility);
	
};
