import { Application } from "express";
import multer from "multer";
import { uploadMedia, getMedia, getMediabyURL, deleteMedia, updateMediaVisibility, getMediaTagsbyID, getMediabyTags } from "../controllers/media.js";
import { ResultMessage, ResultMessagev2 } from "../interfaces/server.js";
import { logger } from "../lib/logger.js";
import { getClientIp } from "../lib/utils.js";
import { NIP96Data } from "../controllers/nostr.js";
import app from "../app.js";

const maxMBfilesize :number = app.get("config.media")["maxMBfilesize"].toString().replace(',', '.');

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: Math.round(maxMBfilesize * 1024 * 1024)},
});

export const loadMediaEndpoint = async (app: Application, version:string): Promise<void> => {
	
	// POST
	app.post("/api/" + version + app.get("config.server")["availableModules"]["media"]["path"], function (req, res){
		logger.debug(Math.round(maxMBfilesize * 1024 * 1024))
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
			uploadMedia(req, res, version);
		})
	});

	// DELETE
	app.delete("/api/" + version +  app.get("config.server")["availableModules"]["media"]["path"] + "/:id", function (req, res){deleteMedia(req,res,version)});

	// GET
	app.get(`/api/${version}${app.get("config.server")["availableModules"]["media"]["path"]}/:param1?/:param2?`, function (req, res) {
		getMedia(req, res, version);
	});

	// PUT
	app.put("/api/" + version + app.get("config.server")["availableModules"]["media"]["path"] + "/:fileId/visibility/:visibility", updateMediaVisibility);

	if (version == "v2"){
        //NIP96 json file
        app.get("/api/v2/nip96", NIP96Data);
	}

};