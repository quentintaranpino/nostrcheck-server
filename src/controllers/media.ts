import { Request, Response } from "express";
import { Readable } from "stream";
import path from "path";
import validator from "validator";
import fs from "fs";

import { dbDelete, dbInsert, dbMultiSelect, dbSelect, dbUpdate } from "../lib/database/core.js";
import { logger } from "../lib/logger.js";
import { isPubkeyRegistered, parseAuthHeader } from "../lib//authorization.js";
import { getUploadType, getFileMimeType, standardMediaConversion, getNotFoundFileBanner, readRangeHeader, prepareLegacMediaEvent, getMediaDimensions, getExtension, getMimeType, getAllowedMimeTypes, getFileUrl, getMediaUrl } from "../lib/media.js"
import { requestQueue } from "../lib/media.js";
import {
	MediaJob,
	LegacyMediaReturnMessage,
	UploadStatus,
	MediaStatus,
	FileData,
	} from "../interfaces/media.js";
import { ResultMessage, ResultMessagev2 } from "../interfaces/server.js";
import { NIP94_data, NIP96_event, NIP96_processing } from "../interfaces/nostr.js";
import { PrepareNIP96_event, PrepareNIP96_listEvent } from "../lib/nostr/NIP96.js";
import { generateQRCode, getNewDate, parseBoolean } from "../lib/utils.js";
import { generateBlurhash, generatefileHashfrombuffer, hashString } from "../lib/hash.js";
import { deleteFile, getFilePath } from "../lib/storage/core.js";
import { saveTmpFile } from "../lib/storage/local.js";
import { getRemoteFile } from "../lib/storage/remote.js";
import { Transaction } from "../interfaces/payments.js";
import { checkTransaction, collectInvoice, getInvoice, updateAccountId } from "../lib/payments/core.js";
import { BlobDescriptor, BUDKinds } from "../interfaces/blossom.js";
import { prepareBlobDescriptor } from "../lib/blossom/BUD02.js";
import { loadCdnPage } from "./frontend.js";
import { getBannedFileBanner, isEntityBanned } from "../lib/security/banned.js";
import { mirrorFile } from "../lib/blossom/BUD04.js";
import { executePlugins } from "../lib/plugins/core.js";
import { setAuthCookie } from "../lib/frontend.js";
import { isIpAllowed } from "../lib/security/ips.js";
import { getConfig, isModuleEnabled } from "../lib/config/core.js";
import { initRedis } from "../lib/redis/client.js";

const redisCore = await initRedis(0, false);

