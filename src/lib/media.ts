import fastq, { queueAsPromised } from "fastq";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";

import { allowedMimeTypes, asyncTask, FileData, ProcessingFileData, UploadTypes, videoHeaderRange } from "../interfaces/media.js";
import { logger } from "./logger.js";
import config from "config";
import { connect, dbUpdate } from "./database.js";
import {fileTypeFromBuffer} from 'file-type';
import { Request } from "express";
import app from "../app.js";
import { generatefileHashfromfile } from "./hash.js";
import crypto from "crypto";
import { getClientIp } from "./utils.js";
import path from "path";
import sharp from "sharp";
import { saveFile } from "./storage/core.js";
import { deleteLocalFile } from "./storage/local.js";
import { checkTransaction } from "./payments/core.js";
import { moderateFile } from "./moderation/core.js";

const prepareFile = async (t: asyncTask): Promise<void> =>{

	logger.info(`Processing item, queue size = ${requestQueue.length() +1}`);

	if (!Array.isArray(t.req.files) || t.req.files.length == 0) {
		logger.error("ERR -> Preparing file for conversion, empty file");
		return;
	}
	if (!t.req.files[0]) {logger.error("ERR -> Preparing file for conversion, empty file");	return;}
	if (!t.req.files[0].mimetype) {logger.error("ERR -> Preparing file for conversion, empty mimetype");return;}
	if (!t.filedata.media_type) {logger.error("ERR -> Preparing file for conversion, empty type");return;}
	if (!t.filedata.pubkey) {logger.error("ERR -> Preparing file for conversion, empty pubkey");return;}

	logger.info("Processing file :",t.req.files[0].originalname,"=>",t.filedata.filename);
	await processFile(t.req.files[0], t.filedata, 0);

}

const requestQueue: queueAsPromised<asyncTask> = fastq.promise(prepareFile, 1); //number of workers for the queue

const processFile = async(	inputFile: Express.Multer.File,	options: ProcessingFileData, retry:number = 0): Promise<boolean> =>{

	if (retry > 5) {return false}

	options.conversionOutputPath = config.get("storage.local.tempPath") + "out" + crypto.randomBytes(20).toString('hex') + options.filename;

	logger.info("Using temporary paths:", options.conversionInputPath, options.conversionOutputPath);

	const result = new Promise(async(resolve, reject) => {

		const processing = await dbUpdate('mediafiles','status','processing', ['id'], [options.fileid]);
		if (!processing) {logger.error("Could not update table mediafiles, id: " + options.fileid, "status: processing");}

		if (options.no_transform == true) {
			logger.info("no_transform flag detected, skipping file conversion");
			if (await finalizeFileProcessing(options)) {
				logger.info(`File processed successfully: ${options.filename} ${options.filesize} bytes`);
				resolve(true);
				return;
			}
			else{
				reject("Error finalizing file processing");
				return;
			}
		}

		let MediaDuration: number = 0;
		let ConversionDuration : number = 0;
		options.newFileDimensions = (await setMediaDimensions(options.conversionInputPath, options)).toString()

		const ConversionEngine = initConversionEngine(options);

		ConversionEngine
			.on("end", async(end) => {

				if (await finalizeFileProcessing(options)) {
					logger.info(`File processed successfully: ${options.filename} ${ConversionDuration /2} seconds`);
					resolve(end);
				}
				else{
					reject("Error finalizing file processing");
				}
			})
			.on("error", async (err) => {

				logger.warn(`Error converting file, retrying file conversion: ${options.filename} retry: ${retry}/5`);
				logger.error(err);
				retry++
				await new Promise((resolve) => setTimeout(resolve, 3000));
				if (!await deleteLocalFile(options.conversionInputPath)){reject(err);}

				if (retry > 5){
					logger.error(`Error converting file after 5 retries: ${inputFile.originalname}`);
					const errorstate =  await dbUpdate('mediafiles','status','error',['id'], [options.fileid]);
					if (!errorstate) {
						logger.error("Could not update table mediafiles, id: " + options.fileid, "status: failed");
					}
					resolve(err);
				}
				processFile(inputFile, options, retry);
				resolve(err);

			})
			.on("codecData", (data) => {
				MediaDuration = parseInt(data.duration.replace(/:/g, ""));
			})
			.on("progress", async (data) => {

				const time = parseInt(data.timemark.replace(/:/g, ""));
				let percent: number = (time / MediaDuration) * 100;
				ConversionDuration = ConversionDuration + 1;
				if (percent < 0) {
					percent = 0;
				}
		
				if (percent %4 > 0 && percent %4 < 1){
					logger.debug(
						`Processing : ` +
							`${options.filename} - ${Number(percent).toFixed(0)} %`
					);

				await dbUpdate('mediafiles','percentage',Number(percent).toFixed(0).toString(), ['id'], [options.fileid]);
				}
				
			})
			.run();
	
	});

	return result.then(() => true).catch(() => false);
	
}

