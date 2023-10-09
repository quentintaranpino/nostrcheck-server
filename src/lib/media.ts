import fastq, { queueAsPromised } from "fastq";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";

import { allowedMimeTypes, asyncTask, ProcessingFileData, UploadTypes } from "../interfaces/media.js";
import { logger } from "./logger.js";
import config from "config";
import { dbFileHashupdate, dbFileMagnetUpdate, dbFileStatusUpdate, dbFileVisibilityUpdate, dbFileblurhashupdate } from "./database.js";
import {fileTypeFromBuffer} from 'file-type';
import { Request } from "express";
import app from "../app.js";
import { generateBlurhash } from "./blurhash.js";

const requestQueue: queueAsPromised<any> = fastq.promise(PrepareFile, 2); //number of workers for the queue

async function PrepareFile(t: asyncTask): Promise<void> {

	//Show queue status
	logger.info(`Processing item, queue size = ${requestQueue.length() +1}`);

	if (!t.req.file) {
		logger.error("ERR -> Preparing file for conversion, empty file");
		return;
	}

	if (!t.req.file.mimetype) {
		logger.error("ERR -> Preparing file for conversion, empty mimetype");
		return;
	}

	if (!t.filedata.media_type) {
		logger.error("ERR -> Preparing file for conversion, empty type");
		return;
	}

	if (!t.filedata.username) {
		logger.error("ERR -> Preparing file for conversion, empty username");
		return;
	}

	logger.info(
		"Processing file",
		":",
		t.req.file.originalname,
		"=>",
		`${t.filedata.outputname}.${t.filedata.outputmime}`
	);

	await convertFile(t.req.file, t.filedata, 0);

}

async function convertFile(
	inputFile: any,
	options: ProcessingFileData,
	retry:number = 0
): Promise<boolean> {

	if (retry > 5) {return false}

	const TempPath = config.get("media.tempPath") + options.outputname;
	logger.info("Using temp path:", TempPath);
	let NewDimensions = setMediaDimensions(TempPath, options);
	return new Promise(async(resolve, reject) => {
		//We write the file on filesystem because ffmpeg doesn't support streams
		fs.writeFile(TempPath, inputFile.buffer, function (err) {
			if (err) {
				logger.error(err);

				reject(err);

				return;
			}
		});

		//Set status processing on the database
		const processing =  dbFileStatusUpdate("processing", options);
		if (!processing) {
			logger.error("Could not update table mediafiles, id: " + options.fileid, "status: processing");
		}

		const MediaPath = config.get("media.mediaPath") + options.username + "/" + options.outputname + "." + options.outputmime;
		logger.info("Using media path:", MediaPath);

		let MediaDuration: number = 0;
		let ConversionDuration : number = 0;
		

		let ConversionEngine = ffmpeg(TempPath)
			.outputOption(["-loop 0"]) //Always loop. If is an image it will not apply.
			.setSize((await NewDimensions).toString())
			.output(MediaPath)
			.toFormat(options.outputmime)

		if (options.outputmime == "webp" && options.originalmime != "image/gif") {
			ConversionEngine.frames(1); //Fix IOS issue when uploading some portrait images.
		}
			
		if (options.outputoptions != "") {
			ConversionEngine.outputOptions(options.outputoptions)
		}

		ConversionEngine
			.on("end", async(end) => {
			
				fs.unlink(TempPath, (err) => {
				if (err) {
					logger.error(err);

					reject(err);

					return;
				}
				});

				const visibility = dbFileVisibilityUpdate(true, options);
				if (!visibility) {
					logger.error("Could not update table mediafiles, id: " + options.fileid, "visibility: true");
				}
				const hash = dbFileHashupdate(MediaPath, options);
				if (!hash) {
					logger.error("Could not update table mediafiles, id: " + options.fileid, "hash for file: " + MediaPath);
				}
				
				const magnet = dbFileMagnetUpdate(MediaPath, options);
				if (!magnet) {
					logger.error("Could not update table mediafiles, id: " + options.fileid, "magnet for file: " + MediaPath);
				}

				const completed = dbFileStatusUpdate("completed", options);
				if (!completed) {
					logger.error("Could not update table mediafiles, id: " + options.fileid, "status: completed");
				}

				// const blurhash = dbFileblurhashupdate(await generateBlurhash(inputFile), options);
				// if (!blurhash) {
				// 	logger.error("Could not update table mediafiles, id: " + options.fileid, "blurhash for file: " + TempPath);
				// }
				
				logger.info(`File converted successfully: ${MediaPath} ${ConversionDuration /2} seconds`);

				resolve(end);

			})
			.on("error", (err) => {

				logger.warn(`Error converting file, retrying file conversion: ${options.outputname} retry: ${retry}/5`);
				logger.error(err);
				retry++
				fs.unlink(TempPath, (err) => {
					if (err) {
						logger.error(err);
	
						reject(err);
	
						return;
					}
				});

				if (retry > 5){
					logger.error(`Error converting file after 5 retries: ${inputFile.originalname}`);
					const errorstate =  dbFileStatusUpdate("failed", options);
					if (!errorstate) {
						logger.error("Could not update table mediafiles, id: " + options.fileid, "status: failed");
					}
					resolve(err);
				}
				convertFile(inputFile, options, retry);
				resolve(err);

			})
			.on("codecData", (data) => {
				MediaDuration = parseInt(data.duration.replace(/:/g, ""));
			})
			.on("progress", (data) => {

				const time = parseInt(data.timemark.replace(/:/g, ""));
				let percent: number = (time / MediaDuration) * 100;
				ConversionDuration = ConversionDuration + 1;
				if (percent < 0) {
					percent = 0;
				}
		
				if (percent %25 > 0 && percent %25 < 1){
					logger.info(
						`Processing : ` +
							`${options.outputname} - ${Number(percent).toFixed(2)} %`
					);
				}
				
			})
			.run();
	
	});
	
}