const uploadMedia = async (req: Request, res: Response, version:string): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`uploadMedia - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		res.setHeader("X-Reason", reqInfo.comments);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("media", req.hostname)) {
        logger.info(`uploadMedia - Attempt to access a non-active module: media | IP:`, reqInfo.ip);
		res.setHeader("X-Reason", "Module is not enabled");
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`uploadMedia - Request from:`, reqInfo.ip);

	// Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "upload", false, false, false);
	if (eventHeader.status != "success") {
		if(version != "v2"){return res.status(401).send({"result": false, "description" : eventHeader.message});}
		const result : ResultMessagev2 = {
			status: MediaStatus[1],
			message: eventHeader.message
		}
		logger.debug(`uploadMedia - Invalid authorization header:`, eventHeader.message, "|", reqInfo.ip);
		res.setHeader("X-Reason", eventHeader.message);
		return res.status(401).send(result);

	}

	const pubkey = eventHeader.pubkey;

	// Public uploads logic
	if (await isPubkeyRegistered(pubkey) == false){
		if (getConfig(req.hostname, ["media", "allowPublicUploads"]) == false) {
			logger.info(`uploadMedia - public uploads not allowed | `, reqInfo.ip);
			if(version != "v2"){return res.status(401).send({"result": false, "description" : "public uploads not allowed"});}

			const result: ResultMessagev2 = {
				status: MediaStatus[1],
				message: "public uploads not allowed",
			};
			res.setHeader("X-Reason", "public uploads not allowed");
			return res.status(401).send(result);
		}
		logger.info(`uploadMedia - pubkey not registered, uploading as guest | `, reqInfo.ip);
	}

	logger.debug(`uploadMedia - pubkey: ${pubkey} | `, reqInfo.ip);

	// getUploadType. If not defined, default is "media"
	const uploadType : string = pubkey != getConfig(req.hostname, ["server", "pubkey"]) ? await getUploadType(req) : "media";
	logger.debug(`uploadMedia - uploadtype: ${uploadType} | `, reqInfo.ip);

	// Uploaded file
	let file: Express.Multer.File | null = null;

	// Mirror file (Blossom BUD04)
	if (req.originalUrl.endsWith('/mirror')) {
		if (req.body.url == undefined || req.body.url == "") {
			logger.debug(`uploadMedia - 400 Bad request - Empty URL`, "|", reqInfo.ip);
			if(version != "v2"){return res.status(400).send({"result": false, "description" : "Empty URL"});}

			const result: ResultMessagev2 = {
				status: MediaStatus[1],
				message: "Error mirroring file, empty URL"
			};
			res.setHeader("X-Reason", "Error mirroring file, empty URL");
			return res.status(400).send(result);
		}
		file = await mirrorFile(req.body.url)
		if (!file) {
			logger.debug(`uploadMedia - 400 Bad request - Empty file`, "|", reqInfo.ip);
			if(version != "v2"){return res.status(400).send({"result": false, "description" : "Empty file"});}

			const result: ResultMessagev2 = {
				status: MediaStatus[1],
				message: "Error mirroring file, empty file"
			};
			res.setHeader("X-Reason", "Error mirroring file, empty file");
			return res.status(400).send(result);
		}
		req.files = [file];
	}

	if (Array.isArray(req.files) && req.files.length > 0) {file = req.files[0];}
	if (!file || file.buffer.length == 0) {
		logger.debug(`uploadMedia - 400 Bad request - Empty file`, "|", reqInfo.ip);
		if(version != "v2"){return res.status(400).send({"result": false, "description" : "Empty file"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "Empty file"
		};
		res.setHeader("X-Reason", "Empty file");
		return res.status(400).send(result);
	}

	// Filedata
	const filedata: FileData = {
		filename: "",
		fileid: "",
		filesize: file.size,
		pubkey: pubkey,
		width: getConfig(req.hostname, ["media", "transform", "media", "undefined", "width"]),
		height: getConfig(req.hostname, ["media", "transform", "media", "undefined", "height"]),
		media_type: uploadType,
		originalmime: "",
		outputoptions: "",
		originalhash: "",
		hash: "",
		url: "",
		magnet: "",
		blurhash: "",
		status: "",
		description: "File uploaded successfully",
		processing_url:"",
		conversionInputPath: "",
		conversionOutputPath: "",
		date: Math.floor(Date.now() / 1000),
		no_transform: false,
		newFileDimensions: "",
		transaction_id: "",
		payment_request: "",
		visibility: 1,
		tenant: req.hostname,
	};

	// File mime type. If not allowed reject the upload.
	filedata.originalmime = await getFileMimeType(req, file);
	if (filedata.originalmime == "") {
		logger.warn(`uploadMedia - 400 Bad request - file type not detected or not allowed: ${file.mimetype}`, "|", reqInfo.ip);
		if(version != "v2"){return res.status(400).send({"result": false, "description" : "file type not detected or not allowed"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: `file type not detected or not allowed, mime: ${file.mimetype}`,
		};
		res.setHeader("X-Reason", `file type not detected or not allowed, mime: ${file.mimetype}`);
		return res.status(400).send(result);
	}
	logger.debug(`uploadMedia - mime: ${filedata.originalmime} | `, reqInfo.ip);

	// No transform option
	filedata.no_transform = getConfig(req.hostname, ["media", "transform", "enabled"]) == false
	? true
	: parseBoolean(req.body?.no_transform);
	
	// Not accepting "avatar" or "banner" uploads with no_transform option
	if (filedata.media_type != "media" && filedata.no_transform == true){
		logger.warn(`uploadMedia - 400 Bad request - no_transform not allowed for this media type`, "|", reqInfo.ip);
		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "no_transform not allowed for this media type",
		};
		res.setHeader("X-Reason", "no_transform not allowed for this media type");
		return res.status(400).send(result);
	}

	if (req.params.param1 == "upload" || req.params.param1 == "mirror") filedata.no_transform = true;
	if (!filedata.originalmime.toString().startsWith("image") && !filedata.originalmime.toString().startsWith("video")) filedata.no_transform = true;

	// Uploaded file SHA256 hash and filename
	filedata.originalhash = await generatefileHashfrombuffer(file, filedata.media_type);
	filedata.hash = filedata.originalhash; // At this point, hash is the same as original hash
	filedata.filename = `${filedata.originalhash}.${filedata.no_transform ? await getExtension(filedata.originalmime) : await getExtension(filedata.originalmime,true)}`;

	logger.debug(`uploadMedia - hash: ${filedata.originalhash} | `, reqInfo.ip);
	logger.debug(`uploadMedia - filename: ${filedata.filename} | `, reqInfo.ip);
	logger.debug(`uploadMedia - no_transform: ${filedata.no_transform} | `, reqInfo.ip);

	// Default return status
	res.status(200);

	// Plugins engine execution
	if (await executePlugins({module: "media", pubkey: filedata.pubkey, filename: filedata.filename, ip: reqInfo.ip}, req.hostname ) == false) {
		logger.info(`uploadMedia - 401 Unauthorized - Not authorized`, "|", reqInfo.ip);
		res.setHeader("X-Reason", "Not authorized");
		return res.status(401).send({"status": "error", "message": "Not authorized"});
	}

	filedata.url = (eventHeader.kind == BUDKinds.BUD01_auth || req.method == "PUT") ? getFileUrl(filedata.filename, undefined, req.hostname) : getFileUrl(filedata.filename, pubkey, req.hostname);

	// Standard media conversions
	standardMediaConversion(filedata, file);
	
	// Status
	if (version == "v1"){filedata.status = JSON.parse(JSON.stringify(UploadStatus[0]));}
	if (version == "v2"){filedata.status = JSON.parse(JSON.stringify(MediaStatus[0]));}

	let processFile = true;
	let insertfiledb = true;
	let makeBlurhash = true;

	// Check if the (file SHA256 hash and pubkey) is already on the database, if exist (and the upload is media type) we return the existing file URL
	const sameFiles = await dbMultiSelect(
										["id", "hash", "magnet", "blurhash", "filename", "mimetype", "filesize", "dimensions", "date", "transactionid"],
										"mediafiles ", 
										"original_hash = ? and pubkey = ? ",
										[filedata.originalhash, pubkey],
										false);

	if (sameFiles && sameFiles.length != 0) {
	
		let dbFile = null;
		for (const f of sameFiles) {		
			const { filename, hash } = f;
			if (filedata.no_transform == true) {
				filedata.filename == filename && filedata.hash == hash ? dbFile = f : null;
			}else{
				filedata.filename == filename ? dbFile = f : null;
			}				
		}

		if (dbFile) {
			logger.debug(`uploadMedia - File already in database, returning existing URL`);
			if (version == "v1"){filedata.status = JSON.parse(JSON.stringify(UploadStatus[2]));}
			if (version == "v2"){filedata.status = JSON.parse(JSON.stringify(MediaStatus[0]));}
			filedata.fileid = dbFile.id;
			filedata.hash = dbFile.hash;
			filedata.magnet = dbFile.magnet;
			filedata.blurhash = dbFile.blurhash;
			filedata.originalmime = dbFile.mimetype ? dbFile.mimetype : filedata.originalmime;
			filedata.filesize = +dbFile.filesize;
			filedata.width = +(dbFile.dimensions.split("x")[0]);
			filedata.height = +(dbFile.dimensions.split("x")[1]);
			filedata.description = "File exist in database, returning existing URL";
			filedata.date = dbFile.date? Math.floor(dbFile.date / 1000) : Math.floor(Date.now() / 1000);

			// If the recieved file has a transaction_id and the DB file doesn't have a transaction_id, we update the DB file with the recieved transaction_id
			if (filedata.transaction_id != "" && dbFile.transactionid == null) {
				const updateResult = await dbUpdate("mediafiles", {"transactionid": filedata.transaction_id},["id"], [filedata.fileid]);
				const accountIdResult = await updateAccountId(req.hostname,pubkey, Number(filedata.transaction_id));
				if (!updateResult || !accountIdResult) {
					logger.error(`uploadMedia - Error updating transactionid for file ${filedata.fileid}`, "|", reqInfo.ip);
					const result: ResultMessagev2 = {
						status: MediaStatus[1],
						message: "Error updating transactionid for file " + filedata.fileid,
					};
					res.setHeader("X-Reason", "Internal server error");
					return res.status(500).send(result);
				}
				dbFile.transactionid = filedata.transaction_id;
			}
			filedata.transaction_id = dbFile.transactionid;
			
			processFile = false; 
			insertfiledb = false;
			makeBlurhash = false;

			if (await getFilePath(filedata.filename) == "") {
				logger.warn(`uploadMedia - File already in database but not found on storage server, processing as new file`, "|", reqInfo.ip);
				processFile = true;
			}
		}
	}

	// Write temp file to disk (for ffmpeg and blurhash)
	if (processFile){
		filedata.conversionInputPath = await saveTmpFile(filedata.filename, file.buffer);
		if (filedata.conversionInputPath == "") {
			if(version != "v2"){return res.status(500).send({"result": false, "description" : "Internal server error."});}
			const result: ResultMessagev2 = {
				status: MediaStatus[1],
				message: "Internal server error.",
			};
			res.setHeader("X-Reason", "Internal server error");
			return res.status(500).send(result);
		}

		// generate blurhash
		if (makeBlurhash) {
			if (filedata.originalmime.toString().startsWith("image")){
				logger.debug(`uploadMedia - originalmime: ${filedata.originalmime.toString()} | `, reqInfo.ip);
				filedata.blurhash = await generateBlurhash(filedata.conversionInputPath);

				if (filedata.blurhash == "") {
					if(version != "v2"){return res.status(500).send({"result": false, "description" : "File could not be processed"});}

					const result: ResultMessagev2 = {
						status: MediaStatus[1],
						message: "File could not be processed",
					};
					logger.error(`uploadMedia - File blurhash could not be generated`, "|", reqInfo.ip);
					res.setHeader("X-Reason", "Internal server error");
					return res.status(500).send(result);
				}
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
		const createdate = getNewDate();
		const insertResult = await dbInsert(
			"mediafiles", 
			["pubkey", "filename", "mimetype", "original_hash", "hash", "status", "active", "visibility", "date", "ip_address", "magnet", "blurhash", "filesize", "comments", "type", "dimensions", "transactionid"],
			[filedata.pubkey, 
			filedata.filename,
			filedata.originalmime,
			filedata.originalhash,
			filedata.hash,
			filedata.status,
			1,
			1,
			createdate,
			reqInfo.ip,
			filedata.magnet,
			filedata.blurhash,
			filedata.filesize,
			"",
			filedata.media_type,
			filedata.width != 0? filedata.width + "x" + filedata.height : 0,
			filedata.transaction_id ? filedata.transaction_id : 0]);

		filedata.fileid = insertResult.toString();
		if (insertResult == 0) {
			logger.error(`uploadMedia - Error inserting file to database`, "|", reqInfo.ip);
			if(version != "v2"){return res.status(500).send({"result": false, "description" : "Error inserting file to database"});}
			const result: ResultMessagev2 = {
				status: MediaStatus[1],
				message: "Error inserting file to database",
			};
			res.setHeader("X-Reason", "Internal server error");
			return res.status(500).send(result);
		}

		// Update accountid in ledger and transactions tables.
		if (filedata.transaction_id != "") {
			const result = await updateAccountId(req.hostname, pubkey, Number(filedata.transaction_id));
			if (result == false) {
				logger.error(`uploadMedia - Error updating transactionid for file`, filedata.fileid, "|", reqInfo.ip);
				return res.status(500).send({"status": "error", "message": "Error updating transactionid for file"});
			}
		}
	}

	// Payment engine
	if (isModuleEnabled("payments", req.hostname)) {

		// Get preimage from header
		const preimage = req.headers["x-lightning"]?.toString().length == 64 ? req.headers["x-lightning"]?.toString() : undefined;

		// Find transaction_id from mediafiles table
		filedata.transaction_id = (await dbMultiSelect(["transactionid"], "mediafiles", filedata.no_transform ? "hash = ?" : "original_hash = ?", [filedata.hash], true))[0]?.transactionid || "";

		// If not exist, find an existing transaction with the same paymenthash and get the transaction_id
		if (filedata.transaction_id == "" && preimage != undefined) filedata.transaction_id  = (await dbMultiSelect(["id"], "transactions", "paymenthash = ?", [await hashString(preimage, "preimage")], true))[0]?.id || "";
		
		// If we have a transaction_id, we update the mediafiles table with the transaction_id and update the transaction table with the mediafiles id
		if (filedata.transaction_id != "") {
			await dbUpdate("mediafiles", {"transactionid" : filedata.transaction_id}, ["id"], [filedata.fileid]);
			await dbUpdate("transactions", {"comments": "Invoice for: mediafiles:" + filedata.fileid}, ["id"], [filedata.transaction_id]);
		}

		const transaction = await checkTransaction(
									filedata.tenant,
									filedata.transaction_id,
									filedata.fileid,
									"mediafiles",
									filedata.no_transform ? (Number(Number(filedata.filesize))) : (Number(filedata.filesize)/3),
									0,
									getConfig(req.hostname, ["media", "maxMBfilesize"]) * 1024 * 1024,
									getConfig(req.hostname, ["payments", "satoshi", "mediaMaxSatoshi"]),
									filedata.pubkey
									);

		// If we have a preimage, compare the paymenthash with the transaction paymenthash and update the invoice status
		if (preimage != undefined) {
			const receivedInvoice = await getInvoice(req.hostname, await hashString(preimage, "preimage"));
			if (receivedInvoice.paymentHash != "" && receivedInvoice.transactionid.toString() == filedata.transaction_id){
				if (receivedInvoice.isPaid != true) await collectInvoice(req.hostname, receivedInvoice, false, true);
				transaction.isPaid = true; // Update transaction object
			}
		}

		// If the file is not paid, we add the payment request to the response headers
		if (transaction.isPaid == false){
			filedata.payment_request = transaction.paymentRequest;
			res.status(402);
			res.setHeader("X-Lightning", transaction.paymentRequest);
			res.setHeader("X-Lightning-amount", transaction.satoshi);
			res.setHeader("X-Reason", `Invoice (${transaction.satoshi}) for hash: ${filedata.originalhash}`);
		}

		// If the file is not paid, and we don't allow upaid uploads, we return an error message and a 402 status code with the payment request
		if (getConfig(req.hostname, ["payments", "allowUnpaidUploads"]) == false && transaction.isPaid == false) {
			logger.info(`uploadMedia - 402 Payment required - Payment required`, "|", reqInfo.ip);
			return res.send({"status": "error", "message": "Payment required"});
		}
	}

	if (processFile){

		filedata.description = "File enqueued for processing";
		filedata.processing_url = filedata.no_transform == true? "" : `${getMediaUrl("NIP96", req.hostname)}/${filedata.fileid}`;
		res.status(202)

		//Send request to process queue
		const t: MediaJob = {req,filedata,};
		logger.info(`uploadMedia - ${requestQueue.length() +1} items in media processing queue`);
		filedata.description + "File queued for conversion";
		requestQueue.push(t).catch((err) => {
			logger.error(`uploadMedia - Error pushing file to queue`, err);
			if(version != "v2"){return res.status(500).send({"result": false, "description" : "Error queueing file"});}

			const result: ResultMessagev2 = {
				status: MediaStatus[1],
				message: "Error queueing file",
			};
			res.setHeader("X-Reason", "Internal server error");
			return res.status(500).send(result);
		});
	}

	logger.info(`uploadMedia - File uploaded successfully: ${filedata.filename}`, "|", reqInfo.ip);

	//v0 and v1 compatibility
	if (version != "v2"){
		const returnmessage : LegacyMediaReturnMessage = await prepareLegacMediaEvent(filedata);
		return res.json(returnmessage);
	}

	// Blossom compatibility
	if (eventHeader.kind == BUDKinds.BUD01_auth) {
		const returnmessage: BlobDescriptor = await prepareBlobDescriptor(filedata);
		res.status(200);
		return res.json(returnmessage);
	}

	// NIP96 compatibility and fallback
	const returnmessage : NIP96_event = await PrepareNIP96_event(filedata);
	return res.json(returnmessage);

};

const getMedia = async (req: Request, res: Response, version:string) => {

	if ((req.params.param1 && req.params.param2) && (req.params.param1 != "list" && req.params.param1 != "public" && req.params.param1 != "vanity")) {
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

	// Old public file URL
	const isOldPublicFile = !!req.params.param2 && req.params.param2.includes('.') && req.params.param2.split('.').pop()!.length >= 2;
	if (req.params.param1 && req.params.param2 && isOldPublicFile) {
		req.params.pubkey   = req.params.param1;
		req.params.filename = req.params.param2;
		return getMediabyURL(req, res);
	}

	// Get media by ID, getmedia listing
	if (req.params.param1 && req.params.param1.length < 11) {

		if(req.params.param1 == "list" || req.params.param1 == "public" || req.params.param1 == "vanity"){
			 // Blossom, public and vanity media listing
			getMediaList(req, res);
			return;
		}else{
			req.params.id = req.params.param1;
			getMediaStatusbyID(req, res, version);
			return;
		}
	}

	// List media
	if (req.query && Object.keys(req.query).length > 0 && req.query.page != undefined && req.query.count != undefined) {
		getMediaList(req, res); // List media NIP96 compatibility
		return;
	}

	// CDN home page
	if (req.params.param1 == undefined && req.params.param2 == undefined) {
		loadCdnPage(req, res, version) 
		return;
	}

	res.setHeader("X-Reason", "Bad request");
	return res.status(400).send({"status": "error", "message": "Bad request"});

}

const headMedia = async (req: Request, res: Response): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`headMedia - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		res.setHeader("X-Reason", reqInfo.comments);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("media", req.hostname)) {
		logger.info(`headMedia - Attempt to access a non-active module: media | IP:`, reqInfo.ip);
		res.setHeader("X-Reason", "Module is not enabled");
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`headMedia - Request from:`, reqInfo.ip);

	// Get file hash from URL
	const hash = req.params.param1.toString().split(".")[0];
	if (!hash) {
		logger.warn(`headMedia - 400 Bad request - missing hash`, "|", reqInfo.ip);
		res.setHeader("X-Reason", "Missing hash");
		return res.status(400).send();
	}

	// Check if file exist on storage server
	const filePath = await getFilePath(hash);
	if (filePath == "") {
		logger.info(`headMedia - 404 Not found - file not found on storage server: ${hash}`, "|", reqInfo.ip);
		res.setHeader("X-Reason", "File not found on storage server");	
		return res.status(404).send();
	}

	// Check if file exist on database
	const fileData = await dbMultiSelect(["id", "filesize", "hash", "original_hash", "mimetype"], "mediafiles", "original_hash = ?", [hash], true);
	if (fileData.length == 0) {
		logger.error(`headMedia - 404 Not found - file not found in database: ${hash}`, "|", reqInfo.ip);
		res.setHeader("X-Reason", "File not found on storage server");	
		return res.status(404).send();
	}
 
	// Payment required ?
	if (await isModuleEnabled("payments", req.hostname)) {
		const transactionId = (await dbMultiSelect(["transactionid"], "mediafiles", fileData[0].hash != fileData[0].original_hash ? "original_hash = ?" : "hash = ?", [hash], true))[0]?.transactionid || "" ;
		
		const transaction = await checkTransaction(
			req.hostname,
			transactionId,
			"",
			"mediafiles",
			fileData[0].hash != fileData[0].original_hash ? (Number(fileData[0].filesize)/3) : (Number(fileData[0].filesize)),
			0,
			getConfig(req.hostname, ["media", "maxMBfilesize"]) * 1024 * 1024,
			getConfig(req.hostname, ["payments", "satoshi", "mediaMaxSatoshi"]),
			"");		
		
		if (transaction.transactionid != 0 && transaction.isPaid == false && getConfig(req.hostname, ["payments", "satoshi", "mediaMaxSatoshi"]) > 0) {
			res.setHeader("X-Lightning", transaction.paymentRequest);
			res.setHeader("X-Lightning-amount", transaction.satoshi);
			res.setHeader("X-Reason", `Invoice (${transaction.satoshi}) for hash: ${hash}`);
			return res.status(402).send()
		}
	}

	// Banned ?
	if (await isEntityBanned(fileData[0].id, "mediafiles")) {
		logger.warn(`headMedia - 403 Forbidden - file is banned: ${hash}`, "|", reqInfo.ip);
		res.setHeader("X-Reason", "File is banned");
		return res.status(403).send();
	}

	logger.info(`headMedia - File found successfully: ${hash}`, "|", reqInfo.ip);
	res.setHeader("Content-Type", fileData[0].mimetype);

	return res.status(200).send();

};

