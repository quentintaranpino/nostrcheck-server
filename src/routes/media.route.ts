import { Request, Response, Application, } from "express";
import express from "express";
import multer from "multer";
import { uploadMedia, getMedia, deleteMedia, updateMediaVisibility, headMedia, headUpload } from "../controllers/media.js";
import { ResultMessage, ResultMessagev2 } from "../interfaces/server.js";
import { logger } from "../lib/logger.js";
import { NIP96Data } from "../controllers/nostr.js";
import app from "../app.js";
import getRawBody from "raw-body";
import { Readable } from "stream";
import { limiter } from "../lib/security/core.js";
import { getClientIp } from "../lib/security/ips.js";

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
				fieldname: '', 
				originalname: "",
				encoding: '',
				mimetype: req.headers["content-type"] || "application/octet-stream",
				buffer: Buffer.from(''),
				size: 0,
				stream: Readable.from(Buffer.from('')),
				destination: '', 
				filename: 'file',
				path: '', 
			};

			const buffer = await getRawBody(req, {limit: Math.round(maxMBfilesize * 1024 * 1024)});
			file.buffer = buffer;
			file.size = buffer.length;
			
			req.files = [file];

		}catch(err){
			logger.warn(`RES -> 400 Bad request - Empty file`, "|", getClientIp(req));
			if(version != "v2"){return res.status(400).send({"result": false, "description" : "Empty file"});}
		}

		uploadMedia(req, res, "v2");
	}
	
	// POST & PUT (upload)
	app.post("/api/" + version + app.get("config.server")["availableModules"]["media"]["path"], limiter(app.get('config.security')['media']['maxUploadsMinute']), function (req, res){uploadMiddlewarePost(req,res)}); // v0, v1, v2 and NIP96
	app.put("/api/" + version + app.get("config.server")["availableModules"]["media"]["path"] + "/:param1",  express.raw({ limit: Math.round(maxMBfilesize * 1024 * 1024)}), limiter(app.get('config.security')['media']['maxUploadsMinute']), async (req, res) => {uploadMiddlewarePut(req,res)}); // Blossom upload
	app.put("/upload", express.raw({  limit: Math.round(maxMBfilesize * 1024 * 1024)}), limiter(app.get('config.security')['media']['maxUploadsMinute']), async (req, res) => {uploadMiddlewarePut(req,res)}); // Blossom cdn url upload

	// HEAD (upload)
	app.head("/api/" + version + app.get("config.server")["availableModules"]["media"]["path"] + "/upload", limiter(), headUpload); // Blossom blob upload head
	app.head("/upload", limiter(), headUpload); // Blossom CDN blob upload head

	// DELETE
	app.delete("/api/" + version +  app.get("config.server")["availableModules"]["media"]["path"] + "/:id", 
	limiter(),
	(req, res) => {
		deleteMedia(req,res,version)
	});

	// HEAD
	app.head("/api/" + version + app.get("config.server")["availableModules"]["media"]["path"] + "/:param1", limiter(1000), headMedia);

	// GET 
	app.get(`/api/${version}${app.get("config.server")["availableModules"]["media"]["path"]}/:param1?/:param2?`, 
	limiter(1000),
	(req, res) => {
		getMedia(req, res, version);
	}
	);

	// GET root (media)
	app.get("/:param1([a-fA-F0-9]{64})(\.[a-zA-Z0-9._-]{1,15})?(/:param2([a-fA-F0-9]{64})(\.[a-zA-Z0-9._-]{1,15})?)?", 
	limiter(1000),
	(req, res) => {
		getMedia(req, res, version);
	});

	// PUT (visibility)
	app.put("/api/" + version + app.get("config.server")["availableModules"]["media"]["path"] + "/:fileId/visibility/:visibility", 
	limiter(),
	(req, res) => {
		updateMediaVisibility(req, res, version)
	}
	);

	if (version == "v2") {
	// NIP96 json file
	app.get("/api/v2/nip96", limiter(),NIP96Data);
	}
};