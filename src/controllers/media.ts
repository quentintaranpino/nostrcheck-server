import { Request, Response } from "express";
import app from "../app.js";
import { connect, dbDelete, dbInsert, dbMultiSelect, dbSelect } from "../lib/database.js";
import { logger } from "../lib/logger.js";
import { parseAuthHeader } from "../lib//authorization.js";
import { getUploadType, getFileType, standardMediaConversion, getNotFoundMediaFile, readRangeHeader, prepareLegacMediaEvent, getMediaDimensions } from "../lib/media.js"
import { requestQueue } from "../lib/media.js";
import {
	asyncTask,
	ProcessingFileData,
	legacyMediaReturnMessage,
	mediaTypes,
	MediaVisibilityResultMessage,
	UploadStatus,
	MediaStatus,
	videoHeaderRange,
	mime_extension,
} from "../interfaces/media.js";
import { ResultMessage, ResultMessagev2 } from "../interfaces/server.js";
import path from "path";
import validator from "validator";
import fs from "fs";
import { NIP96_event, NIP96_processing, NIPKinds } from "../interfaces/nostr.js";
import { PrepareNIP96_event, PrepareNIP96_listEvent } from "../lib/nostr/NIP96.js";
import { generateQRCode, getClientIp } from "../lib/utils.js";
import { generateBlurhash, generatefileHashfrombuffer } from "../lib/hash.js";
import { isModuleEnabled } from "../lib/config.js";
import { redisClient } from "../lib/redis.js";
import { deleteFile, getFilePath } from "../lib/storage/core.js";
import crypto from "crypto";
import { writeLocalFile } from "../lib/storage/local.js";
import { Readable } from "stream";
import { getRemoteFile } from "../lib/storage/remote.js";
import { transaction } from "../interfaces/payments.js";
import { checkTransaction } from "../lib/payments/core.js";
import { blobDescriptor, BUDKinds } from "../interfaces/blossom.js";
import { prepareBlobDescriptor } from "../lib/blossom/BUD02.js";
import { loadMediaPage } from "./frontend.js";
import { getBannedMediaFile, isContentBanned } from "../lib/banned.js";

