import { Request, Response, Application } from "express";
import multer from "multer";
import { uploadMedia, getMedia, heatMedia, deleteMedia, updateMediaVisibility } from "../controllers/media.js";
import { ResultMessage, ResultMessagev2 } from "../interfaces/server.js";
import { logger } from "../lib/logger.js";
import { getClientIp } from "../lib/utils.js";
import { NIP96Data } from "../controllers/nostr.js";
import app from "../app.js";
import getRawBody from "raw-body";
import { Readable } from "stream";

const maxMBfilesize :number = app.get("config.media")["maxMBfilesize"].toString().replace(',', '.');

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: Math.round(maxMBfilesize * 1024 * 1024)},
});

export const loadMediaEndpoint = async (app: Application, version:string): Promise<void> => {

	const uploadMiddlewarePost = function (req: Request, res: Response) {
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
	}

	const uploadMiddlewarePut = async function (req: Request, res: Response) {

		try{

			const file: Express.Multer.File = {
				fieldname: 'file', 
				originalname: "file",
				encoding: 'binary',
				mimetype: req.headers["content-type"] || "application/octet-stream",
				buffer: Buffer.from(''),
				size: 0,
				stream: Readable.from(Buffer.from('')),
				destination: '', 
				filename: 'file',
				path: '', 
			};

			if (file.mimetype == 'application/json'){
				file.buffer = Buffer.from(JSON.stringify(req.body));
				file.size = file.buffer.length;
				file.originalname = "file.json";
				file.filename = "file.json";
			}else{
				const buffer = await getRawBody(req, {limit: Math.round(maxMBfilesize * 1024 * 1024)});
				file.buffer = buffer;
				file.size = buffer.length;
			}
			
			req.files = [file];

		}catch(err){
			logger.warn(`RES -> 400 Bad request - Empty file`, "|", getClientIp(req));
			if(version != "v2"){return res.status(400).send({"result": false, "description" : "Empty file"});}
		}

		uploadMedia(req, res, version);
	}
	
	// POST & PUT (upload)
	app.post("/api/" + version + app.get("config.server")["availableModules"]["media"]["path"], function (req, res){uploadMiddlewarePost(req,res)}); // v0, v1, v2 and NIP96
	app.put("/api/" + version + app.get("config.server")["availableModules"]["media"]["path"] + "/:param1", async (req, res) => {uploadMiddlewarePut(req,res)}); // Blossom
		
	// DELETE
	app.delete("/api/" + version +  app.get("config.server")["availableModules"]["media"]["path"] + "/:id", function (req, res){deleteMedia(req,res,version)});

	// HEAD
	app.head("/api/" + version + app.get("config.server")["availableModules"]["media"]["path"] + "/:param1", heatMedia);

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