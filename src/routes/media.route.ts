import { Application } from "express";
import multer from "multer";
import config from "config";
import { getMediaStatusbyID, getMediabyURL, uploadmedia, deleteMedia, updateMediaVisibility, getMediaTagsbyID, getMediabyTags } from "../controllers/media.js";
import { ResultMessage, ResultMessagev2 } from "../interfaces/server.js";
import { logger } from "../lib/logger.js";
import { getClientIp } from "../lib/server.js";
import { NIP96Data } from "../controllers/nostr.js";

const maxMBfilesize :number = config.get('media.maxMBfilesize');

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: maxMBfilesize * 1024 * 1024 },
});

export const loadMediaEndpoint = async (app: Application, version:string): Promise<void> => {
	
	//Upload media
	app.post("/api/" + version + app.get("availableModules")["media"]["path"], function (req, res){
		upload.any()(req, res, function (err) {
			//Return 413 Payload Too Large if file size is larger than maxMBfilesize from config file
			if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
				logger.warn("Upload attempt failed: File too large", "|", getClientIp(req));
				if (version == "v1"){ const result: ResultMessage = { result: false , description: "File too large, max filesize allowed is " + maxMBfilesize + "MB" }; return res.status(413).send(result); }
				const result: ResultMessagev2 = {
					status: "error",
					message: "File too large, max filesize allowed is " + maxMBfilesize + "MB",
				};
				return res.status(413).send(result);
			}
			uploadmedia(req, res, version);
		})
	});

	//Delete media
	app.delete("/api/" + version +  app.get("availableModules")["media"]["path"] + "/:fileId", function (req, res){deleteMedia(req,res,version)});

	//Get media status by id 
	app.get("/api/" + version + app.get("availableModules")["media"]["path"], function (req, res){getMediaStatusbyID(req,res,version)});
	app.get("/api/" + version + app.get("availableModules")["media"]["path"] + "/:id", function (req, res){getMediaStatusbyID(req,res,version)});

	//Get media tags by id
	app.get("/api/" + version + app.get("availableModules")["media"]["path"] + "/:fileId/tags/", getMediaTagsbyID);

	//Get media by tags
	app.get("/api/" + version + app.get("availableModules")["media"]["path"] + "/tag/:tag", getMediabyTags);

	//Get media by url
	app.get("/api/" + version + app.get("availableModules")["media"]["path"] + "/:username/:filename", getMediabyURL);

	//Update media visibility
	app.put("/api/" + version + app.get("availableModules")["media"]["path"] + "/:fileId/visibility/:visibility", updateMediaVisibility);


	if (version == "v2"){
        //NIP96 json file
        app.get("/api/v2/nip96", NIP96Data);
	}

};