const uploadMedia = async (req: Request, res: Response, version:string): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("media", app)) {
        logger.warn("Attempt to access a non-active module:","media","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("POST /api/" + version + "/media", "|", getClientIp(req));

	// Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "upload", false);
	if (eventHeader.status != "success") {
		if(version != "v2"){return res.status(401).send({"result": false, "description" : eventHeader.message});}

		const result : ResultMessagev2 = {
			status: MediaStatus[1],
			message: eventHeader.message
		}
		return res.status(401).send(result);

	}
	eventHeader.authkey? res.header("Authorization", eventHeader.authkey): null;

	// Check if pubkey is on the database
	let pubkey : string = eventHeader.pubkey;
	if (pubkey != await dbSelect("SELECT hex FROM registered WHERE hex = ?", "hex", [pubkey]) as string) {
		if (app.get("config.media")["allowPublicUploads"] == false) {
			logger.info("pubkey not registered, public uploads not allowed | ", getClientIp(req));
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

	// getUploadType. If not defined, default is "media"
	const media_type : string = pubkey != app.get("config.server")["pubkey"] ? await getUploadType(req) : "media";
	logger.info("uploadtype ->", media_type, "|", getClientIp(req));

	// Uploaded file
	let file: Express.Multer.File | null = null;
	if (Array.isArray(req.files) && req.files.length > 0) {file = req.files[0];}
	if (!file) {
		logger.warn(`RES -> 400 Bad request - Empty file`, "|", getClientIp(req));
		if(version != "v2"){return res.status(400).send({"result": false, "description" : "Empty file"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "Empty file"
		};
		return res.status(400).send(result);
	}

	// Filedata
	const filedata: ProcessingFileData = {
		filename: "",
		fileid: "",
		filesize: file.size,
		pubkey: pubkey,
		width: app.get("config.media")["transform"]["media"]["undefined"]["width"],
		height: app.get("config.media")["transform"]["media"]["undefined"]["height"],
		media_type: media_type,
		originalmime: "",
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
		date: Math.floor(Date.now() / 1000),
		no_transform: req.params.param1 == "upload" ? true : Boolean(req.body.no_transform) || false,
		newFileDimensions: "",
	};

	// getFileType. If not defined or not allowed, reject upload.
	const fileMimeData = await getFileType(req, file);
	if (fileMimeData.mime == "" || fileMimeData.ext == "") {
		logger.warn(`RES -> 400 Bad request - filetype not detected or not allowed`, "|", getClientIp(req));
		if(version != "v2"){return res.status(400).send({"result": false, "description" : "file type not detected or not allowed"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "file type not detected or not allowed",
		};
		return res.status(400).send(result);
	}
	logger.info("mime ->", fileMimeData.mime, "|", getClientIp(req));
	filedata.originalmime = fileMimeData.mime;

	// Only transform media files
	if (!filedata.originalmime.toString().startsWith("image") && !filedata.originalmime.toString().startsWith("video")) {
		filedata.no_transform = true;
	}

	// Uploaded file SHA256 hash and filename
	filedata.originalhash = await generatefileHashfrombuffer(file);
	filedata.no_transform == true? filedata.filename = `${filedata.originalhash}.${fileMimeData.ext}` : filedata.filename = `${filedata.originalhash}.${mime_extension[fileMimeData.mime]}`;
	logger.info("hash ->", filedata.originalhash, "|", getClientIp(req));
	logger.info("filename ->", filedata.filename, "|", getClientIp(req));

	// URL (NIP96 and old API compatibility)
	const returnURL = app.get("config.media")["returnURL"];
	filedata.url = returnURL 	
    ? `${returnURL}/${pubkey}/${filedata.filename}`
    : `${filedata.servername}/media/${pubkey}/${filedata.filename}`;

	// Blossom compatibility
	if (eventHeader.kind == BUDKinds.BUD01_auth) {
		filedata.url = returnURL 	
		? `${returnURL}/${filedata.originalhash? filedata.originalhash : filedata.filename}`
		: `${filedata.servername}/${filedata.originalhash? filedata.originalhash : filedata.filename}`;
	}

	// Standard media conversions
	standardMediaConversion(filedata, file);
	
	// Status
	if (version == "v1"){filedata.status = JSON.parse(JSON.stringify(UploadStatus[0]));}
	if (version == "v2"){filedata.status = JSON.parse(JSON.stringify(MediaStatus[0]));}

	let processFile = true;
	let insertfiledb = true;
	let makeBlurhash = true;

	// Check if the (file SHA256 hash and pubkey) is already on the database, if exist (and the upload is media type) we return the existing file URL
	const dbHash = await dbMultiSelect(
										["id", "hash", "magnet", "blurhash", "filename", "filesize", "dimensions", "date"],
										"mediafiles ", 
										"original_hash = ? and pubkey = ? ",
										[filedata.originalhash, pubkey],
										true);

	if (dbHash && dbHash.length != 0 && dbHash[0] != undefined && dbHash[0].id != undefined) {
		logger.info(`RES ->  File already in database, returning existing URL:`, filedata.servername + "/media/" + pubkey + "/" + filedata.filename, "|", getClientIp(req));

		if (version == "v1"){filedata.status = JSON.parse(JSON.stringify(UploadStatus[2]));}
		if (version == "v2"){filedata.status = JSON.parse(JSON.stringify(MediaStatus[0]));}
		filedata.fileid = dbHash[0].id;
		filedata.hash = dbHash[0].hash;
		filedata.magnet = dbHash[0].magnet;
		filedata.blurhash = dbHash[0].blurhash;
		filedata.filename = dbHash[0].filename;
		filedata.filesize = +dbHash[0].filesize;
		filedata.width = +(dbHash[0].dimensions.split("x")[0]);
		filedata.height = +(dbHash[0].dimensions.split("x")[1]);
		filedata.description = "File exist in database, returning existing URL";
		filedata.date = dbHash[0].date? Math.floor(dbHash[0].date / 1000) : Math.floor(Date.now() / 1000);
		processFile = false; 
		insertfiledb = false;
		makeBlurhash = false;

		if (await getFilePath(filedata.filename) == "") {
			logger.warn("File already in database but not found on storage server, processing as new file", "|", getClientIp(req));
			processFile = true;
		}
	}

	// Write temp file to disk (for ffmpeg and blurhash)
	if (processFile){
		filedata.conversionInputPath = app.get("config.storage")["local"]["tempPath"] + "in" + crypto.randomBytes(20).toString('hex') + filedata.filename;
		if (!await writeLocalFile(filedata.conversionInputPath, file.buffer)) {
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

		// Media dimensions
		const dimensions = await getMediaDimensions(filedata.conversionInputPath, filedata);
		dimensions? filedata.width = dimensions.width : 640;
		dimensions? filedata.height = dimensions.height : 480;
		dimensions? filedata.newFileDimensions = dimensions.width + "x" + dimensions.height : "640x480";
	}



	// Add file to mediafiles table
	if (insertfiledb) {
		const createdate = new Date(Math.floor(Date.now())).toISOString().slice(0, 19).replace("T", " ");
		const insertResult = await dbInsert(
			"mediafiles", 
			["pubkey", "filename", "original_hash", "hash", "status", "active", "visibility", "date", "ip_address", "magnet", "blurhash", "filesize", "comments", "type", "dimensions"],
			[filedata.pubkey, filedata.filename, filedata.originalhash, filedata.hash, filedata.status, 1, 1, createdate, getClientIp(req), filedata.magnet, filedata.blurhash, filedata.filesize, "", filedata.media_type, filedata.width != 0? filedata.width + "x" + filedata.height : 0],);

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

	if (processFile){

		const procesingURL = app.get("config.media")["returnURL"]
		filedata.processing_url = filedata.no_transform == true? "" : procesingURL
		? `${procesingURL}/${filedata.fileid}`
		: `${filedata.servername}/api/v2/media/${filedata.fileid}`;

		responseStatus = 202;

		//Send request to process queue
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

	logger.info(`RES -> 200 OK - ${filedata.description}`, "|", getClientIp(req));

	//v0 and v1 compatibility
	if (version != "v2"){
		const returnmessage : legacyMediaReturnMessage = await prepareLegacMediaEvent(filedata);
		return res.status(200).send(returnmessage);
	}

	// Blossom compatibility
	if (eventHeader.kind == BUDKinds.BUD01_auth) {
		const returnmessage: blobDescriptor = await prepareBlobDescriptor(filedata);
		return res.status(responseStatus).send(returnmessage);
	}

	// NIP96 compatibility and fallback
	const returnmessage : NIP96_event = await PrepareNIP96_event(filedata);
	return res.status(responseStatus).send(returnmessage);

};

const getMedia = async (req: Request, res: Response, version:string) => {

	if ((req.params.param1 && req.params.param2) && req.params.param1 != "list") {
		if (req.params.param2 == 'tags'){
			req.params.fileId = req.params.param1;
			getMediaTagsbyID(req, res); 
			return;
		}else if(req.params.param1 == 'tag'){
			req.params.tag = req.params.param2;
			getMediabyTags(req, res);
			return;
		}else{
			req.params.pubkey = req.params.param1;
			req.params.filename = req.params.param2;
			getMediabyURL(req, res);
			return;
		}
	}

	// Get media by URL (only filename)
	if (req.params.param1 && req.params.param1.length >= 11) {
		req.params.filename = req.params.param1;
		getMediabyURL(req, res);
		return;
	}

	// Get media by ID, getmedia listing
	if (req.params.param1 && req.params.param1.length < 11) {

		if(req.params.param1 == "list"){
			getMediaList(req, res, version); // List media Blossom compatibility
			return;
		}else{
			req.params.id = req.params.param1;
			getMediaStatusbyID(req, res, version);
			return;
		}
	}

	// List media
	if (req.query && Object.keys(req.query).length > 0 && req.query.page != undefined && req.query.count != undefined) {
		getMediaList(req, res, version); // List media NIP96 compatibility
		return;
	}

	// CDN home page
	if (req.params.param1 == undefined && req.params.param2 == undefined) {
		loadMediaPage(req, res, version) 
		return;
	}

	return res.status(400).send({"status": "error", "message": "Bad request"});

}

const heatMedia = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("media", app)) {
		logger.warn("Attempt to access a non-active module:","media","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("HEAD /media", "|", getClientIp(req));

	// Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "heatMedia", false);
	if (eventHeader.status !== "success") {
		eventHeader.pubkey = "";
	}
	eventHeader.authkey? res.header("Authorization", eventHeader.authkey): null;

	// Get file hash from URL
	const hash = req.params.param1.toString().split(".")[0];
	if (!hash) {
		logger.warn(`RES -> 400 Bad request - missing hash`, "|", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "missing hash"});
	}

	// Check if file exist on storage server
	const filePath = await getFilePath(hash);
	if (filePath == "") {
		logger.info(`RES -> 404 Not found - file not found`, "|", getClientIp(req));
		return res.status(404).send();
	}

	logger.info(`RES -> 200 OK - file found`, "|", getClientIp(req));
	return res.status(200).send();

};

const getMediaList = async (req: Request, res: Response, version:string): Promise<Response> => {

	logger.info("GET /api/" + version + "/media", "|", getClientIp(req));

	// Check if current module is enabled
	if (!isModuleEnabled("media", app)) {
		logger.warn("Attempt to access a non-active module:","media","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	// Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "getMediaList", false);
	if (eventHeader.status !== "success") {
		eventHeader.pubkey = "";
	}
	eventHeader.authkey? res.header("Authorization", eventHeader.authkey): null;

	// Get NIP96 query parameters
	const page = Number(req.query.page) || 0;
	let count = Number(req.query.count) || 10;
	count > 30 ? count = 30 : count; // Limit count value to 30
	const offset = count * page; 

	// Get Blossom query parameters
	const since = req.query.since || "";
	const until = req.query.until || "";
	const pubkey = req.params.param2 || "";

	let whereStatement = "";
	let wherefields : any[] = [];
	
	// Blossom where statement
	if (pubkey != "") {
		whereStatement = "pubkey = ? and active = ? and visibility = ?";
		wherefields = [pubkey, "1", "1"];

		if (since != "") {
			whereStatement += " and date >= ?";
			wherefields.push(since);
		}

		if (until != "") {
			whereStatement += " and date <= ?";
			wherefields.push(until);
		}

		whereStatement += " ORDER BY date DESC";
	}

	// NIP96 where statement
	if (pubkey == "") {
		whereStatement = eventHeader.pubkey ? "pubkey = ? and active = ?" : "active = ? and visibility = ? and checked = ? ORDER BY date DESC LIMIT ? OFFSET ?";
		wherefields = eventHeader.pubkey ? [eventHeader.pubkey, "1", count, offset] : ["1", "1", "1", count, offset];
	}

	// Get files and total from database
	const result = await dbMultiSelect(["id", "filename", "original_hash", "hash", "filesize", "dimensions", "date", "blurhash", "pubkey"],
										"mediafiles",
										`${whereStatement}`,
										wherefields, false);
	
	const selectStatement = eventHeader.pubkey || pubkey ? "SELECT COUNT(*) AS count FROM mediafiles WHERE pubkey = ? and active = '1'" : "SELECT COUNT(*) AS count FROM mediafiles WHERE active = '1' and visibility = '1'";									
	const total = await dbSelect(selectStatement, "count", [eventHeader.pubkey || pubkey]);
	
	const files : any[] = [];
	await result.forEach(async e => {

		const fileData : ProcessingFileData = {

			filename: e.filename,
			originalhash: e.original_hash,
			hash: e.hash,
			filesize: Number(e.filesize),
			date: e.date? Math.floor(e.date / 1000) : Math.floor(Date.now() / 1000),
			fileid: e.id,
			pubkey: eventHeader.pubkey? eventHeader.pubkey : e.pubkey,
			width: Number(e.dimensions?.toString().split("x")[0]),
			height: Number(e.dimensions?.toString().split("x")[1]),
			url: "",
			magnet: "",
			torrent_infohash: "",
			blurhash: e.blurhash,
			servername: "https://" + req.hostname,
			no_transform: e.hash == e.original_hash ? true : false,
			media_type: "",
			originalmime: "",
			outputoptions: "",
			status: "success",
			description: "",
			processing_url: "",
			conversionInputPath: "",
			conversionOutputPath: "",
			newFileDimensions: "",
		};

		// returnURL
		const returnURL = app.get("config.media")["returnURL"];

		// NIP96 compatibility
		if (pubkey == "") {
			fileData.url = returnURL 	
			? `${returnURL}/${e.pubkey}/${fileData.filename}`
			: `${fileData.servername}/media/${e.pubkey}/${fileData.filename}`;
		}

		// Blossom compatibility
		if (pubkey != "") {
			fileData.url = `${fileData.servername}/${fileData.originalhash? fileData.originalhash : fileData.filename}`;
		}

		const file = req.params.param1 == "list" ? await prepareBlobDescriptor(fileData) : await PrepareNIP96_listEvent(fileData);
		files.push(file);
	}
	);

	let response : any;
	// NIP96 compatibility
	if (pubkey == "") {
		response = {
			count: files.length,
			total: total,
			page: page,
			files: files,
		};
	}

	// Blossom compatibility
	if (pubkey != "") {
		response = files
	}

	return res.status(200).send(response);

};

const getMediaStatusbyID = async (req: Request, res: Response, version:string): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("media", app)) {
        logger.warn("Attempt to access a non-active module:","media","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info("GET /api/" + version + "/media", "|", getClientIp(req));

	// Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "getMediaStatusbyID", false);
	if (eventHeader.status !== "success") {
		
		//v0 and v1 compatibility
		if(version != "v2"){return res.status(401).send({"result": false, "description" : eventHeader.message});}

		const result : ResultMessagev2 = {
			status: MediaStatus[1],
			message: eventHeader.message
		}
		return res.status(401).send(result);

	}
	eventHeader.authkey? res.header("Authorization", eventHeader.authkey): null;

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

	const mediaFileData = await dbMultiSelect(["id", "filename", "pubkey", "status", "magnet", "original_hash", "hash", "blurhash", "dimensions", "filesize"],
												"mediafiles",
												"id = ? and (pubkey = ? or pubkey = ?)",
												[id, eventHeader.pubkey, app.get("config.server")["pubkey"]],
												true);

	if (!mediaFileData || mediaFileData.length == 0) {
			logger.error(`File not found in database: ${id}`, "|", getClientIp(req));

			//v0 and v1 compatibility
			if(version != "v2"){return res.status(404).send({"result": false, "description" : "The requested file was not found"});}

			const result: ResultMessagev2 = {
				status: MediaStatus[1],
				message: "The requested file was not found",
			};
		return res.status(404).send(result);
	}

	let { filename, pubkey, status, magnet, original_hash, hash, blurhash, dimensions, filesize } = mediaFileData[0];

	//Fix dimensions for old API requests
	dimensions == null? dimensions = 0x0 : dimensions;

	//Generate filedata
	const filedata : ProcessingFileData = {
		filename: filename,
		width: dimensions?.toString().split("x")[0],
		height: dimensions?.toString().split("x")[1],
		filesize: filesize,
		fileid: id.toString(),
		pubkey: pubkey,
		originalhash: original_hash,
		hash: hash,
		url: servername + "/media/" + pubkey + "/" + filename,
		magnet: magnet,
		torrent_infohash: "",
		blurhash: blurhash,
		media_type: "", 
		originalmime: "",
		outputoptions: "",
		status: status,
		description: "The requested file was found",
		servername: servername,
		processing_url: "", 
		conversionInputPath: "",
		conversionOutputPath: "",
		date: 0,
		no_transform: original_hash == hash ? true : false,
		newFileDimensions: "",
	};

	// URL
	const returnURL = app.get("config.media")["returnURL"];
	filedata.url = returnURL 	
	? `${returnURL}/${pubkey}/${filedata.filename}`
	: `${filedata.servername}/media/${pubkey}/${filedata.filename}`;

	let response = 201;
	if (filedata.status == "failed") {
		filedata.description = "It was a problem processing this file";
		response = 404;
	}
	if (filedata.status == "pending" || filedata.status == "processing") {
		filedata.description = "The requested file is processing";
		response = 200;
	}

	logger.info(`RES -> ${response} - ${filedata.description}`, "|", getClientIp(req));

	//v0 and v1 compatibility
	if(version != "v2"){return res.status(response).send(await prepareLegacMediaEvent(filedata))}; 

	if (filedata.status == "failed") {return res.status(response).send({"result": false, "description" : "The requested file was not found"})};

	if (filedata.status == "processing" || filedata.status == "pending") {
		const processingStatus = await dbSelect("SELECT percentage FROM mediafiles WHERE id = ?", "percentage", [id.toString()]);
		if (processingStatus == undefined) {return res.status(404).send({"result": false, "description" : "The requested file was not found"})};

		const result: NIP96_processing = {
			status: MediaStatus[2],
			message: filedata.description,
			percentage: +processingStatus,
		};
		return res.status(202).send(result);
	}

	const returnmessage : NIP96_event = await PrepareNIP96_event(filedata);
	return res.status(response).send(returnmessage);

};

const getMediabyURL = async (req: Request, res: Response) => {

	logger.debug("getMediabyURL", "|", getClientIp(req));

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

	// Initial security checks
	if (
		req.params.pubkey && req.params.pubkey.length > 64 || 
		req.params.pubkey && !validator.default.matches(req.params.pubkey, /^[a-zA-Z0-9_]+$/) ||
		!req.params.filename || 
		req.params.filename.length > 70 ||
		!validator.default.matches(req.params.filename, /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/)) {
		logger.warn(`RES Media URL -> 400 Bad request:`, req.params.filename, "|", getClientIp(req));
		res.setHeader('Content-Type', 'image/webp');
		return res.status(400).send(await getNotFoundMediaFile());
	}

	// Old API compatibility (username instead of pubkey)
	if (req.params.pubkey && req.params.pubkey.length < 64) {
		const hex = await dbSelect("SELECT hex FROM registered WHERE username = ?", "hex", [req.params.pubkey]);
		if (hex) {
			logger.debug("Old API compatibility (username instead of pubkey)", req.params.pubkey,"-", hex, "|", getClientIp(req));
			req.params.pubkey = hex as string;
		}
	}

	// Check if file is active on the database and if payment is required
	const cachedStatus = await redisClient.get(req.params.filename + "-" + req.params.pubkey);
	if (cachedStatus === null || cachedStatus === undefined) {

		// Standard gallery compatibility (pubkey/file.ext or pubkey/file)
		let whereFields = "(filename = ? OR original_hash = ?) and pubkey = ? and visibility = 1";
		let whereValues = [req.params.filename, req.params.filename, req.params.pubkey];

		// Avatar and banner short URL compatibility (pubkey/avatar.ext or pubkey/banner.ext) (or pubkey/avatar or pubkey/banner)
		if (req.params.filename.startsWith("avatar") || req.params.filename.startsWith("banner")) {
			whereFields = "type = ? and pubkey = ?";
			whereValues = [req.params.filename.split(".")[0], req.params.pubkey];
		}

		// Filename URL compatibility. Blossom compatibility (filename.ext or filename)
		if(!req.params.pubkey) {
			whereFields = "(filename = ? OR original_hash = ?)";
			whereValues = [req.params.filename, req.params.filename];
		}

		const filedata = await dbMultiSelect(
											["id", "active", "transactionid", "filesize", "filename", "pubkey"],
											"mediafiles",
											whereFields  + " ORDER BY id DESC",
			 								whereValues,
											true);
		if (filedata[0] == undefined || filedata[0] == null) {
			logger.info(`RES -> 200 Not Found - ${req.url}`, "| Returning not found media file.", getClientIp(req));
			res.setHeader('Content-Type', 'image/webp');
			return res.status(200).send(await getNotFoundMediaFile());
		}

		let isBanned = await isContentBanned(filedata[0].id, "mediafiles");
		const pubkeyId = await dbMultiSelect(["id"], "registered", "hex = ?", [filedata[0].pubkey], true);
		if (pubkeyId.length > 0) {isBanned = await isContentBanned(pubkeyId[0].id, "registered");}
		if (isBanned) {
			logger.warn(`RES -> 200 Banned content - ${req.url}`, "| Returning not found media file.", getClientIp(req));
			res.setHeader('Content-Type', 'image/webp');
			return res.status(200).send(await getBannedMediaFile());
		}

		if (filedata[0].active != "1")  {
			logger.info(`RES -> 401 File not active - ${req.url}`, "| Returning not found media file.", getClientIp(req));

			await redisClient.set(req.params.filename + "-" + req.params.pubkey, "0", {
				NX: true,
				EX: app.get("config.redis")["expireTime"],
			});
			logger.info(`RES -> 401 File not active - ${req.url}`, "returning not found media file |", getClientIp(req), "|", "cached:", cachedStatus ? true : false);

			res.setHeader('Content-Type', 'image/webp');
			return res.status(401).send(await getNotFoundMediaFile());
		}

		// Allways set the correct filename
		req.params.filename = filedata[0].filename

		// Check if exist a transaction for this media file and if it is paid.
		const transaction = await checkTransaction(filedata[0].transactionid, filedata[0].id, "mediafiles", Number(filedata[0].filesize), req.params.pubkey) as transaction;
		let noCache = false;
		if (transaction.paymentHash != "" && transaction.isPaid == false && isModuleEnabled("payments", app)) {

			// If is not paid, check if the GET request has authorization header (for dashboard admin checking)
			const eventHeader = await parseAuthHeader(req, "getMediaByURL", true);
			
			if (eventHeader.status != "success") {
				// If the GET request has no authorization, we return a QR code with the payment request.
				logger.info(`RES -> 200 Paid media file ${req.url}`, "|", getClientIp(req), "|", "cached:", cachedStatus ? true : false);
				const qrImage = await generateQRCode(transaction.paymentRequest, 
										"Invoice amount: " + transaction.satoshi + " sats", 
										"This file will be unlocked when the Lightning invoice " + 
										"is paid. Then, it will be freely available to everyone");

				res.setHeader('Content-Type', 'image/png');
				res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
				res.setHeader('Pragma', 'no-cache');
				res.setHeader('Expires', '0');
				return res.status(200).send(qrImage);
			}else{
				// If the GET request has authorization, we return the media file normally, without payment, cache and a new authkey.
				noCache = true;
				res.header("Authorization", eventHeader.authkey);
			}
		}
		
		if (noCache == false) {
			await redisClient.set(req.params.filename + "-" + req.params.pubkey, "1", {
				EX: app.get("config.redis")["expireTime"],
				NX: true,
			});
		}

	}
	if (cachedStatus === "0") {
		logger.warn(`RES -> 401 File not active - ${req.url}`, "returning not found media file |", getClientIp(req), "|", "cached:", cachedStatus ? true : false);
		res.setHeader('Content-Type', 'image/webp');
		return res.status(401).send(await getNotFoundMediaFile());
	}

	// file extension checks and media type
	const ext = path.extname(req.params.filename).slice(1);
	const mediaType: string = Object.prototype.hasOwnProperty.call(mediaTypes, ext) ? mediaTypes[ext] : 'text/html';
	res.setHeader('Content-Type', mediaType);

	// mediaPath checks
	const mediaLocation = app.get("config.storage")["type"];
	logger.debug("Media location:", mediaLocation, "|", getClientIp(req));

	if (mediaLocation == "local") {
		const mediaPath = path.normalize(path.resolve(app.get("config.storage")["local"]["mediaPath"]));
		if (!mediaPath) {
			logger.error(`RES Media URL -> 500 Internal Server Error - mediaPath not set`, "|", getClientIp(req));
			res.setHeader('Content-Type', 'image/webp');
			return res.status(500).send(await getNotFoundMediaFile());
		}

		// Check if file exist on storage server
		const fileName = await getFilePath(req.params.filename);
		if (fileName == ""){ 
				logger.warn(`RES Media URL -> 200 Not Found`, "|", getClientIp(req));
				res.setHeader('Content-Type', 'image/webp');
				return res.status(200).send(await getNotFoundMediaFile());
			}

		// Try to prevent directory traversal attacks
		if (!path.normalize(path.resolve(fileName)).startsWith(mediaPath)) {
			logger.warn(`RES -> 403 Forbidden - ${req.url}`, "|", getClientIp(req));
			res.setHeader('Content-Type', 'image/webp');
			return res.status(403).send(await getNotFoundMediaFile());
		}

		// If is a video or audio file we return an stream
		if (mediaType.startsWith("video") || mediaType.startsWith("audio")) {
			
			let range : videoHeaderRange;
			let videoSize : number;
			try {
				videoSize = fs.statSync(fileName).size;
				range = readRangeHeader(req.headers.range, videoSize);
			} catch (err) {
				logger.warn(`RES -> 200 Not Found - ${req.url}`, "| Returning not found media file.", getClientIp(req));
				res.setHeader('Content-Type', 'image/webp');
				return res.status(200).send(await getNotFoundMediaFile());
			}

			res.setHeader("Content-Range", `bytes ${range.Start}-${range.End}/${videoSize}`);

			// If the range can't be fulfilled.
			if (range.Start >= videoSize || range.End >= videoSize) {
				res.setHeader("Content-Range", `bytes */ ${videoSize}`)
				range.Start = 0;
				range.End = videoSize - 1;
			}

			const contentLength = range.Start == range.End ? 0 : (range.End - range.Start + 1);
			res.setHeader("Accept-Ranges", "bytes");
			res.setHeader("Content-Length", contentLength);
			res.setHeader("Cache-Control", "no-cache")
			res.status(206);

			const videoStream = fs.createReadStream(fileName, {start: range.Start, end: range.End});
			logger.info(`RES -> 206 Video partial Content - start: ${range.Start} end: ${range.End} | ${req.url}`, "|", getClientIp(req), "|", cachedStatus ? true : false);
			return videoStream.pipe(res);
		}

		// If is an image we return the entire file
		fs.readFile(fileName, async (err, data) => {
			if (err) {
				logger.warn(`RES -> 200 Not Found - ${req.url}`, "| Returning not found media file.", getClientIp(req));
				res.setHeader('Content-Type', 'image/webp');
				return res.status(200).send(await getNotFoundMediaFile());
			} 
			logger.info(`RES -> 200 Media file ${req.url}`, "|", getClientIp(req), "|", "cached:", cachedStatus ? true : false);
			res.status(200).send(data);

		});

	} else if (mediaLocation == "remote") {

		const remoteFile = await fetch(await getRemoteFile(req.params.filename));
		if (!remoteFile.ok || !remoteFile.body ) {
			logger.error('RES -> 200 - Failed to fetch from remote file server || ' + req.params.filename, getClientIp(req));
			res.setHeader('Content-Type', 'image/webp');
			return res.status(200).send(await getNotFoundMediaFile());
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

		logger.info(`RES -> 200 Media file (pipe from remote server) ${req.params.filename}`, "|", getClientIp(req), "|", "cached:", cachedStatus ? true : false);
		stream.pipe(res);

	}

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
	const eventHeader = await parseAuthHeader(req, "getMediaStatusbyID", false);
	if (eventHeader.status !== "success") {
		const result : ResultMessagev2 = {
			status: MediaStatus[1],
			message: eventHeader.message
		}
		return res.status(401).send(result);
	}
	eventHeader.authkey? res.header("Authorization", eventHeader.authkey): null;
	logger.info("REQ -> Media tag list -> pubkey:", eventHeader.pubkey, "-> id:", req.params.fileId, "|", getClientIp(req));

	//Query database for media tags
	try {
		const conn = await connect("GetMediaTagsbyID");
		const [rows] = await conn.execute("SELECT tag FROM mediatags INNER JOIN mediafiles ON mediatags.fileid = mediafiles.id where fileid = ? and pubkey = ? ", [req.params.fileId, eventHeader.pubkey]);
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
		res.status(400).send({"status": "error", "message": "Module is not enabled"});
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
	const EventHeader = await parseAuthHeader(req, "delete", false);
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

	
	const selectedFile = await dbMultiSelect(	["id","filename", "hash"],
												"mediafiles",
												"pubkey = ? and (filename = ? OR original_hash = ? or id = ?)",
												[EventHeader.pubkey, req.params.id, req.params.id, req.params.id],
												true);
	if (selectedFile.length == 0) {
		logger.warn("RES Delete Mediafile -> 404 Not found", EventHeader.pubkey, req.params.id, "|", getClientIp(req));
		if(version != "v2"){return res.status(404).send({"result": false, "description" : "Mediafile deletion not found"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "Mediafile not found",
		};

		return res.status(404).send(result);
	}

	const fileid = selectedFile[0].id
	const filename = selectedFile[0].filename;


	if (filename === undefined || filename === null || filename === "") {
		logger.error("Error getting file data from database", EventHeader.pubkey, fileid, "|", getClientIp(req));
		if(version != "v2"){return res.status(500).send({"result": false, "description" : "Error getting file data from database"});}
		const result: ResultMessagev2 = {
			status: "error",
			message: "Error getting file data from database",
		};
		return res.status(500).send(result);
	}


	// Check if the file is the last one with the same hash, counting the number of files with the same hash
	const hashCount = await dbSelect("SELECT COUNT(*) as 'count' FROM mediafiles WHERE filename = ?", "count", [filename]);
	if (hashCount != '1') {
		logger.info("Detected more files with same hash, skipping deletion from storage server", EventHeader.pubkey, filename, "|", getClientIp(req));
	}else{
		logger.info("Detected last file with same hash, deleting from storage server", EventHeader.pubkey, filename, "|", getClientIp(req));
		const result = deleteFile(filename);
		if (!result) {
			logger.error("Error deleting file from remote server", EventHeader.pubkey, filename, "|", getClientIp(req));
			//v0 and v1 compatibility
			if(version != "v2"){return res.status(500).send({"result": false, "description" : "Error deleting file from remote server"})};

			const result: ResultMessagev2 = {
				status: MediaStatus[1],
				message: "Error deleting file from storage server",
			};
			return res.status(500).send(result);
		}
	}

	//Delete mediafile from database
	logger.debug("Deleting file from database with id:", fileid, "pubkey:", EventHeader.pubkey, "filename:", filename, "|", getClientIp(req));
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
		getMedia, 
		heatMedia,
		getMediabyURL, 
		deleteMedia, 
		updateMediaVisibility, 
		getMediaTagsbyID, 
		getMediabyTags };