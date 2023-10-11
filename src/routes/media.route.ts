import { Application } from "express";
import multer from "multer";
import config from "config";
import { GetMediaStatusbyID, GetMediabyURL, Uploadmedia, DeleteMedia, UpdateMediaVisibility, GetMediaTagsbyID, GetMediabyTags } from "../controllers/media.js";
import { ResultMessage } from "../interfaces/server.js";
import { logger } from "../lib/logger.js";
const maxMBfilesize :number = config.get('media.maxMBfilesize');

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: maxMBfilesize * 1024 * 1024 },
});

export const LoadMediaEndpoint = async (app: Application, version:string): Promise<void> => {
	
	if (version == "v1" || version == "v2"){
		
		//Upload media
		app.post("/api/" + version + "/media", function (req, res){
			upload.any()(req, res, function (err) {
				//Return 413 Payload Too Large if file size is larger than maxMBfilesize from config file
				if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
					logger.warn("Upload attempt failed: File too large", "|", req.socket.remoteAddress);
					const result: ResultMessage = {
						result: false,
						description: "File too large, max filesize allowed is " + maxMBfilesize + "MB",
					};
					return res.status(413).send(result);
				}
				Uploadmedia(req, res, version);
			})
		});

		//Delete media
		app.delete("/api/" + version + "/media/:fileId", DeleteMedia);

		//Get media status by id 
		app.get("/api/" + version + "/media", GetMediaStatusbyID);
		app.get("/api/" + version + "/media/:id", GetMediaStatusbyID);

		//Get media tags by id
		app.get("/api/" + version + "/media/:fileId/tags/", GetMediaTagsbyID);

		//Get media by tags
		app.get("/api/" + version + "/media/tag/:tag", GetMediabyTags);

		//Get media by url
		app.get("/api/" + version + "/media/:username/:filename", GetMediabyURL);

		//Update media visibility
		app.put("/api/" + version + "/media/:fileId/visibility/:visibility", UpdateMediaVisibility);

	}

};