const initConversionEngine = (file: ProcessingFileData) => {

    const ffmpegEngine = ffmpeg(file.conversionInputPath)
        .outputOption(["-loop 0"]) //Always loop. If is an image it will not apply.
        .setSize(file.newFileDimensions)
        .output(file.conversionOutputPath)
        .toFormat(file.filename.split(".").pop() || "");

    if (file.filename.split(".").pop() == "webp" && file.originalmime != "image/gif") {
        ffmpegEngine.frames(1); //Fix IOS issue when uploading some portrait images.
    }

    if (file.outputoptions != "") {
        ffmpegEngine.outputOptions(file.outputoptions)
    }

	if (file.filename.split(".").pop() == "mp4") {
		ffmpegEngine.videoCodec("libx264");
		ffmpegEngine.fps(30);
	}

    return ffmpegEngine;
}

const ParseMediaType = (req : Request, pubkey : string): string  => {

	let media_type = "";

	//v0 compatibility, check if type is present on request body (v0 uses type instead of uploadtype)
	if (req.body.type != undefined && req.body.type != "") {
		logger.info("Detected 'type' field (deprecated v0) on request body, setting 'media_type' with 'type' data ", "|", getClientIp(req));
		media_type = req.body.type;
	}

	//v1 compatibility, check if uploadtype is present on request body (v1 uses uploadtype instead of media_type)
	if (req.body.uploadtype != undefined && req.body.uploadtype != "") {
		logger.info("Detected 'uploadtype' field (deprecated v1) on request body, setting 'media_type' with 'type' data ", "|", getClientIp(req));
		media_type = req.body.uploadtype;
	}

	//v2 compatibility, check if media_type is present on request body
	if (req.body.media_type != undefined && req.body.media_type != "") {
		media_type = req.body.media_type;
	}
	
	//Check if media_type is valid
	if (!UploadTypes.includes(media_type)) {
		logger.info(`Incorrect uploadtype or not present: `, media_type, "assuming uploadtype = media", "|", getClientIp(req));
		media_type = ("media");
	}

	//Check if the pubkey is public (the server pubkey) and media_type is different than media
	if (pubkey == app.get("config.server")["pubkey"] && media_type != "media") {
		logger.warn(`Public pubkey can only upload media files, setting media_type to "media"`, "|", getClientIp(req));
		media_type = "media";
	}

	return media_type;

}

const ParseFileType = async (req: Request, file :Express.Multer.File): Promise<{mime:string, ext:string}> => {

	//Detect file mime type
	const result = await fileTypeFromBuffer(file.buffer);
	if (result == undefined) {
		logger.warn(`RES -> 400 Bad request - Could not detect file mime type `,  "|", getClientIp(req));
		return {mime: "", ext: ""};
	}
	
	//Check if filetype is allowed
	if (!allowedMimeTypes.includes(result.mime)) {
		logger.warn(`RES -> 400 Bad request - filetype not allowed: `, result.mime,  "|", getClientIp(req));
		return {mime: "", ext: ""};
	}

	return result;

}

