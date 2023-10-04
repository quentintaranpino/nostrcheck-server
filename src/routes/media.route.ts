import { Application } from "express";
import multer from "multer";
import config from "config";

import { GetMediaStatusbyID, GetMediabyURL, Uploadmedia, DeleteMedia, UpdateMediaVisibility, GetMediaTagsbyID, GetMediabyTags } from "../controllers/media.js";
import { GetNIP96file } from "../lib/nostr/NIP96.js";
const maxMBfilesize :number = config.get('media.maxMBfilesize');

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: maxMBfilesize * 1024 * 1024 },
});

export const LoadMediaEndpoint = async (app: Application): Promise<void> => {

	//NIP96 json file
	app.get("/api/v1/nip96", GetNIP96file);
	
	//Upload media
	app.post("/api/v1/media", upload.any(), Uploadmedia);

	//Delete media
	app.delete("/api/v1/media/:fileId", DeleteMedia);

	//Get media status by id 
	app.get("/api/v1/media", GetMediaStatusbyID);
	app.get("/api/v1/media/:id", GetMediaStatusbyID);

	//Get media tags by id
	app.get("/api/v1/media/:fileId/tags/", GetMediaTagsbyID);

	//Get media by tags
    app.get("/api/v1/media/tag/:tag", GetMediabyTags);

	//Get media by url
	app.get("/api/v1/media/:username/:filename", GetMediabyURL);

	//Update media visibility
	app.put("/api/v1/media/:fileId/visibility/:visibility", UpdateMediaVisibility);
	
};
