import { Request, Response } from "express";
import app from "../app.js";
import { connect, dbDelete, dbInsert, dbMultiSelect, dbSelect } from "../lib/database.js";
import { logger } from "../lib/logger.js";
import { parseAuthHeader } from "../lib//authorization.js";
import { ParseMediaType, ParseFileType, GetFileTags, standardMediaConversion, getNotFoundMediaFile, readRangeHeader } from "../lib/media.js"
import { requestQueue } from "../lib/media.js";
import {
	asyncTask,
	ProcessingFileData,
	MediaExtraDataResultMessage,
	mediaTypes,
	MediaVisibilityResultMessage,
	UploadStatus,
	MediaStatus,
	videoHeaderRange,
	mime_extension,
} from "../interfaces/media.js";
import { ResultMessage, ResultMessagev2 } from "../interfaces/server.js";
import config from "config";
import path from "path";
import validator from "validator";
import fs from "fs";
import { NIP96_event, NIP96_processing } from "../interfaces/nostr.js";
import { PrepareNIP96_event } from "../lib/nostr/NIP96.js";
import { getClientIp } from "../lib/utils.js";
import { generateBlurhash, generatefileHashfrombuffer } from "../lib/hash.js";
import { mediafilesTableFields, registeredTableFields } from "../interfaces/database.js";
import { isModuleEnabled } from "../lib/config.js";
import { redisClient } from "../lib/redis.js";
import { saveFile } from "../lib/storage/helper.js";
import { fileExist } from "../lib/storage/helper.js";
import crypto from "crypto";
import { writeFileLocal } from "../lib/storage/local.js";
import { getR2File } from "../lib/storage/remote.js";
import { Readable } from "stream";


