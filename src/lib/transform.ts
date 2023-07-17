import fastq, { queueAsPromised } from "fastq";
import ffmpeg, { setFfmpegPath } from "fluent-ffmpeg";
import fs from "fs";
import crypto from "crypto";

import { asyncTask, ConvertFilesOpions } from "../types.js";
import { logger } from "./logger.js";
import { connect } from "./database.js";
import config from "config";
import { PublishTorrent } from "./torrent.js";

const testffmpeg = ffmpeg.getAvailableCodecs(function(err) {
	if (err) {
		logger.error("Could not get ffmpeg executable, is ffmpeg package installed on your system? ");
		process.exit(1);
	}
  });

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

	if (!t.req.body.uploadtype) {
		logger.error("ERR -> Preparing file for conversion, empty type");
		return;
	}

	if (!t.fileoptions.username) {
		logger.error("ERR -> Preparing file for conversion, empty username");
		return;
	}

	logger.info(
		"Processing file",
		":",
		t.req.file.originalname,
		"=>",
		`${t.fileoptions.outputname}.${t.fileoptions.outputmime}`
	);

	await convertFile(t.req.file, t.fileoptions, 0);

}

async function convertFile(
	inputFile: any,
	options: ConvertFilesOpions,
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
			logger.error("Could not update table mediafiles, id: " + options.id, "status: processing");
		}

		const MediaPath = config.get("media.mediaPath") + options.username + "/" + options.outputname + "." + options.outputmime;
		logger.info("Using media path:", MediaPath);

		let MediaDuration: number = 0;
		let ConversionDuration : number = 0;

		let ConversionEngine = ffmpeg(TempPath)
			.outputOption(["-loop 0"]) //Always loop. If is an image it will not apply
			.setSize((await NewDimensions).toString())
			.output(MediaPath)
			.toFormat(options.outputmime)
			
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

				const completed =  dbFileStatusUpdate("completed", options);
				if (!completed) {
					logger.error("Could not update table mediafiles, id: " + options.id, "status: completed");
				}
				const visibility =  dbFileVisibilityUpdate(true, options);
				if (!visibility) {
					logger.error("Could not update table mediafiles, id: " + options.id, "visibility: true");
				}
				const hash =  dbFileHashupdate(MediaPath, options);
				if (!hash) {
					logger.error("Could not update table mediafiles, id: " + options.id, "hash for file: " + MediaPath);
				}
				PublishTorrent(MediaPath); //TORRENT TESTING POC

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
						logger.error("Could not update table mediafiles, id: " + options.id, "status: failed");
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


export {convertFile, requestQueue };

 async function setMediaDimensions(file:string, options:ConvertFilesOpions):Promise<string> {

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

async function dbFileStatusUpdate(status: string, options: ConvertFilesOpions): Promise<boolean> {

	const conn = await connect();
	const [dbFileStatusUpdate] = await conn.execute(
		"UPDATE mediafiles set status = ? where id = ?",
		[status, options.id]
	);
	if (!dbFileStatusUpdate) {
		logger.error("Error updating mediafiles table, id:", options.id, "status:", status);
		conn.end();
		return false;
	}

	conn.end();
	return true

}

async function dbFileVisibilityUpdate(visibility: boolean, options: ConvertFilesOpions): Promise<boolean> {

	const conn = await connect();
	const [dbFileStatusUpdate] = await conn.execute(
		"UPDATE mediafiles set visibility = ? where id = ?",
		[visibility, options.id]
	);
	if (!dbFileStatusUpdate) {
		logger.error("Error updating mediafiles table, id:", options.id, "visibility:", visibility);
		conn.end();
		return false;
	}

	conn.end();
	return true

}

async function dbFileHashupdate(filepath:string, options: ConvertFilesOpions): Promise<boolean>{

	let hash = '';
	try{
		logger.info("Getting file hash for file:", filepath)
		hash = crypto
				.createHash("sha256")
				.update(fs.readFileSync(filepath))
				.digest("hex");
		logger.debug("File hash:", hash);
		}
	catch (error) {
		logger.error("Error getting file hash", error);
		return false;
	}

	const conn = await connect();
	const [dbFileHashUpdate] = await conn.execute(
		"UPDATE mediafiles set hash = ? where id = ?",
		[hash, options.id]
	);
	if (!dbFileHashUpdate) {
		logger.error("Error updating mediafiles table (hash), id:", options.id, "hash:", hash);
		conn.end();
		return false;
	}
	conn.end();
	return true
}