const GetFileTags = async (fileid: string): Promise<string[]> => {

	const tags = [];
	
	const dbTags = await connect("GetFileTags");
	try{
		const [dbTagsResult] = await dbTags.query("SELECT tag FROM mediatags WHERE fileid = ?", [fileid]);
		const tagsrowstemp = JSON.parse(JSON.stringify(dbTagsResult));
		if (tagsrowstemp[0] !== undefined) {
			for (let i = 0; i < tagsrowstemp.length; i++) {
				tags.push(tagsrowstemp[i].tag);
			}
		}
		dbTags.end();
	}
	catch (error) {
		logger.error("Error getting file tags from database", error);
		dbTags.end();
	}
	
	return tags;
}

const standardMediaConversion = (filedata : ProcessingFileData , file:Express.Multer.File) :void  => {

		//Video or image conversion options
		if (file.mimetype.toString().startsWith("video")) {
			filedata.width = config.get("media.transform.media.video.width");
			filedata.height = config.get("media.transform.media.video.height");
			filedata.outputoptions = '-preset veryfast';
		}
		if (file.mimetype.toString().startsWith("image")) {
			filedata.width = config.get("media.transform.media.image.width");
			filedata.height = config.get("media.transform.media.image.height");
		}
	
		//Avatar conversion options
		if (filedata.media_type.toString() === "avatar"){
			filedata.width = config.get("media.transform.avatar.width");
			filedata.height = config.get("media.transform.avatar.height");
		}
	
		//Banner conversion options
		if (filedata.media_type.toString() === "banner"){
			filedata.width = config.get("media.transform.banner.width");
			filedata.height = config.get("media.transform.banner.height");
		}

		return;

}

async function setMediaDimensions(file:string, options:ProcessingFileData):Promise<string> {

	const response:string = await new Promise (async (resolve) => {

		let mediaWidth : number | undefined;
		let mediaHeight : number | undefined;
		
		// If is an image and has orientation, swap width and height. More info: https://github.com/lovell/sharp/commit/4ac65054bcf4d59a90764f908f8921f5e927d364 
		if (options.originalmime.startsWith("image")) {
			const imageInfo = await sharp(file).metadata()
			if (imageInfo.orientation && imageInfo.orientation >= 5) {
				mediaWidth = imageInfo.height;
				mediaHeight = imageInfo.width;
			}
		}
	
		ffmpeg.ffprobe(file, (err, metadata) => {
		if (err) {
			logger.error("Could not get media dimensions of file: " + options.filename + " using default min width (640px)");
			resolve("640x480"); //Default min width
			return;
		} else {
			let videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
			if (videoStream) {
				mediaWidth = mediaWidth ? mediaWidth : videoStream.width;
				mediaHeight = mediaHeight ? mediaHeight : videoStream.height;
			}
			let newWidth = options.width;
			let newHeight = options.height;

			
			if (!mediaWidth || !mediaHeight) {
				logger.warn("Could not get media dimensions of file: " + options.filename + " using default min width (640px)");
				resolve("640x480"); //Default min width
				return;
			}

			if (mediaWidth > newWidth || mediaHeight > newHeight) {
				if (mediaWidth > mediaHeight) {
					newHeight = (mediaHeight / mediaWidth) * newWidth;
				}else{
					newWidth = (mediaWidth / mediaHeight) * newHeight;
				}
			}else{
				newWidth = mediaWidth;
				newHeight = mediaHeight;
			}

			//newHeigt truncated to 0 decimals
			newWidth = Math.trunc(+newWidth);
			newHeight = Math.trunc(+newHeight);

			logger.debug("Origin dimensions:", +mediaWidth + "px", +mediaHeight + "px",);
			logger.info("Output dimensions:", +newWidth + "px", +newHeight + "px",);		

			resolve(newWidth + "x" + newHeight);
		}})

	});

	return response;

}