const getMediaList = async (req: Request, res: Response): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`getMediaList - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		res.setHeader("X-Reason", reqInfo.comments);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("media", req.hostname)) {
		logger.info(`getMediaList - Attempt to access a non-active module: media | IP:`, reqInfo.ip);
		res.setHeader("X-Reason", "Module is not enabled");
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`getMediaList - Request from:`, reqInfo.ip);

	let listType;
	switch (req.params.param1) {
		case "list":
			listType = "Blossom";
			break;
		case "public":
			listType = "public";
			break;
		case "vanity":
			listType = "vanity";
			break;
		default:
			listType = "NIP96";
			break;
	}

	// Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "list", false, true, true);
	if (eventHeader.status != "success") {
		if (!req.params.param2 && listType == "NIP96") {
			return res.status(401).send({ result: false, description: eventHeader.message });
		}
		logger.debug(`getMediaList - Invalid auth, fallback to public files for pubkey: ${req.params.param2}`, "|", reqInfo.ip);
		eventHeader.pubkey = "";
	}

	// Get NIP96 query parameters
	const page = Number(req.query.page) || 0;
	let count = Number(req.query.count) || 10;
	count > 100 ? count = 100 : count; // Limit count value to 100
	const offset = count * page; 

	// Get Blossom query parameters
	const since = req.query.since?.toString() || 0;
	const until = req.query.until?.toString() || 0;
	const pubkey = req.params.param2 || "";

	let whereStatement = "";
	let whereFields: (string | number)[] = [];
	
	if (listType == "public") {
		whereStatement = "active = '1' AND visibility = '1' AND checked = '1' AND original_hash IS NOT NULL ORDER BY date DESC LIMIT ? OFFSET ?";
		whereFields = [count, offset];
	}
	else if (listType == "vanity") {
		whereStatement = "active = '1' AND visibility = '1' AND checked = '1' AND original_hash IS NOT NULL AND pubkey = ? ORDER BY date DESC LIMIT ? OFFSET ?";
		whereFields = [pubkey, count, offset];
	} 
	else if (listType == "Blossom") {
		whereStatement = eventHeader.pubkey == pubkey
			? "pubkey = ? and active = ? and original_hash is not null"
			: "pubkey = ? and active = ? and visibility = ? and checked = ? and original_hash is not null";
		whereFields = eventHeader.pubkey == pubkey
			? [pubkey, "1"]
			: [pubkey, "1", "1", "1"];
	
		if (since != 0) {
			whereStatement += " and date >= ?";
			whereFields.push(new Date(Number(since) * 1000).toISOString().slice(0, 19).replace('T', ' '));
		}
	
		if (until != 0) {
			whereStatement += " and date <= ?";
			whereFields.push(new Date(Number(until) * 1000).toISOString().slice(0, 19).replace('T', ' '));
		}
	
		whereStatement += " ORDER BY date DESC";
	}
	else {
		// NIP96
		whereStatement = "pubkey = ? and active = ? ORDER BY date DESC LIMIT ? OFFSET ?";
		whereFields = [eventHeader.pubkey, "1", count, offset];
	}

	// Get files and total from database
	const result = await dbMultiSelect(["id", "filename", "mimetype",  "original_hash", "hash", "filesize", "dimensions", "date", "blurhash", "pubkey", "transactionid", "visibility"],
										"mediafiles",
										`${whereStatement}`,
										whereFields, false);
	
	// Only for NIP96 compatibility
	const selectStatement = eventHeader.pubkey || pubkey ? "SELECT COUNT(*) AS count FROM mediafiles WHERE pubkey = ? and active = '1'" : "SELECT COUNT(*) AS count FROM mediafiles WHERE active = '1' and visibility = '1'";									
	const total = await dbSelect(selectStatement, "count", [eventHeader.pubkey || pubkey]);
	
	const files : (BlobDescriptor | NIP94_data)[] = [];
	for (const e of result) {

		if (e.original_hash == null || e.hash == null) {
			logger.debug(`getMediaList - File ${e.filename} has no original_hash or hash, skipping`, "|", reqInfo.ip);
			continue;
		}

		const listedFile: FileData = {
			filename: e.filename,
			originalhash: e.original_hash,
			hash: e.hash,
			filesize: Number(e.filesize),
			date: e.date ? Math.floor(e.date / 1000) : Math.floor(Date.now() / 1000),
			fileid: e.id,
			pubkey: eventHeader.pubkey ? eventHeader.pubkey : e.pubkey,
			width: Number(e.dimensions?.toString().split("x")[0]),
			height: Number(e.dimensions?.toString().split("x")[1]),
			url: "",
			magnet: "",
			blurhash: e.blurhash,
			no_transform: e.hash == e.original_hash ? true : false,
			media_type: "",
			originalmime: e.mimetype != '' ? e.mimetype : await getMimeType(e.filename.split('.').pop() || '') || '',
			status: "success",
			description: "",
			outputoptions: "",
			processing_url: "",
			conversionInputPath: "",
			conversionOutputPath: "",
			newFileDimensions: "",
			payment_request: "",
			transaction_id: e.transactionid,
			visibility: e.visibility,
			tenant: req.hostname,
		};

		// Return payment_request if the file is not paid
		if (isModuleEnabled("payments", req.hostname)) {
			
			const transaction : Transaction = await checkTransaction(
				listedFile.tenant,
				listedFile.transaction_id,
				listedFile.fileid,
				"mediafiles",
				listedFile.filesize,
				0,
				getConfig(req.hostname, ["media", "maxMBfilesize"]) * 1024 * 1024,
				getConfig(req.hostname, ["payments", "satoshi", "mediaMaxSatoshi"]),
				listedFile.pubkey
			);
			
			if (transaction.isPaid == false) listedFile.payment_request = transaction.paymentRequest;
		}

		listedFile.url = pubkey != "" ? getFileUrl(listedFile.filename, undefined, req.hostname) : getFileUrl(listedFile.filename, listedFile.pubkey, req.hostname);
	
		const file = req.params.param1 == "list" ? await prepareBlobDescriptor(listedFile) : await PrepareNIP96_listEvent(listedFile);
		files.push(file);
	}

	logger.info(`getMediaList - Successfully listed ${files.length} files`, "|", reqInfo.ip);

	// NIP96, public and vanity compatibility
	if (listType != "Blossom") {
		const response = {
			count: files.length,
			total: total || 0,
			page: page,
			files: files,
		};
		return res.status(200).send(response);
	}else{
	// Blossom compatibility
		return res.status(200).send(Array.isArray(files) ? files : [files]);
	}

};

const getMediaStatusbyID = async (req: Request, res: Response, version:string): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`getMediaStatusbyID - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		res.setHeader("X-Reason", reqInfo.comments);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("media", req.hostname)) {
        logger.info(`getMediaStatusbyID - Attempt to access a non-active module: media | IP:`, reqInfo.ip);
		res.setHeader("X-Reason", "Module is not enabled");
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`getMediaStatusbyID - Request from:`, reqInfo.ip);

	// Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "getMediaStatusbyID", false, false, false);
	if (eventHeader.status !== "success") {
		if(version != "v2"){return res.status(401).send({"result": false, "description" : eventHeader.message});}
		const result : ResultMessagev2 = {
			status: MediaStatus[1],
			message: eventHeader.message
		}
		res.setHeader("X-Reason", eventHeader.message);
		return res.status(401).send(result);
	}

	const id = req.params.id || req.query.id || "";

	if (!id) {
		logger.warn(`getMediaStatusbyID - 400 Bad request - missing id`, "|", reqInfo.ip);

		//v0 and v1 compatibility
		if(version != "v2"){return res.status(400).send({"result": false, "description" : "missing id"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "missing id",
		};
		res.setHeader("X-Reason", "missing id");
		return res.status(400).send(result);
	}

	logger.info(`getMediaStatusbyID - Requested file ID: ${id}`, "|", reqInfo.ip);

	const mediaFileData = await dbMultiSelect(["id", "filename", "pubkey", "status", "magnet", "original_hash", "hash", "blurhash", "dimensions", "filesize", "transactionid", "visibility"],
												"mediafiles",
												"id = ? and (pubkey = ? or pubkey = ?)",
												[id, eventHeader.pubkey, getConfig(req.hostname, ["server", "pubkey"])],
												true);

	if (!mediaFileData || mediaFileData.length == 0) {
		logger.error(`getMediaStatusbyID - File not found in database: ${id}`, "|", reqInfo.ip);

		//v0 and v1 compatibility
		if(version != "v2"){return res.status(404).send({"result": false, "description" : "The requested file was not found"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "The requested file was not found",
		};
		res.setHeader("X-Reason", "File not found");
		return res.status(404).send(result);
	}

	const { filename, pubkey, status, magnet, original_hash, hash, blurhash, filesize, transactionid, visibility  } = mediaFileData[0];
	let { dimensions } = mediaFileData[0];

	//Fix dimensions for old API requests
	dimensions == null? dimensions = 0x0 : dimensions;

	//Generate filedata
	const filedata : FileData = {
		filename: filename,
		width: dimensions?.toString().split("x")[0],
		height: dimensions?.toString().split("x")[1],
		filesize: filesize,
		fileid: id.toString(),
		pubkey: pubkey,
		originalhash: original_hash,
		hash: hash,
		url: getFileUrl(filename, pubkey, req.hostname),
		magnet: magnet,
		blurhash: blurhash,
		media_type: "", 
		originalmime: "",
		outputoptions: "",
		status: status,
		description: "The requested file was found",
		processing_url: "", 
		conversionInputPath: "",
		conversionOutputPath: "",
		date: 0,
		no_transform: original_hash == hash ? true : false,
		newFileDimensions: "",
		transaction_id: transactionid,
		payment_request: "",
		visibility: visibility,
		tenant: req.hostname
	};

	let response = 201;
	if (filedata.status == "failed") {
		filedata.description = "It was a problem processing this file";
		res.setHeader("X-Reason", "File processing error");
		response = 404;
	}
	if (filedata.status == "pending" || filedata.status == "processing") {
		filedata.description = "The requested file is processing";
		response = 200;
	}

	logger.info(`getMediaStatusbyID - File found successfully: ${id}`, "|", reqInfo.ip);

	//v0 and v1 compatibility
	if(version != "v2"){return res.status(response).send(await prepareLegacMediaEvent(filedata))}

	if (filedata.status == "failed") {return res.status(response).send({"result": false, "description" : "The requested file was not found"})}

	if (filedata.status == "processing" || filedata.status == "pending") {
		const processingStatus = await dbSelect("SELECT percentage FROM mediafiles WHERE id = ?", "percentage", [id.toString()]);
		if (processingStatus == undefined) {return res.status(404).send({"result": false, "description" : "The requested file was not found"})}

		const result: NIP96_processing = {
			status: MediaStatus[2],
			message: filedata.description,
			percentage: +processingStatus,
		};
		return res.status(202).send(result);
	}

	if (isModuleEnabled("payments", req.hostname)) {
		
		const transaction : Transaction = await checkTransaction(
			req.hostname,
			filedata.transaction_id,
			filedata.fileid,
			"mediafiles",
			filedata.hash != filedata.originalhash ? (Number(filedata.filesize)/3) : (Number(filedata.filesize)),
			0,
			getConfig(req.hostname, ["media", "maxMBfilesize"]) * 1024 * 1024,
			getConfig(req.hostname, ["payments", "satoshi", "mediaMaxSatoshi"]),
			filedata.pubkey
		);
		
		if(transaction.isPaid == false){
			filedata.payment_request = transaction.paymentRequest;
			response = 402;
			res.setHeader("X-Lightning", transaction.paymentRequest);
			res.setHeader("X-Lightning-amount", transaction.satoshi);
			res.setHeader("X-Reason", `Invoice (${transaction.satoshi}) for hash: ${filedata.originalhash}`);
		}
	}

	const returnmessage : NIP96_event = await PrepareNIP96_event(filedata);
	return res.status(response).send(returnmessage);

};

/**
 * * Serve a buffer to the client with the correct headers.
 * * @param req - The request object.
 * * @param res - The response object.
 * * @param buffer - The buffer to serve.
 * * @param mime - The MIME type of the buffer.
 * * @param statusCode - The HTTP status code to send (default is calculated based on the prefix).
 * */
const serveBuffer = (req: Request, res: Response, buffer: Buffer, mime: string, noCache: boolean = false, statusCode?: number) => {

	if (buffer.length === 0) {
		res.status(statusCode ?? 204);
		return res.end();
	}

	const prefix = mime.split("/")[0];
	const size = buffer.length;

	if (noCache) {
		res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
		res.setHeader("Expires", "0");
	} else {
		res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
	}

	res.setHeader("Content-Type", mime);
	res.setHeader("Vary", "Origin, Cookie");

	if (prefix === "video" || prefix === "audio") {
		res.setHeader("Accept-Ranges", "bytes");

		if (req.headers.range) {
			const range = readRangeHeader(req.headers.range, size);

			if (range.Start >= size || range.End >= size) {
				res.status(416).setHeader("Content-Range", `bytes */${size}`);
				return res.end();
			}

			const contentLength = range.End - range.Start + 1;
			const chunk = buffer.slice(range.Start, range.End + 1);

			res.status(statusCode ?? 206); 
			res.setHeader("Content-Range", `bytes ${range.Start}-${range.End}/${size}`);
			res.setHeader("Content-Length", contentLength);

			const stream = new Readable();
			stream.push(chunk);
			stream.push(null);
			return stream.pipe(res);
		}

		res.status(statusCode ?? 200); 
		res.setHeader("Content-Length", size);
		const stream = new Readable();
		stream.push(buffer);
		stream.push(null);
		return stream.pipe(res);
	}

	res.status(statusCode ?? 200);
	res.setHeader("Content-Length", size);
	return res.send(buffer);
};

const getMediabyURL = async (req: Request, res: Response) => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.debug(`getMediabyURL - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		res.setHeader("X-Reason", reqInfo.comments);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("media", req.hostname)) {
        logger.debug(`getMediabyURL - Attempt to access a non-active module: media | IP:`, reqInfo.ip);
		res.setHeader("X-Reason", "Module is not enabled");
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.debug(`getMediabyURL - Request from:`, reqInfo.ip);

	//Allow CORS
	res.set("Cross-Origin-Resource-Policy", "cross-origin");

	// Global security headers
	res.setHeader("Content-Security-Policy", "script-src 'none'; object-src 'none';");

	// Initial security checks
	if (
		req.params.pubkey && req.params.pubkey.length > 64 || 
		req.params.pubkey && !validator.matches(req.params.pubkey, /^[a-zA-Z0-9_]+$/) ||
		!req.params.filename || 
		req.params.filename.length > 70 ||
		!validator.matches(req.params.filename, /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/)) {
			logger.debug(`getMediabyURL - Bad request - ${req.url}`, "|", reqInfo.ip);
			const notFoundBanner = await getNotFoundFileBanner(req.hostname, "image/webp");
			res.setHeader("X-Reason", "File not found");
			return serveBuffer(req, res, notFoundBanner.buffer, "image/webp", true);
	}

	// Old API compatibility (username instead of pubkey)
	if (req.params.pubkey && req.params.pubkey.length < 64) {
		const hex = await dbSelect("SELECT hex FROM registered WHERE username = ?", "hex", [req.params.pubkey]);
		if (hex) {
			logger.debug(`getMediabyURL - Old API compatibility (username instead of pubkey): ${req.params.pubkey} -> ${hex}`, "|", reqInfo.ip);
			req.params.pubkey = hex as string;
		}
	}

	let adminRequest = false;
	let loggedPubkey = "";

	if (req.cookies?.authkey) {

		// Admin authorization header
		const adminHeader = await parseAuthHeader(req, "getMediaByURL", true, true, true);
		if (adminHeader.status == "success") {
			adminRequest = true;
		}

		// Logged user authorization header
		const loggedHeader = await parseAuthHeader(req, "getMediaByURL", false, true, true);
		if (loggedHeader.status == "success") {
			loggedPubkey = loggedHeader.pubkey;
		}
		setAuthCookie(res, adminHeader.authkey || loggedHeader.authkey);
	}

	// Default filetype
	let fileType : string = "application/octet-stream";

	// Check if the file is cached, if not, we check the database for the file.
	const cachedStatus = await redisCore.get(req.params.filename + "-" + req.params.pubkey);
	if (cachedStatus === null || cachedStatus === undefined) {

		// Standard gallery compatibility (pubkey/file.ext or pubkey/file)
		let whereFields = "(filename = ? OR original_hash = ?) and pubkey = ?";
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
											["id", "active", "transactionid", "filesize", "filename", "pubkey", "mimetype", "hash", "original_hash", "visibility"],
											"mediafiles",
											whereFields  + " ORDER BY id DESC",
											whereValues,
											true);
		if (filedata[0] == undefined || filedata[0] == null) {
			logger.debug(`getMediabyURL - 404 Not found - ${req.url}`, "| Returning not found media file.", reqInfo.ip);
			const notFoundBanner = await getNotFoundFileBanner(req.hostname, "image/webp");
			res.setHeader("X-Reason", "File not found");
			res.setHeader('X-Original-Content-Type', "image/webp");
			return serveBuffer(req, res, notFoundBanner.buffer, notFoundBanner.type, true);
		}

		// Allways set the correct filename
		req.params.filename = filedata[0].filename

		// file extension checks and media type
		const ext = path.extname(req.params.filename).slice(1);
		fileType = filedata[0].mimetype || (await getMimeType(ext)) || "application/octet-stream";
		res.setHeader("Content-Type", fileType);

		let isBanned = await isEntityBanned(filedata[0].id, "mediafiles");
		const pubkeyId = await dbMultiSelect(["id"], "registered", "hex = ?", [filedata[0].pubkey], true);
		if (pubkeyId.length > 0 && (await isEntityBanned(pubkeyId[0].id, "registered") == true)) {isBanned = true}
		if (isBanned && adminRequest == false) {
			logger.debug(`getMediabyURL - 403 Forbidden - ${req.url} | File is banned: ${filedata[0].original_hash}`, reqInfo.ip);
			const bannedBanner = await getBannedFileBanner(req.hostname, fileType);
			res.setHeader("X-Reason", "File is banned");
			res.setHeader('X-Original-Content-Type', fileType);
			return serveBuffer(req, res, bannedBanner.buffer, bannedBanner.type, true);
		}

		if (filedata[0].active != "1" && adminRequest == false) {
			logger.debug(`getMediabyURL - 401 File not active - ${req.url}`, "returning not found media file |", reqInfo.ip, "|", "cached:", cachedStatus ? true : false);
			const notFoundBanner = await getNotFoundFileBanner(req.hostname, fileType);
			res.setHeader("X-Reason", "File not found");
			res.setHeader('X-Original-Content-Type', fileType);
			return serveBuffer(req, res, notFoundBanner.buffer, notFoundBanner.type, true);
		}

		// Check if exist a transaction for this media file and if it is paid. Check preimage
		const transaction : Transaction = await checkTransaction(
			req.hostname,
			filedata[0].transactionid,
			filedata[0].id,
			"mediafiles",
			filedata[0].hash != filedata[0].original_hash ? (Number(filedata[0].filesize)/3) : (Number(filedata[0].filesize)),
			0,
			getConfig(req.hostname, ["media", "maxMBfilesize"]) * 1024 * 1024,
			getConfig(req.hostname, ["payments", "satoshi", "mediaMaxSatoshi"]),
			req.params.pubkey ? req.params.pubkey : filedata[0].pubkey
		);
		
		const preimage = req.headers["x-lightning"]?.toString().length == 64 ? req.headers["x-lightning"]?.toString() : undefined;
		if (preimage && preimage != "") {
			const receivedInvoice = await getInvoice(req.hostname, await hashString(preimage, "preimage"));
			if (receivedInvoice.paymentHash != "" && receivedInvoice.transactionid.toString() == filedata[0].transaction_id){
				await collectInvoice(req.hostname, receivedInvoice, false, true); 
				transaction.isPaid = true;
			} 
		}

		// If the GET request has no authorization, we return a QR code with the payment request.
		if (isModuleEnabled("payments", "") && transaction.paymentHash != "" && transaction.isPaid == false &&  adminRequest == false) {
			logger.debug(`getMediabyURL - 200 Paid media file ${req.url}`, "|", reqInfo.ip, "|", "cached:", cachedStatus ? true : false);
			const qrCode = await generateQRCode(transaction.paymentRequest, 
									"Invoice amount: " + transaction.satoshi + " sats", 
									"This file will be unlocked when the Lightning invoice " + 
									"is paid. Then, it will be freely available to everyone", 
									filedata[0].mimetype.toString().startsWith("video") ? "video" : "image");

			filedata[0].mimetype.startsWith("video") ? res.setHeader('Content-Type', "video/mp4") : res.setHeader('Content-Type', "image/webp");

			res.setHeader('X-Lightning', transaction.paymentRequest);
			res.setHeader('X-Lightning-Amount', transaction.satoshi);
			res.setHeader('X-Original-Content-Type', fileType);
			res.setHeader("X-Reason", `Invoice (${transaction.satoshi}) for hash: ${filedata[0].original_hash}`);
			return serveBuffer(req, res, qrCode.buffer, qrCode.type, true, 402);
		}
		
		if (!adminRequest && loggedPubkey == "") {
			await redisCore.set(req.params.filename + "-" + req.params.pubkey, "1", {EX: getConfig(req.hostname, ["redis", "expireTime"])});
		}

	}

	if (cachedStatus === "0") {
		logger.debug(`getMediabyURL -  401 File not active - ${req.url}`, "returning not found media file |", reqInfo.ip, "|", "cached:", cachedStatus ? true : false);
		res.setHeader('Content-Type', 'image/webp');
		res.setHeader("X-Reason", "File not active");
		res.setHeader('X-Original-Content-Type', "image/webp");
		const notFoundBanner = await getNotFoundFileBanner(req.hostname, "image/webp");
		return serveBuffer(req, res, notFoundBanner.buffer, notFoundBanner.type, true);
	}

	// mediaPath checks
	const mediaLocation = getConfig(req.hostname, ["storage", "type"]);
	logger.debug(`getMediabyURL - Media location: ${mediaLocation}`, "|", reqInfo.ip);

	if (mediaLocation == "local") {
		const mediaPath = path.normalize(path.resolve(getConfig(req.hostname, ["storage", "local", "mediaPath"])));
		if (!mediaPath) {
			logger.error(`getMediabyURL - 500 Internal Server Error - mediaPath not set`, "|", reqInfo.ip);
			res.setHeader("X-Reason", "Internal Server Error");
			res.setHeader('X-Original-Content-Type', fileType);
			const notFoundBanner = await getNotFoundFileBanner(req.hostname, fileType);
			return serveBuffer(req, res, notFoundBanner.buffer, notFoundBanner.type, true, 500);
		}

		// Check if file exist on storage server
		const fileName = await getFilePath(req.params.filename);
		if (fileName == ""){ 
			logger.debug(`getMediabyURL - 404 Not found - ${req.url}`, "| Returning not found media file.", reqInfo.ip);
			res.setHeader('X-Original-Content-Type', fileType);
			res.setHeader("X-Reason", "File not found");
			const notFoundBanner = await getNotFoundFileBanner(req.hostname, fileType);
			return serveBuffer(req, res, notFoundBanner.buffer, notFoundBanner.type, true);
		}

		// Try to prevent directory traversal attacks
		if (!path.normalize(path.resolve(fileName)).startsWith(mediaPath)) {
			logger.warn(`getMediabyURL - 403 Forbidden - ${req.url}`, "| Returning not found media file.", reqInfo.ip);
			res.setHeader("X-Reason", "Forbidden");
			res.setHeader('X-Original-Content-Type', fileType);
			const notFoundBanner = await getNotFoundFileBanner(req.hostname, fileType);
			return serveBuffer(req, res, notFoundBanner.buffer, notFoundBanner.type, true, 403);
		}

		if (fileType === "application/octet-stream") {
			const extFromPath = path.extname(fileName).slice(1);
			const guessed = (await getMimeType(extFromPath)) || "application/octet-stream";
			fileType = guessed;
		}

		const fileBuffer = await fs.promises.readFile(fileName);
		logger.debug(`getMediabyURL - Media file found successfully: ${req.url}`, "|", reqInfo.ip, "|", "cached:", cachedStatus ? true : false);
		return serveBuffer(req, res, fileBuffer, fileType);

	} else if (mediaLocation == "remote") {

		const url = await getRemoteFile(req.params.filename);
		if (url == "") {
			logger.error(`getMediabyURL - 500 Internal Server Error - remote URL not found`, "|", reqInfo.ip);
			res.setHeader("X-Reason", "Internal Server Error");
			res.setHeader('X-Original-Content-Type', fileType);
			const notFoundBanner = await getNotFoundFileBanner(req.hostname, fileType);
			return serveBuffer(req, res, notFoundBanner.buffer, notFoundBanner.type, true, 500);

		}
		const remoteFile = await fetch(url);
		if (!remoteFile.ok || !remoteFile.body ) {
			logger.error('`getMediabyURL - Failed to fetch from remote file server || ' + req.params.filename, reqInfo.ip);
			res.setHeader("X-Reason", "File not found");
			res.setHeader('X-Original-Content-Type', fileType);
			const notFoundBanner = await getNotFoundFileBanner(req.hostname, fileType);
			return serveBuffer(req, res, notFoundBanner.buffer, notFoundBanner.type, true);
		}

		if (fileType === "application/octet-stream") {
			try {
				const extFromUrl = path.extname(new URL(url).pathname).slice(1);
				const guessed = (await getMimeType(extFromUrl)) || "application/octet-stream";
				fileType = guessed;
			} catch {/* no-op */}
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

		logger.debug(`getMediabyURL - Media file found successfully (pipe from remote server): ${req.url}`, "|", reqInfo.ip, "|", "cached:", cachedStatus ? true : false);
		res.setHeader('Content-Type', fileType);
		stream.pipe(res);

	}

};

const getMediaTagsbyID = async (req: Request, res: Response): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.debug(`getMediaTagsbyID - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		res.setHeader("X-Reason", reqInfo.comments);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("media", req.hostname)) {
        logger.debug(`getMediaTagsbyID - Attempt to access a non-active module: media | IP:`, reqInfo.ip);
		res.setHeader("X-Reason", "Module is not enabled");
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	// Get available tags for a specific media file
	logger.debug(`getMediaTagsbyID - Request from:`, reqInfo.ip);

	// Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "getMediaStatusbyID", false, false, false);
	if (eventHeader.status !== "success") {
		const result : ResultMessagev2 = {
			status: MediaStatus[1],
			message: eventHeader.message
		}
		res.setHeader("X-Reason", eventHeader.message);
		return res.status(401).send(result);
	}

	//Query database for media tags
    const fileId = req.params.fileId;
    const userPubkey = eventHeader.pubkey;
    const serverPubkey = getConfig(req.hostname, ["server", "pubkey"]);

    // Try with user pubkey
    const rows = await dbMultiSelect(
        ["tag"],
        "mediatags INNER JOIN mediafiles ON mediatags.fileid = mediafiles.id",
        "fileid = ? AND pubkey = ?",
        [fileId, userPubkey],
        false
    );

    if (rows.length > 0) {
        logger.debug("RES -> Media tag list", "|", reqInfo.ip);
        return res.status(200).send(rows);
    }

    // If not found, try with public server pubkey
    logger.debug(`getMediaTagsbyID - Media tag list not found, trying with public server pubkey`, "|", reqInfo.ip);
    const publicRows = await dbMultiSelect(
        ["tag"],
        "mediatags INNER JOIN mediafiles ON mediatags.fileid = mediafiles.id",
        "fileid = ? AND pubkey = ?",
        [fileId, serverPubkey],
        false
    );

    if (publicRows.length > 0) {
        logger.debug(`getMediaTagsbyID - Media tag list found successfully, lenght: ${publicRows.length}`, "|", reqInfo.ip);
        return res.status(200).send(publicRows);
    }

    logger.warn(`getMediaTagsbyID - Empty media tag list`, "|", reqInfo.ip);
	res.setHeader("X-Reason", "No media tags found");
    return res.status(404).send({ "media tags": "No media tags found" });

};

const getMediabyTags = async (req: Request, res: Response): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.debug(`getMediabyTags - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		res.setHeader("X-Reason", reqInfo.comments);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("media", req.hostname)) {
        logger.debug(`getMediabyTags - Attempt to access a non-active module: media | IP:`, reqInfo.ip);
		res.setHeader("X-Reason", "Module is not enabled");
		res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	//Get media files by defined tags
	logger.debug(`getMediabyTags - Request from:`, reqInfo.ip);

	// Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "getMediabyTags", false, false, false);
	if (eventHeader.status !== "success") {
		res.setHeader("X-Reason", eventHeader.message);
		return res.status(401).send({"result": eventHeader.status, "description" : eventHeader.message});
	}

	logger.debug(`getMediabyTags - Tags requested: ${req.params.tag}`, "|", reqInfo.ip);

	//Check database for media files by tags
	const fileTag = req.params.tag;
	const userPubkey = eventHeader.pubkey;
	const serverPubkey = getConfig(req.hostname, ["server", "pubkey"]);

	// Try with user pubkey
	const rows = await dbMultiSelect(
		["mediafiles.id", "mediafiles.filename", "mediafiles.pubkey", "mediafiles.status"],
		"mediatags INNER JOIN mediafiles ON mediatags.fileid = mediafiles.id",
		"tag = ? AND mediafiles.pubkey = ?",
		[fileTag, userPubkey],
		false
	);

	if (rows.length > 0) {
		logger.debug(`getMediabyTags - Media files for specified tag found, lenght: ${rows.length}`, "|", reqInfo.ip);
		const result = {
			result: true,
			description: "Media files found",
			mediafiles: rows,
		};
		return res.status(200).send(result);
	}

	// If not found, try with public server pubkey
	logger.debug(`getMediabyTags - Media files for specified tag not found, trying with public server pubkey`, "|", reqInfo.ip);
	const publicRows = await dbMultiSelect(
		["mediafiles.id", "mediafiles.filename", "mediafiles.pubkey", "mediafiles.status"],
		"mediatags INNER JOIN mediafiles ON mediatags.fileid = mediafiles.id",
		"tag = ? AND mediafiles.pubkey = ?",
		[fileTag, serverPubkey],
		false
	);

	if (publicRows.length > 0) {
		logger.debug(`getMediabyTags - Media files for specified tag found successfully, lenght: ${publicRows.length}`, "|", reqInfo.ip);
		const result = {
			result: true,
			description: "Media files found",
			mediafiles: publicRows,
		};
		return res.status(200).send(result);
	}

	logger.warn(`getMediabyTags - No media files found for specified tag`, "|", reqInfo.ip);
	res.setHeader("X-Reason", "No media files found");
	return res.status(404).send({ "media files": "No media files found" });


};

const updateMediaVisibility = async (req: Request, res: Response, version: string): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`updateMediaVisibility - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		res.setHeader("X-Reason", reqInfo.comments);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("media", req.hostname)) {
        logger.info(`updateMediaVisibility - Attempt to access a non-active module: media | IP:`, reqInfo.ip);
		res.setHeader("X-Reason", "Module is not enabled");
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	//Update media visibility
	logger.info(`updateMediaVisibility - Request from:`, reqInfo.ip);

	// Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "updateMediaVisibility", false, true, true);
	if (eventHeader.status !== "success") {
		res.setHeader("X-Reason", eventHeader.message);
		return res.status(401).send({"result": eventHeader.status, "description" : eventHeader.message});
	}

	logger.debug(`updateMediaVisibility - pubkey: ${eventHeader.pubkey} | fileId: ${req.params.fileId} | visibility: ${req.params.visibility}`, "|", reqInfo.ip);

	//Check if fileId is not empty
	if (!req.params.fileId) {
		logger.warn("RES -> 400 Bad request - missing fileId", "|", reqInfo.ip);
		const result: ResultMessage = {
			result: false,
			description: "missing fileId",
		};
		res.setHeader("X-Reason", "missing fileId");
		return res.status(400).send(result);
	}

	//Check if visibility is valid
	if (req.params.visibility != "1" && req.params.visibility != "0") {
		logger.warn("RES -> Invalid visibility value", "|", reqInfo.ip);
		const result: ResultMessage = {
			result: false,
			description: "Invalid visibility value",
		};
		return res.status(400).send(result);
	}

	const fileData = await dbMultiSelect(["id", "filename"], "mediafiles", "(id = ? or original_hash = ?) and pubkey = ?", [req.params.fileId, req.params.fileId, eventHeader.pubkey], true);

	const update = await dbUpdate("mediafiles", {"visibility": req.params.visibility}, ["id", "pubkey"], [fileData[0].id, eventHeader.pubkey]);
	if (!update) {
		logger.warn(`updateMediaVisibility - 404 Not found - Media visibility not updated, media file not found`, "|", reqInfo.ip);
		if (version != "v2") {
			return res.status(404).send({"result": false, "description" : "Media visibility not updated, media file not found"});
		}
		const result: ResultMessagev2 = {
			status: "error",
			message: "Media visibility not updated, media file not found",
		};
		res.setHeader("X-Reason", "Media file not found");
		return res.status(404).send(result); 
	}

	logger.info(`updateMediaVisibility - Media visibility updated successfully`, "|", reqInfo.ip);

	// Clear redis cache
	await redisCore.del(fileData[0].filename + "-" + eventHeader.pubkey);
	
	if (version != "v2") return res.status(200).send({"result": true, "description" : "Media visibility has changed with value " + req.params.visibility});
	const result: ResultMessagev2 = {
		status: "success",
		message: "Media visibility has changed with value " + req.params.visibility,
	};
	return res.status(200).send(result);

};

const deleteMedia = async (req: Request, res: Response, version:string): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`deleteMedia - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		res.setHeader("X-Reason", reqInfo.comments);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("media", req.hostname)) {
        logger.info(`deleteMedia - Attempt to access a non-active module: media | IP:`, reqInfo.ip);
		res.setHeader("X-Reason", "Module is not enabled");
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	//Check if fileId is not empty
	if (!req.params.id || req.params.id === "" || req.params.id === undefined || req.params.id === null) {
		logger.warn(`deleteMedia - 400 Bad request - missing fileId`, "|", reqInfo.ip);
		if(version != "v2"){return res.status(400).send({"result": false, "description" : "missing fileId"});}
		const result: ResultMessagev2 = {
			status: "error",
			message: "missing fileId",
		};
		res.setHeader("X-Reason", "missing fileId");
		return res.status(400).send(result);
	}

	//Check if fileId length is > 70
	if (req.params.id.length > 70) {
		logger.warn(`deleteMedia - 400 Bad request - fileId too long`, "|", reqInfo.ip);
		if(version != "v2"){return res.status(400).send({"result": false, "description" : "fileId too long"});}
		const result: ResultMessagev2 = {
			status: "error",
			message: "fileId too long",
		};
		res.setHeader("X-Reason", "fileId too long");
		return res.status(400).send(result);
	}

	// Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "delete", false, true, true);
	if (eventHeader.status !== "success") {
		
		//v0 and v1 compatibility
		if(version != "v2"){return res.status(401).send({"result": false, "description" : eventHeader.message});}

		const result : ResultMessagev2 = {
			status: MediaStatus[1],
			message: eventHeader.message
		}
		res.setHeader("X-Reason", eventHeader.message);
		return res.status(401).send(result);

	}

	
	logger.info(`deleteMedia - Request from:`, reqInfo.ip);

	const selectedFile = await dbMultiSelect(	["id","filename", "hash"],
												"mediafiles",
												"pubkey = ? and (filename = ? OR original_hash = ? or id = ?)",
												[eventHeader.pubkey, req.params.id, req.params.id, req.params.id],
												true);
	if (selectedFile.length == 0) {
		logger.warn("RES Delete Mediafile -> 404 Not found", eventHeader.pubkey, req.params.id, "|", reqInfo.ip);
		if(version != "v2"){return res.status(404).send({"result": false, "description" : "Mediafile deletion not found"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "Mediafile not found",
		};

		res.setHeader("X-Reason", "Mediafile not found");
		return res.status(404).send(result);
	}

	const fileid = selectedFile[0].id
	const filename = selectedFile[0].filename;

	logger.debug(`deleteMedia - Deleting file with id: ${fileid} and filename: ${filename}`, "|", reqInfo.ip);

	if (filename === undefined || filename === null || filename === "") {
		logger.error("Error getting file data from database", eventHeader.pubkey, fileid, "|", reqInfo.ip);
		if(version != "v2"){return res.status(500).send({"result": false, "description" : "Error getting file data from database"});}
		const result: ResultMessagev2 = {
			status: "error",
			message: "Error getting file data from database",
		};
		res.setHeader("X-Reason", "Internal Server Error");
		return res.status(500).send(result);
	}


	// Check if the file is the last one with the same hash, counting the number of files with the same hash
	const hashCount = await dbSelect("SELECT COUNT(*) as 'count' FROM mediafiles WHERE filename = ?", "count", [filename]);
	if (hashCount != '1') {
		logger.debug(`deleteMedia - Detected more files with same hash, skipping deletion from storage server`, eventHeader.pubkey, filename, "|", reqInfo.ip);
	}else{
		logger.info(`deleteMedia - Detected last file with same hash, deleting from storage server`, eventHeader.pubkey, filename, "|", reqInfo.ip);
		const result = deleteFile(filename);
		if (!result) {
			logger.error(`deleteMedia - 500 Internal Server Error - Error deleting file from remote server`, eventHeader.pubkey, filename, "|", reqInfo.ip);
			//v0 and v1 compatibility
			if(version != "v2"){return res.status(500).send({"result": false, "description" : "Error deleting file from remote server"})}

			const result: ResultMessagev2 = {
				status: MediaStatus[1],
				message: "Error deleting file from storage server",
			};
			res.setHeader("X-Reason", "Internal Server Error");
			return res.status(500).send(result);
		}
	}

	//Delete mediafile from database
	logger.debug(`deleteMedia - Deleting file from database with id:`, fileid, "pubkey:", eventHeader.pubkey, "filename:", filename, "|", reqInfo.ip);
	const deleteResult = await dbDelete("mediafiles", ["id","pubkey"],[fileid, eventHeader.pubkey]);
	if (deleteResult == false) {
		logger.warn(`deleteMedia - 404 Not found - file deletion not found on database`, "|", reqInfo.ip);

		//v0 and v1 compatibility
		if(version != "v2"){return res.status(404).send({"result": false, "description" : "Mediafile  not found on database"});}

		const result: ResultMessagev2 = {
			status: MediaStatus[1],
			message: "Mediafile not found on database",
		};
		res.setHeader("X-Reason", "Mediafile not found on database");
		return res.status(404).send(result);
	}

	//v0 and v1 compatibility
	if (version != "v2"){
		return res.status(200).send({result: true, description: `Mediafile deletion for id: ${fileid}, filename: ${filename} and pubkey ${eventHeader.pubkey} successful`});
	}

	const result = {
		status: MediaStatus[0],
		message: `Mediafile deletion with id: ${fileid}, filename: ${filename} and pubkey: ${eventHeader.pubkey} successful`,
	};
	logger.info(`deleteMedia - File deletion successfully: ${fileid} | ${filename} | ${eventHeader.pubkey}`, "|", reqInfo.ip);
	return res.status(200).send(result);

};

const headUpload = async (req: Request, res: Response): Promise<Response> => {

	// Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`headUpload - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		res.setHeader("X-Reason", reqInfo.comments);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("media", req.hostname)) {
		logger.info(`headUpload - Attempt to access a non-active module: media | IP:`, reqInfo.ip);
		res.setHeader("X-Reason", "Module is not enabled");
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`headUpload - Request from:`, reqInfo.ip);

	// Check if authorization header is valid
	const eventHeader = await parseAuthHeader(req, "upload", false, false, false);
	if (eventHeader.status != "success") {
		const result : ResultMessagev2 = {
			status: MediaStatus[1],
			message: eventHeader.message
		}
		res.setHeader("X-Reason", eventHeader.message);
		return res.status(401).send(result);

	}

	// Check if the pubkey is banned
	const isBanned = await isEntityBanned(eventHeader.pubkey, "registered");
	if (isBanned) {
		logger.warn(`headUpload - 403 Forbidden - Pubkey banned: ${eventHeader.pubkey}`, "|", reqInfo.ip);
		res.header("X-Reason", "Pubkey banned");
		return res.status(403).send();
	}

	const size = req.headers['x-content-length'] || 0;
	const type = Array.isArray(req.headers['x-content-type']) ? req.headers['x-content-type'][0] || "" : req.headers['x-content-type'] || "";
	const hash = Array.isArray(req.headers['x-sha-256']) ? req.headers['x-sha-256'][0] : req.headers['x-sha-256'] || "";
	const transform = Array.isArray(req.headers['x-content-transform']) ? req.headers['x-content-transform'][0] || "" : req.headers['x-content-transform'] || "";

	if (!Number(size) || size == 0 || type == "" || hash == "") {
		logger.info(`headUpload - 400 Bad request - Missing size, MIME type or SHA-256`, "|", reqInfo.ip);
		res.setHeader("X-Reason", "Missing size, MIME type or SHA-256");
		return res.status(400).send();
	}

	// Check if the MIME type is allowed
	if(!(await getAllowedMimeTypes()).includes(type)){
		logger.info(`headUpload - 400 Bad request - Filetype not allowed`, "|", reqInfo.ip);
		res.setHeader("X-Reason", "Filetype not allowed");
		return res.status(400).send();
	}

	// Check if the file hash is banned
	const isHashBanned = await isEntityBanned(hash, "mediafiles");
	if (isHashBanned) {
		logger.warn(`headUpload - 403 Forbidden - SHA-256 hash banned: ${hash}`, "|", reqInfo.ip);
		res.header("X-Reason", "SHA-256 hash banned");
		return res.status(403).send();
	}

	const transactionId = (await dbMultiSelect(["transactionid"], "mediafiles", transform != '0' ? "original_hash = ?" : "hash = ?", [hash], true))[0]?.transactionid || "" ;
	
	const transaction : Transaction = await checkTransaction(
		req.hostname,
		transactionId,
		"",
		"mediafiles",
		transform != '0' ? (Number(size)/3) : (Number(size)),
		0,
		getConfig(req.hostname, ["media", "maxMBfilesize"]) * 1024 * 1024,
		getConfig(req.hostname, ["payments", "satoshi", "mediaMaxSatoshi"]),
		eventHeader.pubkey
	);
	
	if (transaction.transactionid != 0 && transaction.isPaid == false && getConfig(req.hostname, ["payments", "satoshi", "mediaMaxSatoshi"]) > 0) {
		res.setHeader("X-Lightning", transaction.paymentRequest);
		res.setHeader("X-Lightning-Amount", transaction.satoshi);
		res.setHeader("X-Reason", `Invoice (${transaction.satoshi}) for hash: ${hash}`);
		return res.status(402).send();
	}

	logger.info(`headUpload - 200 OK - Upload allowed successfully`, "|", reqInfo.ip);
	res.header("X-Reason", "Upload allowed");
	return res.status(200).send();
}

export { uploadMedia,
		getMedia, 
		headMedia,
		getMediabyURL, 
		deleteMedia, 
		updateMediaVisibility, 
		getMediaTagsbyID, 
		getMediabyTags, 
		headUpload };