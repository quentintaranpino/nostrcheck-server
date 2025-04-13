import fastq, { queueAsPromised } from "fastq";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";

import { MediaJob, LegacyMediaReturnMessage, FileData, UploadTypes, VideoHeaderRange } from "../interfaces/media.js";
import { logger } from "./logger.js";
import { connect, dbMultiSelect, dbUpdate } from "./database.js";
import {fileTypeFromBuffer} from 'file-type';
import { Request } from "express";
import { generatefileHashfromfile } from "./hash.js";
import crypto from "crypto";
import { getClientIp } from "./security/ips.js";
import path from "path";
import sharp from "sharp";
import { saveFile } from "./storage/core.js";
import { deleteLocalFile } from "./storage/local.js";
import { moderateFile } from "./moderation/core.js";
import { generateVideoFromImage, getHostInfo } from "./utils.js";
import { getConfig } from "./config/core.js";
import { getResource } from "./frontend.js";

const prepareFile = async (t: MediaJob): Promise<void> =>{

	logger.info(`prepareFile - Processing file, queue size = ${requestQueue.length() +1}`);

	if (!Array.isArray(t.req.files) || t.req.files.length == 0) {
		logger.error(`prepareFile - Error, file is empty | ${getClientIp(t.req)}`);
		return;
	}
	if (!t.req.files[0]) {logger.error(`prepareFile - Error, file is empty | ${getClientIp(t.req)}`);return;}
	if (!t.req.files[0].mimetype) {logger.error(`prepareFile - Error, file mimetype is empty | ${getClientIp(t.req)}`);return;}
	if (!t.filedata.media_type) {logger.error(`prepareFile - Error, file type is empty | ${getClientIp(t.req)}`);return;}
	if (!t.filedata.pubkey) {logger.error(`prepareFile - Error, file pubkey is empty | ${getClientIp(t.req)}`);return;}

	logger.info(`prepareFile - Processing file ${t.req.files[0].originalname} | ${getClientIp(t.req)}`);
	await processFile(t.req.files[0], t.filedata, 0);

}
// Create the fastq queue for media tasks
const requestQueue: queueAsPromised<MediaJob> = fastq.promise(prepareFile, 1);