const getFileSize = (path:string,options:ProcessingFileData) :number => {

	logger.debug("Old Filesize:", options.filesize);
	let newfilesize : number = 0;
	try{
		newfilesize = +fs.statSync(path).size;
		logger.debug("New Filesize:", newfilesize);
		return newfilesize;
	}catch(err){
		logger.error(err);
		return 0;
	}

}

const getNotFoundMediaFile = (): Promise<Buffer> => {
    return new Promise((resolve) => {
        const notFoundPath = path.normalize(path.resolve(config.get("media.notFoundFilePath")));
        fs.readFile(notFoundPath, (err, data) => {
            if (err) {
                logger.error(err);
                resolve(Buffer.from(""));
            } else {
                resolve(data);
            }
        });
    });
}

const readRangeHeader = (range : string | undefined, totalLength : number ): videoHeaderRange => {

	if (range == null || range.length == 0 || range == undefined)
		return { Start: 0, End: totalLength - 1};

	const array = range.split(/bytes=([0-9]*)-([0-9]*)/);
	const start = parseInt(array[1]);
	const end = parseInt(array[2]);
	const result = {
		Start: isNaN(start) ? 0 : start,
		End: isNaN(end) ? (totalLength - 1) : end
	};

	if (!isNaN(start) && isNaN(end)) {
		result.Start = start;
		result.End = totalLength - 1;
	}

	if (isNaN(start) && !isNaN(end)) {
		result.Start = totalLength - end;
		result.End = totalLength - 1;
	}

	return result;
}

const finalizeFileProcessing = async (filedata: ProcessingFileData): Promise<boolean> => {
	try{
		await dbUpdate('mediafiles','percentage','100',['id'], [filedata.fileid]);
		await dbUpdate('mediafiles','visibility','1',['id'], [filedata.fileid]);
		await dbUpdate('mediafiles','active','1',['id'], [filedata.fileid]);
		await dbUpdate('mediafiles', 'hash', filedata.no_transform == true ? filedata.originalhash : await generatefileHashfromfile(filedata.conversionOutputPath), ['id'], [filedata.fileid]);
		// if (config.get("torrent.enableTorrentSeeding")) {await CreateMagnet(filedata.conversionOutputPath, filedata);}
		await dbUpdate('mediafiles','status','success',['id'], [filedata.fileid]);
		const filesize = getFileSize(filedata.no_transform == true ? filedata.conversionInputPath: filedata.conversionOutputPath ,filedata)
		await dbUpdate('mediafiles', 'filesize', filesize ,['id'], [filedata.fileid]);
		await dbUpdate('mediafiles','dimensions',filedata.newFileDimensions.split("x")[0] + 'x' + filedata.newFileDimensions.split("x")[1],['id'], [filedata.fileid]);
		await saveFile(filedata, filedata.no_transform == true ? filedata.conversionInputPath: filedata.conversionOutputPath );

		if (filedata.no_transform == false) { await deleteLocalFile(filedata.conversionOutputPath);}
		await deleteLocalFile(filedata.conversionInputPath);

		await checkTransaction("", filedata.fileid, "mediafiles", filesize, filedata.pubkey);

		moderateFile(filedata.url).then((result) => {
			result.code == "NA"? dbUpdate('mediafiles','checked','1',['id'], [filedata.fileid]): null;
		}).catch((err) => {
			logger.error("Error moderating file", err);
		});

		return true;

	}catch(err){
		logger.error("Error finalizing file processing", err);
		return false;
	}
}

export {processFile, requestQueue, ParseMediaType, ParseFileType,GetFileTags, standardMediaConversion, getNotFoundMediaFile, readRangeHeader};