const uploadMedia = async (req: Request, res: Response, version:string): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("media", app)) {
        logger.warn("Attempt to access a non-active module:","media","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("POST /api/" + version + "/media", "|", getClientIp(req));

	// Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "uploadmedia", false);
	if (EventHeader.status != "success") {
		if(version != "v2"){return res.status(401).send({"result": false, "description" : EventHeader.message});}

		const result : ResultMessagev2 = {
			status: MediaStatus[1],
			message: EventHeader.message
		}
		return res.status(401).send(result);

	}

	// Check if pubkey is on the database
	let pubkey : string = EventHeader.pubkey;
	if (pubkey != await dbSelect("SELECT hex FROM registered WHERE hex = ?", "hex", [pubkey], registeredTableFields) as string) {
		if (config.get("media.allowPublicUploads") == false) {
			logger.warn("pubkey not registered, public uploads not allowed | ", getClientIp(req));
			if(version != "v2"){return res.status(401).send({"result": false, "description" : "public uploads not allowed"});}

			const result: ResultMessagev2 = {
				status: MediaStatus[1],
				message: "public uploads not allowed",
			};
			return res.status(401).send(result);
		}
		logger.info("pubkey not registered, uploading as guest | ", getClientIp(req));
	}
	logger.info("pubkey ->", pubkey, "|", getClientIp(req));

	// Parse upload type. If not defined, default is "media"
	const media_type : string = await ParseMediaType(req, pubkey);

	// Check if file exist on request body
	if (!req.files || req.files == undefined || req.files.length == 0) {
		logger.warn(`RES -> 400 Bad request - Empty file`, "|", getClientIp(req));
		if(version != "v2"){return res.status(400).send({"result": false, "description" : "Empty file"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "Empty file"
		};
		return res.status(400).send(result);
	
	}
	let file: Express.Multer.File | null = null;
	if (Array.isArray(req.files) && req.files.length > 0) {
		file = req.files[0];
	}

	if (!file) {
		logger.warn(`RES -> 400 Bad request - Empty file`, "|", getClientIp(req));
		if(version != "v2"){return res.status(400).send({"result": false, "description" : "Empty file"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "Empty file"
		};
		return res.status(400).send(result);
	}

	// Parse file type. If not defined or not allowed, reject upload.
	file.mimetype = await ParseFileType(req, file);
	if (file.mimetype === "") {
		logger.error(`RES -> 400 Bad request - `, file.mimetype, ` filetype not detected`, "|", getClientIp(req));
		if(version != "v2"){return res.status(400).send({"result": false, "description" : "file type not detected or not allowed"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "file type not detected or not allowed",
		};
		return res.status(400).send(result);
	}
	logger.info("mime ->", file.mimetype, "|", getClientIp(req));

	// Filedata
	const filedata: ProcessingFileData = {
		filename: "",
		fileid: "",
		filesize: file.size,
		pubkey: pubkey,
		width: config.get("media.transform.media.undefined.width"),
		height: config.get("media.transform.media.undefined.height"),
		media_type: media_type,
		originalmime: file.mimetype,
		outputoptions: "",
		originalhash: "",
		hash: "",
		url: "",
		magnet: "",
		torrent_infohash: "",
		blurhash: "",
		status: "",
		description: "",
		servername: "https://" + req.hostname,
		processing_url:"",
		conversionInputPath: "",
		conversionOutputPath: "",
	};

	// Uploaded file SHA256 hash and filename
	filedata.originalhash = await generatefileHashfrombuffer(file);
	filedata.filename = filedata.originalhash +  "." + mime_extension[file.mimetype]
	logger.info("hash ->", filedata.originalhash, "|", getClientIp(req));

	// URL
	const returnURL = app.get("config.media")["returnURL"];
	filedata.url = returnURL 	
    ? `${returnURL}/${pubkey}/${filedata.filename}`
    : `${filedata.servername}/media/${pubkey}/${filedata.filename}`;

	// Standard media conversions
	standardMediaConversion(filedata, file);
	
	// Status
	if (version == "v1"){filedata.status = JSON.parse(JSON.stringify(UploadStatus[0]));}
	if (version == "v2"){filedata.status = JSON.parse(JSON.stringify(MediaStatus[0]));}

	let convert = true;
	let insertfiledb = true;
	let makeBlurhash = true;
	let fileDBExists = false;

	// // Check if the (file SHA256 hash and pubkey) is already on the database, if exist (and the upload is media type) we return the existing file URL
	// const dbHash = await dbMultiSelect(
	// 							"SELECT id, hash, magnet, blurhash, filename, filesize, dimensions " +
	// 							"FROM mediafiles " + 
	// 							"WHERE original_hash = ? and pubkey = ? and filename not like 'avatar%' and filename not like 'banner%' ",
	// 							["id", "hash", "magnet", "blurhash", "filename", "filesize", "dimensions"],
	// 							[filedata.originalhash, pubkey],
	// 							mediafilesTableFields) as string[];

	// if (dbHash[0].length != 0 && media_type == "media") {
	// 	logger.info(`RES ->  File already in database, returning existing URL:`, filedata.servername + "/media/" + pubkey + "/" + filedata.filename, "|", getClientIp(req));

	// 	if (version == "v1"){filedata.status = JSON.parse(JSON.stringify(UploadStatus[2]));}
	// 	if (version == "v2"){filedata.status = JSON.parse(JSON.stringify(MediaStatus[0]));}
	// 	filedata.fileid = dbHash[0];
	// 	filedata.hash = dbHash[1];
	// 	filedata.magnet = dbHash[2];
	// 	filedata.blurhash = dbHash[3];
	// 	filedata.filename = dbHash[4];
	// 	filedata.filesize = +dbHash[5];
	// 	if (dbHash[6] != undefined || dbHash[6] != null || dbHash[6] != "") {
	// 		filedata.width = +(dbHash[6].split("x")[0]);
	// 		filedata.height = +(dbHash[6].split("x")[1]);
	// 	}
	// 	filedata.description = "File exist in database, returning existing URL";
	// 	convert = false; 
	// 	insertfiledb = false;
	// 	makeBlurhash = false;
	// 	fileDBExists = true;
	// }

	if (fileDBExists && !await fileExist(filedata.filename)){
		logger.warn("File already in database but not found on pubkey folder, copying now and processing as new file", "|", getClientIp(req));
		convert = true;
	}

	// Write temp file to disk
	filedata.conversionInputPath = config.get("storage.local.tempPath") + "in" + crypto.randomBytes(20).toString('hex') + filedata.filename;
	if (!await writeFileLocal(filedata.conversionInputPath, file.buffer)) {
		logger.error("Could not write temp file to disk", "|", filedata.conversionInputPath);
		if(version != "v2"){return res.status(500).send({"result": false, "description" : "Internal server error."});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "Internal server error.",
		};
		return res.status(500).send(result);
	}

	// generate blurhash
	if (makeBlurhash) {
		if (filedata.originalmime.toString().startsWith("image")){
			filedata.blurhash = await generateBlurhash(filedata.conversionInputPath);
		}
	}

	// Add file to mediafiles table
	if (insertfiledb) {
		const createdate = new Date(Math.floor(Date.now())).toISOString().slice(0, 19).replace("T", " ");
		const insertResult = await dbInsert(
			"mediafiles", 
			["pubkey", "filename", "original_hash", "hash", "status", "active", "visibility", "date", "ip_address", "magnet", "blurhash", "filesize", "comments"],
			[filedata.pubkey, filedata.filename, filedata.originalhash, filedata.hash, filedata.status, 1, 1, createdate, getClientIp(req), filedata.magnet, filedata.blurhash, filedata.filesize, ""]);

		filedata.fileid = insertResult.toString();
		if (insertResult == 0) {
			logger.error("Error inserting file to database", "|", getClientIp(req));
			if(version != "v2"){return res.status(500).send({"result": false, "description" : "Error inserting file to database"});}
			const result: ResultMessagev2 = {
				status: MediaStatus[1],
				message: "Error inserting file to database",
			};
			return res.status(500).send(result);
		}
	}
	
	let responseStatus = 201;

	if (convert){

		filedata.processing_url = filedata.servername + "/api/v2/media/" + filedata.fileid;
		responseStatus = 202;

		//Send request to transform queue
		const t: asyncTask = {req,filedata,};
		logger.info(`${requestQueue.length() +1} items in queue`);
		filedata.description + "File queued for conversion";
		requestQueue.push(t).catch((err) => {
			logger.error("Error pushing file to queue", err);
			if(version != "v2"){return res.status(500).send({"result": false, "description" : "Error queueing file"});}

			const result: ResultMessagev2 = {
				status: MediaStatus[1],
				message: "Error queueing file",
			};
			return result;
		});
	}

	//v0 and v1 compatibility
	if (version != "v2"){
		const returnmessage: MediaExtraDataResultMessage = {
			result: true,
			description: filedata.description,
			status: filedata.status,
			id: filedata.fileid,
			pubkey: filedata.pubkey,
			url: filedata.url,
			hash: filedata.hash,
			magnet: filedata.magnet,
			tags: await GetFileTags(filedata.fileid)
		};
		logger.info(`RES -> 200 OK - ${filedata.description}`, "|", getClientIp(req));
		return res.status(200).send(returnmessage);
	}

	const returnmessage : NIP96_event = await PrepareNIP96_event(filedata);
	return res.status(responseStatus).send(returnmessage);

};

const getMediaStatusbyID = async (req: Request, res: Response, version:string): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("media", app)) {
        logger.warn("Attempt to access a non-active module:","media","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/media", "|", getClientIp(req));

	// Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "getMediaStatusbyID", false);
	if (EventHeader.status !== "success") {
		
		//v0 and v1 compatibility
		if(version != "v2"){return res.status(401).send({"result": false, "description" : EventHeader.message});}

		const result : ResultMessagev2 = {
			status: MediaStatus[1],
			message: EventHeader.message
		}
		return res.status(401).send(result);

	}

	const servername = "https://" + req.hostname;

	const id = req.params.id || req.query.id || "";
	if (!id) {
		logger.warn(`RES -> 400 Bad request - missing id`, "|", getClientIp(req));

		//v0 and v1 compatibility
		if(version != "v2"){return res.status(400).send({"result": false, "description" : "missing id"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "missing id",
		};
		return res.status(400).send(result);
	}

	logger.info(`GET /api/${version}/media/id/${id}`, "|", getClientIp(req));

	const db = await connect("GetMediaStatusbyID");
	const [dbResult] = await db.query("SELECT mediafiles.id, mediafiles.filename, mediafiles.pubkey, mediafiles.status, mediafiles.magnet, mediafiles.original_hash, mediafiles.hash, mediafiles.blurhash, mediafiles.dimensions, mediafiles.filesize FROM mediafiles WHERE (mediafiles.id = ? and mediafiles.pubkey = ?)", [id , EventHeader.pubkey]);
	let rowstemp = JSON.parse(JSON.stringify(dbResult));
	if (rowstemp[0] == undefined) {
		logger.warn(`File not found in database: ${id}, trying public server pubkey`, "|", getClientIp(req));
		const [dbResult] = await db.query("SELECT mediafiles.id, mediafiles.filename, mediafiles.pubkey, mediafiles.status, mediafiles.magnet, mediafiles.original_hash, mediafiles.hash, mediafiles.blurhash, mediafiles.dimensions, mediafiles.filesize FROM mediafiles WHERE (mediafiles.id = ? and mediafiles.pubkey = ?)", [id , app.get("config.server")["pubkey"]]);
		rowstemp = JSON.parse(JSON.stringify(dbResult));
		if (rowstemp[0] == undefined) {
			logger.error(`File not found in database: ${id}`, "|", getClientIp(req));

			//v0 and v1 compatibility
			if(version != "v2"){return res.status(404).send({"result": false, "description" : "The requested file was not found"});}

			const result: ResultMessagev2 = {
				status: MediaStatus[1],
				message: "The requested file was not found",
			};
		db.end();
		return res.status(404).send(result);
		}
	}

	//Fix dimensions for old API requests
	if (rowstemp[0].dimensions == null) {
		rowstemp[0].dimensions = 0x0;
	}

	db.end();

	//Generate filedata
	const filedata : ProcessingFileData = {
		filename: rowstemp[0].filename,
		width: rowstemp[0].dimensions?.toString().split("x")[0],
		height: rowstemp[0].dimensions?.toString().split("x")[1],
		filesize: rowstemp[0].filesize,
		fileid: rowstemp[0].id,
		pubkey: rowstemp[0].pubkey,
		originalhash: rowstemp[0].original_hash,
		hash: rowstemp[0].hash,
		url: servername + "/media/" + rowstemp[0].pubkey + "/" + rowstemp[0].filename,
		magnet: rowstemp[0].magnet,
		torrent_infohash: "",
		blurhash: rowstemp[0].blurhash,
		media_type: "", 
		originalmime: "",
		outputoptions: "",
		status: rowstemp[0].status,
		description: "",
		servername: servername,
		processing_url: "", 
		conversionInputPath: "",
		conversionOutputPath: "",
	};

	let resultstatus = false;
	let response = 200;

	if (filedata.status == "completed" || filedata.status == "success") {
		filedata.description = "The requested file was found";
		resultstatus = true;
		response = 201;
	}else if (filedata.status == "failed") {
		filedata.description = "It was a problem processing this file";
		resultstatus = false;
		response = 500;
	}else if (filedata.status == "pending") {
		filedata.description = "The requested file is still pending";
		resultstatus = false;
		response = 200;
	}else if (filedata.status == "processing") {
		filedata.description = "The requested file is processing";
		resultstatus = false;
		response = 200;
	}
	const tags = await GetFileTags(rowstemp[0].id);

	logger.info(`RES -> ${response} - ${filedata.description}`, "|", getClientIp(req));

	//v0 and v1 compatibility
	if(version != "v2"){
		const result: MediaExtraDataResultMessage = {
			result: resultstatus,
			description: filedata.description,
			url: filedata.url,
			status: rowstemp[0].status,
			id: rowstemp[0].id,
			pubkey: rowstemp[0].pubkey,
			hash: filedata.hash,
			magnet: rowstemp[0].magnet,
			tags: tags,

		};
		return res.status(response).send(result);
	}

	if (filedata.status == "processing" || filedata.status == "pending") {

		//Select mediafiles table for percentage
		const db = await connect("GetMediaStatusbyID");
		const [dbResult] = await db.query("SELECT percentage FROM mediafiles WHERE id = ?", [id]);
		const rowstemp = JSON.parse(JSON.stringify(dbResult));
		if (rowstemp[0] == undefined) {
			logger.error(`File not found in database: ${id}`, "|", getClientIp(req));

			const result: NIP96_processing = {
				status: MediaStatus[1],
				message: "The requested file was not found",
				percentage: 0,
			};
			db.end();
			return res.status(404).send(result);
		}
		db.end();

		const result: NIP96_processing = {
			status: MediaStatus[2],
			message: filedata.description,
			percentage: rowstemp[0].percentage,
		};
		return res.status(202).send(result);
	}

	if (filedata.status == "failed") {
		const result: NIP96_processing = {
			status: MediaStatus[1],
			message: filedata.description,
			percentage: 0,
		};
		return res.status(404).send(result);
	}

	const returnmessage : NIP96_event = await PrepareNIP96_event(filedata);
	return res.status(response).send(returnmessage);


};

const getMediabyURL = async (req: Request, res: Response) => {

	// Check if current module is enabled
	if (!isModuleEnabled("media", app)) {
        logger.warn("Attempt to access a non-active module:","media","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	//Allow CORS
	res.set("access-control-allow-origin", "*");
	res.set("access-control-allow-methods", "GET");
	res.set("Cross-Origin-Opener-Policy", "*");
	res.set("Cross-Origin-Resource-Policy", "*");
	res.set("X-frame-options", "*")

	// Old API compatibility (username instead of pubkey)
	let username : string = "";
	if (req.params.pubkey.length < 64) {
		const hex = await dbSelect("SELECT hex FROM registered WHERE username = ?", "hex", [req.params.pubkey], registeredTableFields);
		if (hex) {
			logger.debug("Old API compatibility (username instead of pubkey)", req.params.pubkey,"-", hex, "|", getClientIp(req));
			username = req.params.pubkey;
			req.params.pubkey = hex as string;
		}
	}

	// Initial security checks
	if (!req.params.pubkey || 
		req.params.pubkey.length > 64 || 
		!validator.default.matches(req.params.pubkey, /^[a-zA-Z0-9_]+$/) ||
		!req.params.filename || 
		req.params.filename.length > 70 ||
		!validator.default.matches(req.params.filename, /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*\.[a-zA-Z0-9_]+$/)) {
		logger.warn(`RES Media URL -> 400 Bad request:`, req.params.filename, "|", getClientIp(req));
		res.setHeader('Content-Type', 'image/webp');
		return res.status(400).send(await getNotFoundMediaFile());
	}

	// Check if file is active on the database
	const cachedStatus = await redisClient.get(req.params.filename + "-" + req.params.pubkey);
	if (cachedStatus === null || cachedStatus === undefined) {

		const filedata = await dbMultiSelect("SELECT id, active FROM mediafiles WHERE filename = ? and pubkey = ? ", ["id", "active"], [req.params.filename, req.params.pubkey], mediafilesTableFields) as string[];
		if (filedata[0] == undefined || filedata[0] == "" || filedata[0] == null) {
			logger.warn(`RES -> 404 Not Found - ${req.url}`, "| Returning not found media file.", getClientIp(req));
			res.setHeader('Content-Type', 'image/webp');
			return res.status(404).send(await getNotFoundMediaFile());
		}
		logger.debug(filedata[1])
		if (filedata[1] != "1")  {
			logger.warn(`RES -> 401 File not active - ${req.url}`, "| Returning not found media file.", getClientIp(req));

			await redisClient.set(req.params.filename + "-" + req.params.pubkey, "0", {
				EX: app.get("config.redis")["expireTime"],
				NX: true,
			});
			logger.warn(`RES -> 401 File not active - ${req.url}`, "returning not found media file |", getClientIp(req), "|", "cached:", cachedStatus ? true : false);

			res.setHeader('Content-Type', 'image/webp');
			return res.status(401).send(await getNotFoundMediaFile());
		}
		await redisClient.set(req.params.filename + "-" + req.params.pubkey, "1", {
			EX: app.get("config.redis")["expireTime"],
			NX: true,
		});

	}
	if (cachedStatus === "0") {
		logger.warn(`RES -> 401 File not active - ${req.url}`, "returning not found media file |", getClientIp(req), "|", "cached:", cachedStatus ? true : false);
		res.setHeader('Content-Type', 'image/webp');
		return res.status(401).send(await getNotFoundMediaFile());
	}


	// mediaPath checks
	const mediaLocation = app.get("config.storage")["type"];
	logger.debug("mediaLocation", mediaLocation);
	
	const mediaPath = path.normalize(path.resolve(config.get("storage.local.mediaPath")));
	if (!mediaPath) {
		logger.error(`RES Media URL -> 500 Internal Server Error - mediaPath not set`, "|", getClientIp(req));
		res.setHeader('Content-Type', 'image/webp');
		return res.status(500).send(await getNotFoundMediaFile());
	}

	// Check if file path exists.
	let fileName = path.normalize(path.resolve(mediaPath + "/" + req.params.pubkey + "/" + req.params.filename));
	if (!fileExist(fileName)) {
		// try with username instead of pubkey (Old API compatibility)
				fileName = path.normalize(path.resolve(mediaPath + "/" + username + "/" + req.params.filename));
		if (!fileExist(fileName)) {
			logger.warn(`RES Media URL -> 404 Not Found`, "|", getClientIp(req));
			res.setHeader('Content-Type', 'image/webp');
			return res.status(404).send(await getNotFoundMediaFile());
		}
	}

	// Try to prevent directory traversal attacks
	if (!path.normalize(path.resolve(fileName)).startsWith(mediaPath)) {
		logger.warn(`RES -> 403 Forbidden - ${req.url}`, "|", getClientIp(req));
		res.setHeader('Content-Type', 'image/webp');
		return res.status(403).send(await getNotFoundMediaFile());
	}

	// file extension checks and media type
	const ext = path.extname(fileName).slice(1);
	const mediaType: string = Object.prototype.hasOwnProperty.call(mediaTypes, ext) ? mediaTypes[ext] : 'text/html';
	res.setHeader('Content-Type', mediaType);

	//TEST cloudflare signed URL
	const remoteFile = await fetch(await getR2File(req.params.filename));
	if (!remoteFile.ok || !remoteFile.body) {
		logger.error('Failed to fetch from R2');
		return res.status(404).send(await getNotFoundMediaFile());
	}

	const reader = remoteFile.body.getReader();
	const stream = new Readable({
	read() {
		reader.read().then(({ done, value }) => {
		if (done) {
			this.push(null);
		} else {
			this.push(Buffer.from(value));
		}
		});
	}
	});

	stream.pipe(res);

	// // If is a video or audio file we return an stream
	// if (mediaType.startsWith("video") || mediaType.startsWith("audio")) {
		
	// 	let range : videoHeaderRange;
	// 	let videoSize : number;
	// 	try {
	// 		videoSize = fs.statSync(fileName).size;
	// 		range = readRangeHeader(req.headers.range, videoSize);
	// 	} catch (err) {
	// 		logger.warn(`RES -> 404 Not Found - ${req.url}`, "| Returning not found media file.", getClientIp(req));
	// 		res.setHeader('Content-Type', 'image/webp');
	// 		return res.status(404).send(await getNotFoundMediaFile());
	// 	}

	// 	res.setHeader("Content-Range", `bytes ${range.Start}-${range.End}/${videoSize}`);

	// 	// If the range can't be fulfilled.
	// 	if (range.Start >= videoSize || range.End >= videoSize) {
	// 		res.setHeader("Content-Range", `bytes */ ${videoSize}`)
	// 		range.Start = 0;
	// 		range.End = videoSize - 1;
	// 	}

	// 	const contentLength = range.Start == range.End ? 0 : (range.End - range.Start + 1);
	// 	res.setHeader("Accept-Ranges", "bytes");
	// 	res.setHeader("Content-Length", contentLength);
	// 	res.setHeader("Cache-Control", "no-cache")
	// 	res.status(206);

	// 	const videoStream = fs.createReadStream(fileName, {start: range.Start, end: range.End});
	// 	logger.info(`RES -> 206 Video partial Content - start: ${range.Start} end: ${range.End} | ${req.url}`, "|", getClientIp(req), "|", cachedStatus ? true : false);
	// 	return videoStream.pipe(res);
	// }

	// // If is an image we return the entire file
	// fs.readFile(fileName, async (err, data) => {
	// 	if (err) {
	// 		logger.warn(`RES -> 404 Not Found - ${req.url}`, "| Returning not found media file.", getClientIp(req));
	// 		res.setHeader('Content-Type', 'image/webp');
	// 		return res.status(404).send(await getNotFoundMediaFile());
	// 	} 
	// 	logger.info(`RES -> 200 Media file ${req.url}`, "|", getClientIp(req), "|", "cached:", cachedStatus ? true : false);
	// 	res.status(200).send(data);

	// });

};

const getMediaTagsbyID = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("media", app)) {
        logger.warn("Attempt to access a non-active module:","media","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	// Get available tags for a specific media file
	logger.info("REQ -> Media file tag list", "|", getClientIp(req));

	// Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "getMediaTagsbyID", false);
	if (EventHeader.status !== "success") {return res.status(401).send({"result": EventHeader.status, "description" : EventHeader.message});}

	logger.info("REQ -> Media tag list -> pubkey:", EventHeader.pubkey, "-> id:", req.params.fileId, "|", getClientIp(req));

	//Query database for media tags
	try {
		const conn = await connect("GetMediaTagsbyID");
		const [rows] = await conn.execute("SELECT tag FROM mediatags INNER JOIN mediafiles ON mediatags.fileid = mediafiles.id where fileid = ? and pubkey = ? ", [req.params.fileId, EventHeader.pubkey]);
		const rowstemp = JSON.parse(JSON.stringify(rows));

		if (rowstemp[0] !== undefined) {
			conn.end();
			logger.info("RES -> Media tag list ", "|", getClientIp(req));
			return res.status(200).send( JSON.parse(JSON.stringify(rows)));
		}else{
			//If not found, try with public server pubkey
			logger.info("Media tag list not found, trying with public server pubkey", "|", getClientIp(req));
			const [Publicrows] = await conn.execute("SELECT tag FROM mediatags INNER JOIN mediafiles ON mediatags.fileid = mediafiles.id where fileid = ? and pubkey = ?", [req.params.fileId, app.get("config.server")["pubkey"]]);
			const Publicrowstemp = JSON.parse(JSON.stringify(Publicrows));
			if (Publicrowstemp[0] !== undefined) {
				conn.end();
				logger.info("RES -> Media tag list ", "|", getClientIp(req));
				return res.status(200).send( JSON.parse(JSON.stringify(Publicrows)));
			}
		}

		conn.end();
		logger.warn("RES -> Empty media tag list ", "|", getClientIp(req));
		return res.status(404).send( JSON.parse(JSON.stringify({ "media tags": "No media tags found" })));
	} catch (error) {
		logger.error(error);

		return res.status(500).send({ description: "Internal server error" });
	}

};

const getMediabyTags = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("media", app)) {
        logger.warn("Attempt to access a non-active module:","media","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	//Get media files by defined tags
	logger.info("REQ -> Media files for specified tag", "|", getClientIp(req));

	// Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "getMediabyTags", false);
	if (EventHeader.status !== "success") {return res.status(401).send({"result": EventHeader.status, "description" : EventHeader.message});}

	logger.info("REQ -> Media files for specified tag -> pubkey:", EventHeader.pubkey, "-> tag:", req.params.tags, "|", getClientIp(req));

	//Check database for media files by tags
	try {
		const conn = await connect("GetMediabyTags");
		const [rows] = await conn.execute("SELECT mediafiles.id, mediafiles.filename, mediafiles.pubkey, mediafiles.status FROM mediatags INNER JOIN mediafiles ON mediatags.fileid = mediafiles.id WHERE tag = ? and mediafiles.pubkey = ? ", [req.params.tag, EventHeader.pubkey]);
		const rowstemp = JSON.parse(JSON.stringify(rows));

		if (rowstemp[0] !== undefined) {
			conn.end();
			logger.info("RES -> Media files for specified tag ", "|", getClientIp(req));
			const result = {
				result: true,
				description: "Media files found",
				mediafiles: rows,
			};
	
			return res.status(200).send(result);
		}else{
			//If not found, try with public server pubkey
			logger.info("Media files for specified tag not found, trying with public server pubkey", "|", getClientIp(req));
			const [Publicrows] = await conn.execute("SELECT mediafiles.id, mediafiles.filename, mediafiles.pubkey, mediafiles.status FROM mediatags INNER JOIN mediafiles ON mediatags.fileid = mediafiles.id WHERE tag = ? and mediafiles.pubkey = ?", [req.params.tag, app.get("config.server")["pubkey"]]);
			const Publicrowstemp = JSON.parse(JSON.stringify(Publicrows));
			if (Publicrowstemp[0] !== undefined) {
				conn.end();
				logger.info("RES -> Media files for specified tag ", "|", getClientIp(req));
				const result = {
					result: true,
					description: "Media files found",
					mediafiles: Publicrows,
				};

				return res.status(200).send(result);
			}
		}

		conn.end();
		logger.warn("RES -> Empty media files for specified tag ", "|", getClientIp(req));
		return res.status(404).send( JSON.parse(JSON.stringify({ "media files": "No media files found" })));
	} catch (error) {
		logger.error(error);
		
		return res.status(500).send({ description: "Internal server error" });
	}

};

const updateMediaVisibility = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("media", app)) {
        logger.warn("Attempt to access a non-active module:","media","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	//Update media visibility
	logger.info("REQ -> Update media visibility", "|", getClientIp(req));

	// Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "updateMediaVisibility", false);
	if (EventHeader.status !== "success") {return res.status(401).send({"result": EventHeader.status, "description" : EventHeader.message});}

	logger.info("REQ -> Update media visibility -> pubkey:", EventHeader.pubkey, "-> id:", req.params.fileId, "-> visibility:", req.params.visibility, "|", getClientIp(req));

	//Check if fileId is not empty
	if (!req.params.fileId) {
		logger.warn("RES -> 400 Bad request - missing fileId", "|", getClientIp(req));
		const result: ResultMessage = {
			result: false,
			description: "missing fileId",
		};
		return res.status(400).send(result);
	}

	//Check if visibility is valid
	if (req.params.visibility != "1" && req.params.visibility != "0") {
		logger.warn("RES -> Invalid visibility value", "|", getClientIp(req));
		const result: ResultMessage = {
			result: false,
			description: "Invalid visibility value",
		};
		return res.status(400).send(result);
	}

	//Update table mediafiles whith new visibility
	try {
		const conn = await connect("UpdateMediaVisibility");
		const [rows] = await conn.execute("UPDATE mediafiles SET visibility = ? WHERE id = ? and pubkey = ?", [req.params.visibility, req.params.fileId, EventHeader.pubkey]);
		const rowstemp = JSON.parse(JSON.stringify(rows));
		conn.end();
		if (rowstemp.affectedRows !== 0) {
			logger.info("RES -> Media visibility updated:", req.params.visibility, "|", getClientIp(req));
			const result: MediaVisibilityResultMessage = {
				result: true,
				description: "Media visibility has changed",
				id: req.params.fileId,
				visibility: req.params.visibility,
			};
			return res.status(200).send(result);
		}

		logger.warn("RES -> Media visibility not updated, media file not found ", "|", getClientIp(req));
		const result = {
			result: false,
			description: "Media visibility not updated, media file not found",
		};
		return res.status(404).send(result);

	} catch (error) {
		logger.error(error);
		const result = {
			result: false,
			description: "Internal server error",
		};
		return res.status(500).send(result);
	}

};

const deleteMedia = async (req: Request, res: Response, version:string): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("media", app)) {
        logger.warn("Attempt to access a non-active module:","media","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	//Check if fileId is not empty
	if (!req.params.id || req.params.id === "" || req.params.id === undefined || req.params.id === null) {
		logger.warn("RES -> 400 Bad request - missing fileId", "|", getClientIp(req));
		if(version != "v2"){return res.status(400).send({"result": false, "description" : "missing fileId"});}
		const result: ResultMessagev2 = {
			status: "error",
			message: "missing fileId",
		};
		return res.status(400).send(result);
	}

	//Check if fileId length is > 70
	if (req.params.id.length > 70) {
		logger.warn("RES -> 400 Bad request - fileId too long", "|", getClientIp(req));
		if(version != "v2"){return res.status(400).send({"result": false, "description" : "fileId too long"});}
		const result: ResultMessagev2 = {
			status: "error",
			message: "fileId too long",
		};
		return res.status(400).send(result);
	}

	// Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "deleteMedia", false);
	if (EventHeader.status !== "success") {
		
		//v0 and v1 compatibility
		if(version != "v2"){return res.status(401).send({"result": false, "description" : EventHeader.message});}

		const result : ResultMessagev2 = {
			status: MediaStatus[1],
			message: EventHeader.message
		}
		return res.status(401).send(result);

	}
	
	logger.info("REQ Delete mediafile ->", req.hostname, " | pubkey:",  EventHeader.pubkey, " | fileId:",  req.params.id, "|", getClientIp(req));

	//Check if mediafile exist on database
	let deleteSelect = "SELECT id, filename FROM mediafiles WHERE pubkey = ? and (filename = ? OR original_hash = ?)";
	if (version != "v2") {deleteSelect = "SELECT id, filename FROM mediafiles WHERE pubkey = ? and id = ?";}

	const selectedFile = await dbMultiSelect(deleteSelect, ["id","filename", "hash"], [EventHeader.pubkey, req.params.id, path.parse(req.params.id).name], mediafilesTableFields, true);
	if (selectedFile[0].length == 0) {
		logger.warn("RES Delete Mediafile -> 404 Not found", EventHeader.pubkey, req.params.id, "|", getClientIp(req));
		if(version != "v2"){return res.status(404).send({"result": false, "description" : "Mediafile deletion not found"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "Mediafile not found",
		};

		return res.status(404).send(result);
	}

	const fileid = selectedFile[0];
	const filename = selectedFile[1];

	if (filename === undefined || filename === null || filename === "") {
		logger.error("Error getting file data from database", EventHeader.pubkey, fileid, "|", getClientIp(req));
		if(version != "v2"){return res.status(500).send({"result": false, "description" : "Error getting file data from database"});}
		const result: ResultMessagev2 = {
			status: "error",
			message: "Error getting file data from database",
		};
		return res.status(500).send(result);
	}

	//Delete mediafile from database
	logger.info("Deleting file from database with id:", fileid, "pubkey:", EventHeader.pubkey, "filename:", filename, "|", getClientIp(req));
	const deleteResult = await dbDelete("mediafiles", ["id","pubkey"],[fileid, EventHeader.pubkey]);
	if (deleteResult == false) {
		logger.warn("RES Delete Mediafile -> 404 Not found on database", EventHeader.pubkey, filename, "|", getClientIp(req));

		//v0 and v1 compatibility
		if(version != "v2"){return res.status(404).send({"result": false, "description" : "Mediafile  not found on database"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "Mediafile not found on database",
		};
		return res.status(404).send(result);
	}

	// Delete file from disk
	try{
		const mediaPath = config.get("storage.local.mediaPath") + EventHeader.pubkey + "/" + filename;
		logger.debug("Deleting file from disk:", mediaPath, "|", getClientIp(req));
		if (await fileExist(mediaPath)){
			logger.info("Deleting file from disk:", mediaPath);
			fs.unlinkSync(mediaPath);
		}
	}catch{
		logger.error("Error deleting file from disk", EventHeader.pubkey, filename, "|", getClientIp(req));
		//v0 and v1 compatibility
		if(version != "v2"){return res.status(500).send({"result": false, "description" : "Error deleting file from disk"})};

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "Error deleting file from disk",
		};
		return res.status(500).send(result);
	}
	logger.info("RES Deleted mediafile ->", req.hostname, " | pubkey:",  EventHeader.pubkey, " | fileId:",  fileid, "|", getClientIp(req));

	//v0 and v1 compatibility
	if (version != "v2"){
		return res.status(200).send({result: true, description: `Mediafile deletion for id: ${fileid}, filename: ${filename} and pubkey ${EventHeader.pubkey} successful`});
	}

	const result: ResultMessagev2 = {
		status: MediaStatus[0],
		message: `Mediafile deletion with id: ${fileid}, filename: ${filename} and pubkey: ${EventHeader.pubkey} successful`,
	};
	return res.status(200).send(result);

};

export { uploadMedia,
		getMediaStatusbyID, 
		getMediabyURL, 
		deleteMedia, 
		updateMediaVisibility, 
		getMediaTagsbyID, 
		getMediabyTags };