const processFile = async ( inputFile: Express.Multer.File,	options: FileData, retry:number = 0): Promise<boolean> =>{

	if (retry > 5) {return false}
	
	options.conversionOutputPath = getConfig(options.tenant, ["storage", "local", "tempPath"]) + "out" + crypto.randomBytes(20).toString('hex') + options.filename;

	logger.debug(`processFile - Processing file: ${inputFile.originalname}, using temporary paths: ${options.conversionInputPath}, ${options.conversionOutputPath}`);

	const result = new Promise(async(resolve, reject) => {

		const processing = await dbUpdate('mediafiles',{'status':'processing'}, ['id'], [options.fileid]);
		if (!processing) logger.error(`processFile - Could not update table mediafiles, id: ${options.fileid}, status: processing`);

		if (options.no_transform == true) {
			logger.debug(`processFile - no_transform flag detected, skipping file conversion`);
			if (await finalizeFileProcessing(options)) {
				logger.info(`processFile - File processed successfully: ${options.filename} ${options.filesize} bytes`);
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


		if (options.originalmime.startsWith("image")) {

			await initImageConversionEngine(options);
			if (await finalizeFileProcessing(options)) {
				logger.info(`processFile - File processed successfully: ${options.filename} ${options.filesize} bytes`);
				resolve(true);
				return;
			}
			else{
				await deleteLocalFile(options.conversionInputPath);
				reject("Error finalizing file processing");
				return;
			}
			
		}else{

			const videConversion = initVideoConversionEngine(options);

			videConversion
			.on("end", async(end) => {

				if (await finalizeFileProcessing(options)) {
					logger.info(`processFile - File processed successfully: ${options.filename} ${ConversionDuration /2} seconds`);	
					resolve(end);
				}
				else{
					reject("Error finalizing file processing");
				}
			})
			.on("error", async (err) => {
				logger.warn(`processFile - Error converting file: ${options.filename}, retry: ${retry}/5, with error ${err}`);
				retry++
				await new Promise((resolve) => setTimeout(resolve, 3000));
				if (!await deleteLocalFile(options.conversionInputPath)){reject(err);}

				if (retry > 5){
					logger.error(`processFile - Error converting file after 5 retries: ${inputFile.originalname}`);
					const errorstate =  await dbUpdate('mediafiles',{'status':'error'},['id'], [options.fileid]);
					if (!errorstate) {
						logger.error(`processFile - Could not update table mediafiles, id: ${options.fileid}, status: error`);
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
					logger.debug(`Processing : ` +	`${options.filename} - ${Number(percent).toFixed(0)} %`	);
					await dbUpdate('mediafiles',{'percentage' : Number(percent).toFixed(0).toString()}, ['id'], [options.fileid]);
				}
				
			})
			.run();
		}
	
	});

	return result.then(() => true).catch(() => false);
	
}

const initVideoConversionEngine = (file: FileData) => {

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


async function initImageConversionEngine(file: FileData) {
	try {
		await sharp(file.conversionInputPath, {"animated":true} ).resize({
		width: parseInt(file.newFileDimensions.split("x")[0]), 
		height: parseInt(file.newFileDimensions.split("x")[1]),
		fit: 'cover', 
		})

		.webp({ quality: 80, loop: 0 }) 
		.toFile(file.conversionOutputPath);

  
	} catch (error) {
		logger.error(`initImageConversionEngine - Error converting image: ${file.filename}`, error);
	}

}

const getUploadType = (req : Request): string  => {

	let uploadtype = "media";

	// v0 compatibility and v1 compatibility
	if (req.body?.type != undefined && req.body?.type != "") {uploadtype = req.body.type;}
	if (req.body?.media_type != undefined && req.body?.media_type != "") {uploadtype = req.body.media_type;}

	// v2 compatibility
	if (req.body?.uploadtype != undefined && req.body?.uploadtype != "") {uploadtype = req.body.uploadtype;}

	//Check if media_type is valid
	!UploadTypes.includes(uploadtype)? logger.debug(`getUploadType - Incorrect uploadtype or not present: ${uploadtype} setting "media" | ${getClientIp(req)}`) : null;
	return uploadtype;

}

const getFileMimeType = async (req: Request, file :Express.Multer.File): Promise<string> => {

	const fileType: {mime: string, ext: string} = await fileTypeFromBuffer(file.buffer) || {mime: "", ext: ""};

	// Try to get mime type from file object.
	if (fileType.mime == "") fileType.mime = file.mimetype 

	// Normalize the mime type for application/x- types
	if (fileType.mime.startsWith("application/x-")) {
		fileType.mime = fileType.mime.replace("application/x-", "application/");
	}

	// For text files without extension and mime type (LICENSE, README, etc)
	if (fileType.ext == "" && fileType.mime == "") {
		fileType.mime = 'text/plain';
	}

	// For handlebars templates containing XML
	if (fileType.mime == "application/xml" && fileType.ext == "xml" && file.mimetype == 'text/x-handlebars-template') {
		fileType.mime = 'text/x-handlebars-template';
		fileType.ext = 'hbs';
	}

	if(!(await getAllowedMimeTypes()).includes(fileType.mime)){
		logger.info(`getFileMimeType - Filetype not allowed: ${file.mimetype} | ${getClientIp(req)}`);
		return "";
	}
	
	return fileType.mime;

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
		logger.error(`GetFileTags - Error getting file tags from database with error: ${error}`);
		dbTags.end();
	}
	
	return tags;
}

const standardMediaConversion = (filedata : FileData , file:Express.Multer.File) :void  => {

	// Video or image conversion options
	if (file.mimetype.toString().startsWith("video")) {
		filedata.width = getConfig(filedata.tenant, ["media", "transform", "media", "video", "width"]);
		filedata.height = getConfig(filedata.tenant, ["media", "transform", "media", "video", "height"]);
		filedata.outputoptions = '-preset veryfast';
	}
	if (file.mimetype.toString().startsWith("image")) {
		filedata.width = getConfig(filedata.tenant, ["media", "transform", "media", "image", "width"]);
		filedata.height = getConfig(filedata.tenant, ["media", "transform", "media", "image", "height"]);
	}

	// Avatar conversion options
	if (filedata.media_type.toString() === "avatar"){
		filedata.width = getConfig(filedata.tenant, ["media", "transform", "avatar", "width"]);
		filedata.height = getConfig(filedata.tenant, ["media", "transform", "avatar", "height"]);
	}

	// Banner conversion options
	if (filedata.media_type.toString() === "banner"){
		filedata.width = getConfig(filedata.tenant, ["media", "transform", "banner", "width"]);
		filedata.height = getConfig(filedata.tenant, ["media", "transform", "banner", "height"]);
	}

	return;

}

const getMediaDimensions = async (file: string, fileData: { originalmime: string }): Promise<{ width: number; height: number }> => {
	
    if (file === "" || fileData === undefined) {
		logger.error(`getMediaDimensions - Error processing file: file or fileData is empty`);
        return { width: 640, height: 480 };
    }

    if (!fileData.originalmime.startsWith("image") && !fileData.originalmime.startsWith("video")) return { width: 0, height: 0 };

    return new Promise<{ width: number; height: number }>(async (resolve) => {
        try {
            if (fileData.originalmime.startsWith("image")) {
				const imageInfo = await sharp(file).rotate().metadata();
				logger.debug(`getMediaDimensions - Image info: ${imageInfo.width}x${imageInfo.height}`);
				resolve({ width: imageInfo.width!, height: imageInfo.height! });
            } else {
                ffmpeg.ffprobe(file, (err, metadata) => {
                    if (err) {
						logger.debug(`getMediaDimensions - Error getting media dimensions of file: ${file}, using defaults (640 x 480)`);
                        resolve({ width: 640, height: 480 });
                    } else {
                        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
                        if (videoStream) {

							let width = videoStream?.width || 640;
							let height = videoStream?.height || 480;
							const rotation = videoStream?.rotation || "0";
					
							if (rotation === "-90" || rotation === "90") [width, height] = [height, width];
						
                            resolve({ width, height });

                        } else {
							logger.debug(`getMediaDimensions - Could not get media dimensions of file: ${file}, using defaults (640 x 480)`);
                            resolve({ width: 640, height: 480 });
                        }
                    }
                });
            }
        } catch (error) {
			logger.error(`getMediaDimensions - Error processing file: ${error}`);
            resolve({ width: 640, height: 480 });
        }
    });
};


const setMediaDimensions = async (file:string, options:FileData):Promise<string> => {

	const response:string = await new Promise (async (resolve) => {

		const mediaDimensions = await getMediaDimensions(file, options);

		const mediaWidth : number = mediaDimensions.width? mediaDimensions.width: 0;
		const mediaHeight : number = mediaDimensions.height? mediaDimensions.height: 0;

		let newWidth = 640;
		let newHeight = 480;

		// Avatar and banner dimensions
		if (options.media_type == "avatar") {
			newWidth = getConfig(options.tenant, ["media", "transform", "avatar", "width"]);
			newHeight = getConfig(options.tenant, ["media", "transform", "avatar", "height"]);
			resolve(newWidth + "x" + newHeight);
			return;
		}

		if (options.media_type == "banner") {
			newWidth = getConfig(options.tenant, ["media", "transform", "banner", "width"]);
			newHeight = getConfig(options.tenant, ["media", "transform", "banner", "height"]);
			resolve(newWidth + "x" + newHeight);
			return;
		}

		// Standard media dimensions 
		if (options.originalmime.startsWith("video")) {
			newWidth = getConfig(options.tenant, ["media", "transform", "media", "video", "width"]);
			newHeight = getConfig(options.tenant, ["media", "transform", "media", "video", "height"]);
		}

		if (options.originalmime.startsWith("image")) {
			newWidth = getConfig(options.tenant, ["media", "transform", "media", "image", "width"]);
			newHeight = getConfig(options.tenant, ["media", "transform", "media", "image", "height"]);
		}
			
		if (mediaWidth == 0 || mediaHeight == 0) {
			logger.debug(`setMediaDimensions - Could not get media dimensions of file: ${options.filename} using default size (640x480)`);
			resolve("640x480");
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

		newWidth = Math.trunc(+newWidth);
		newHeight = Math.trunc(+newHeight);

		logger.debug(`setMediaDimensions - Original dimensions: ${mediaWidth}x${mediaHeight} | New dimensions: ${newWidth}x${newHeight}`);

		resolve(newWidth + "x" + newHeight);
	});

	return response;

}

const getFileSize = (path:string, options:FileData) :number => {

	let newfilesize : number = 0;
	try{
		newfilesize = +fs.statSync(path).size;
		logger.debug(`getFileSize - New file size: ${newfilesize} bytes old size: ${options.filesize} bytes`);
		return newfilesize;
	}catch(err){
		logger.error(err);
		return 0;
	}

}

const getNotFoundFileBanner = async (domain: string, mimeType: string): Promise<Buffer> => {

	const notFoundPath = await getResource(domain, "media-file-not-found.webp");

	if (notFoundPath == null) {
		logger.error(`getNotFoundFileBanner - Error getting not found file banner, path is null`);
		return Buffer.from("");
	}

	try {
		const buffer = await fs.promises.readFile(notFoundPath);
		if (mimeType.startsWith('video')) {
			const videoBuffer = await generateVideoFromImage(buffer);
			return videoBuffer;
		} else {
			return buffer;
		}
	} catch (err) {
		logger.error(`getNotFoundFileBanner - Error reading file: ${notFoundPath} with error: ${err}`);
		return Buffer.from("");
	}
};

const readRangeHeader = (range : string | undefined, totalLength : number ): VideoHeaderRange => {

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

const finalizeFileProcessing = async (filedata: FileData): Promise<boolean> => {
	try{
		await dbUpdate('mediafiles',{'percentage':'100'},['id'], [filedata.fileid]);
		await dbUpdate('mediafiles',{'visibility':'1'},['id'], [filedata.fileid]);
		await dbUpdate('mediafiles',{'active':'1'},['id'], [filedata.fileid]);
		await dbUpdate('mediafiles', {'hash': filedata.no_transform == true ? filedata.originalhash : await generatefileHashfromfile(filedata.conversionOutputPath)}, ['id'], [filedata.fileid]);
		await dbUpdate('mediafiles',{'status':'success'},['id'], [filedata.fileid]);
		const filesize = getFileSize(filedata.no_transform == true ? filedata.conversionInputPath: filedata.conversionOutputPath ,filedata)
		await dbUpdate('mediafiles', {'filesize':filesize},['id'], [filedata.fileid]);
		await dbUpdate('mediafiles',{'dimensions':filedata.newFileDimensions},['id'], [filedata.fileid]);
		if (filedata.no_transform == false) await dbUpdate('mediafiles',{'mimetype': await getMimeType(filedata.originalmime,true)},['id'], [filedata.fileid]);
		await saveFile(filedata, filedata.no_transform == true ? filedata.conversionInputPath: filedata.conversionOutputPath );

		if (filedata.no_transform == false) { await deleteLocalFile(filedata.conversionOutputPath);}
		await deleteLocalFile(filedata.conversionInputPath);

		await moderateFile("mediafiles", filedata.fileid, filedata.tenant);

		return true;

	}catch(err){
		logger.error(`finalizeFileProcessing - Error finalizing file processing: ${err}`);
		return false;
	}
}

const prepareLegacMediaEvent = async (filedata : FileData): Promise<LegacyMediaReturnMessage> => {

    const event : LegacyMediaReturnMessage = {

        result: filedata.status == "success" || filedata.status == "completed" || filedata.status == "pending" ? true : false,
		description: filedata.description,
		status: filedata.status,
		id: filedata.fileid,
		pubkey: filedata.pubkey,
		url: filedata.url,
		hash: filedata.hash,
		magnet: filedata.magnet,
		tags: await GetFileTags(filedata.fileid)

        }

    return event;

}

/**
 * Get the file extension from a mime type.
 * Optionally returns the converted extension if specified.
 *
 * @param mimeType - The MIME type to look up.
 * @param converted - If true, returns the converted extension instead of the original one. Default is false.
 * @returns The corresponding file extension, or undefined if not found or inactive.
 *
 * @example
 * getExtension("text/markdown") // "md"
 * getExtension("image/png", true) // "webp"
 */
const getExtension = async (mimeType: string, converted: boolean = false): Promise<string | undefined> => {
	const [fileType] = await dbMultiSelect(
		['original_extension', 'converted_extension'],
		'filetypes',
		'original_mime = ? AND active = 1',
		[mimeType]
	);
	return fileType ? (converted ? fileType.converted_extension : fileType.original_extension) : undefined;
}


/**
 * Get the MIME type from a file extension or original MIME.
 * Optionally returns the converted MIME type.
 *
 * @param input - File extension (e.g. "md") or MIME type (e.g. "text/markdown").
 * @param converted - If true, returns the converted MIME type instead of the original.
 * @returns The matching MIME type, or undefined if not found or inactive.
 *
 * @example
 * getMimeType("md") // "text/markdown"
 * getMimeType("image/png", true) // "image/webp"
 */
const getMimeType = async (input: string, converted: boolean = false): Promise<string | undefined> => {
	const [fileType] = await dbMultiSelect(
		['original_mime', 'converted_mime'],
		'filetypes',
		'(original_extension = ? OR original_mime = ?) AND active = 1',
		[input, input]
	);
	return fileType ? (converted ? fileType.converted_mime : fileType.original_mime) : undefined;
};

/**
 * Get the allowed MIME types from the database (active only).
 * 
 * @returns An array of allowed MIME types.
 * 
 * @example
 * const mimes = await getAllowedMimeTypes(); // ["image/png", "text/markdown", ...]
 */
const getAllowedMimeTypes = async (): Promise<string[]> => {
	const rows = await dbMultiSelect(
		["original_mime"],
		"filetypes",
		"active = 1",
		[],
		false
	);
	return [...new Set(rows.map(row => row.original_mime))];
};

const getVideoDuration = async (videoPath: string): Promise<number> => {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(videoPath, (err, metadata) => {
			if (err) {
				reject(err);
			} else {
				resolve(metadata.format.duration ?? 0 );
			}
		});
	});
};


/**
 * Extract frames from a video file
 * @param videoPath The path to the video file
 * @param outputDir The path to the output directory
 * @param frameRate The frame rate
 * @returns The extracted frames
 **/
const extractVideoFrames = async (videoPath: string, outputDir: string): Promise<string[]> => {

	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	const mediaDuration = await getVideoDuration(videoPath);
	let fps: number = 1;
	if (mediaDuration < 1800) {
		fps = Math.max(0.5, Math.min(500 / mediaDuration, 10));
	} else {
		fps = 600 / mediaDuration;
	}

	logger.debug(`extractVideoFrames - Extracting frames from ${videoPath} with FPS: ${fps}`);

    return new Promise((resolve) => {

        ffmpeg(videoPath)
            .output(path.join(outputDir, `${Math.random().toString(36).substring(7)}-frame-%04d.jpg`))
			.size("240x240")
            .videoFilter(`fps=${fps}`)	
			.outputOptions("-threads 2")
            .on("end", () => {
                const extractedFrames = fs.readdirSync(outputDir).map(file => path.join(outputDir, file));
                logger.debug(`extractVideoFrames - Extracted frames from ${videoPath}: ${extractedFrames.length}`);
                resolve(extractedFrames);
            })
            .on("error", (err) => {
                logger.error(`extractVideoFrames - Error extracting frames from ${videoPath}: ${err}`);
                resolve([]);
            })
			.run();
    });
};


/**
 * Get the URL of a media file
 * @param type The media type (NIP96 or BLOSSOM)
 * @returns The URL of the media file
 **/
const getMediaUrl = (type: "NIP96" | "BLOSSOM", domain: string): string => {
	const environment = getConfig(null, ["environment"]);
	const useCDNPrefix = getConfig(domain, ["media", "useCDNPrefix"]);
	const returnURL = getConfig(domain, ["media", "returnURL"]);

	const hostInfo = getHostInfo(domain);
	if (environment === "development") return `${hostInfo.url}/api/v2/media`;
	if (returnURL)	return returnURL;
	return `https://${useCDNPrefix ? `cdn.${hostInfo.hostname}` : type === "NIP96" ? `${hostInfo.hostname}/media` : hostInfo.hostname}`;
}

/**
 * Get the URL of a file
 * @param filename The file name
 * @param pubkey The public key
 * @returns The URL of the file
 **/
const getFileUrl = (filename: string, pubkey : string = "", domain: string): string => {
	return `${getMediaUrl(pubkey != "" ? "NIP96" : "BLOSSOM", domain)}/${pubkey !== "" ? pubkey + "/" : ""}${filename}`;
};

export {processFile, 
		requestQueue, 
		getUploadType, 
		getFileMimeType, 
		GetFileTags,
		getMediaDimensions, 
		standardMediaConversion, 
		getNotFoundFileBanner, 
		readRangeHeader, 
		prepareLegacMediaEvent,
		getExtension,
		getMimeType,
		getAllowedMimeTypes,
		extractVideoFrames, 
		getFileUrl,
		getMediaUrl};