const ParseMediaType = (req : Request, pubkey : string): string  => {

	let media_type = "";

	//v0 compatibility, check if type is present on request body (v0 uses type instead of uploadtype)
	if (req.body.type != undefined && req.body.type != "") {
		logger.warn("Detected 'type' field (deprecated v0) on request body, setting 'media_type' with 'type' data ", "|", req.socket.remoteAddress);
		media_type = req.body.type;
	}

	//v1 compatibility, check if uploadtype is present on request body (v1 uses uploadtype instead of media_type)
	if (req.body.uploadtype != undefined && req.body.uploadtype != "") {
		logger.warn("Detected 'uploadtype' field (deprecated v1) on request body, setting 'media_type' with 'type' data ", "|", req.socket.remoteAddress);
		media_type = req.body.uploadtype;
	}

	//v2 compatibility, check if media_type is present on request body
	if (req.body.media_type != undefined && req.body.media_type != "") {
		media_type = req.body.media_type;
	}
	
	//Check if media_type is valid
	if (!UploadTypes.includes(media_type)) {
		logger.warn(`RES -> 400 Bad request - incorrect uploadtype: `, media_type,  "|", req.socket.remoteAddress);
		logger.warn("assuming uploadtype = media");
		media_type = ("media");
	}

	//Check if the pubkey is public (the server pubkey) and media_type is different than media
	if (pubkey == app.get("pubkey") && media_type != "media") {
		logger.warn(`Public pubkey can only upload media files, setting media_type to "media"`, "|", req.socket.remoteAddress);
		media_type = "media";
	}

	return media_type;

}

const ParseFileType = async (req: Request, file :Express.Multer.File): Promise<string> => {

	//Detect file mime type
	const DetectedFileType = await fileTypeFromBuffer(file.buffer);
	if (DetectedFileType == undefined) {
		logger.warn(`RES -> 400 Bad request - Could not detect file mime type `,  "|", req.socket.remoteAddress);
		return "";
	}
	
	//Check if filetype is allowed
	if (!allowedMimeTypes.includes(file.mimetype)) {
		logger.warn(`RES -> 400 Bad request - filetype not allowed: `, DetectedFileType.mime,  "|", req.socket.remoteAddress);
		return "";
	}

	return DetectedFileType.mime;

}

export {convertFile, requestQueue, ParseMediaType, ParseFileType };

 async function setMediaDimensions(file:string, options:ProcessingFileData):Promise<string> {

	const response:string = await new Promise ((resolve) => {
		ffmpeg.ffprobe(file, (err, metadata) => {
		if (err) {
			logger.error("Could not get media dimensions of file: " + options.outputname + " using default min width (640px)");
			resolve("640" + "x?") //Default min width
			return;
		} else {
		
			let mediaWidth = metadata.streams[0].width;
			let mediaHeight = metadata.streams[0].height;
			let newWidth = options.width;
			let newHeight = options.height;

			if (!mediaWidth || !mediaHeight) {
				logger.warn("Could not get media dimensions of file: " + options.outputname + " using default min width (640px)");
				resolve("640" + "x?") //Default min width
				return;
			}

			if (mediaWidth > newWidth || mediaHeight > newHeight) {
				if (mediaWidth > mediaHeight) {
				  newHeight = (mediaHeight / mediaWidth) * newWidth;
				} else {
				  newWidth = (mediaWidth / mediaHeight) * newHeight;
				}
			  }else{
				newWidth = mediaWidth;
				newHeight = mediaHeight;
			  }

			logger.info("Origin dimensions:", +mediaWidth + "px", +mediaHeight + "px",);
			logger.info("Output dimensions:", +newWidth + "px", +newHeight + "px",);		

			resolve(newWidth + "x?")
		}})

		});

		return response;
}