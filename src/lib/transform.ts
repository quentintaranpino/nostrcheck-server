import fastq, { queueAsPromised } from "fastq";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";

import { asyncTask, ConvertFilesOpions } from "../types.js";
import { logger } from "./logger.js";
import { connect } from "./database.js";
import config from "config";

const requestQueue: queueAsPromised<any> = fastq.promise(PrepareFile, 1); //number of workers for the queue

async function PrepareFile(t: asyncTask): Promise<void> {

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
	
		const MediaPath = config.get("media.mediaPath") + options.username + "/" + options.outputname + "." + options.outputmime;
		logger.info("Using media path:", MediaPath);

		let MediaDuration: number = 0;
		let ConversionDuration : number = 0;
		ffmpeg(TempPath)
			.outputOption(["-loop 0"])
			.setSize((await NewDimensions).toString())
			.output(MediaPath)
			.toFormat(options.outputmime)
			.on("end", async(end) => {
				
			    fs.unlink(TempPath, (err) => {
				if (err) {
					logger.error(err);

					reject(err);

					return;
				}
				});

				logger.info(`File converted successfully: ${MediaPath} ${ConversionDuration /2} seconds`);
				const completed =  dbFileStatusUpdate("completed", options);
				if (!completed) {
					logger.error("Could not update table mediafiles, id: " + options.id, "status: completed");
				}
				resolve(end);
			})
			.on("error", (err) => {

				logger.warn(`Error converting file, retrying file conversion: ${options.outputname} retry: ${retry}/5`);
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
				//Set status completed on the database
				const processing =  dbFileStatusUpdate("processing", options);
				if (!processing) {
					logger.error("Could not update table mediafiles, id: " + options.id, "status: processing");
				}

				const time = parseInt(data.timemark.replace(/:/g, ""));
				let percent: number = (time / MediaDuration) * 100;
				ConversionDuration = ConversionDuration + 1;
				if (percent < 0) {
					percent = 0;
				}
				logger.info(
					`Processing : ` +
						`${options.outputname} - ${Number(percent).toFixed(2)} %`
				);
			})
			.run();
			
	
	});
	
}


export {convertFile, requestQueue };

 async function setMediaDimensions(file:string, options:ConvertFilesOpions):Promise<string> {

	const response:string = await new Promise ((resolve, reject) => {
		ffmpeg.ffprobe(file, (err, metadata) => {
		if (err) {
			logger.error(err);
			reject(err);
		} else {
		
			let mediaWidth = metadata.streams[0].width;
			let mediaHeight = metadata.streams[0].height;
			let newWidth = options.width;
			let newHeight = options.height;

			if (!mediaWidth || !mediaHeight) {
				logger.error("Could not get media dimensions");

			reject("error");
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
		logger.error("RES -> Error updating mediafiles table, id:", options.id, "status:", status);
		conn.end();
		return false;
	}

	conn.end();
	return true

}

