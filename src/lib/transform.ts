import fastq, { queueAsPromised } from "fastq";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";

import { asyncTask, ConvertFilesOpions } from "../types";
import { logger } from "./logger";
import { FileOptions } from "buffer";
import { connect } from "./database";

const requestQueue: queueAsPromised<any> = fastq.promise(PrepareFile, 1); //number of workers for the queue

async function PrepareFile(t: asyncTask): Promise<void> {

	logger.info(`${requestQueue.length()} items in queue`);

	if (!t.req.file) {
		logger.error("Prepare File", "->", "Empty file");

		return;
	}

	if (!t.req.file.mimetype) {
		logger.error("Prepare File", "->", "Empty mimetype");

		return;
	}

	if (!t.req.body.uploadtype) {
		logger.error("Prepare File", "->", "Empty type");

		return;
	}

	if (!t.req.body.username) {
		logger.error("Prepare File", "->", "Empty username");

		return;
	}

	logger.info(
		"Processing file",
		":",
		t.req.file.originalname,
		"=>",
		`${t.fileoptions.outputname}.${t.fileoptions.outputmime}`
	);

	await convertFile(t.req.file, `./${t.fileoptions.outputname}.${t.fileoptions.outputmime}`, t.fileoptions);
}

async function convertFile(
	inputFile: any,
	outputName: string,
	options: ConvertFilesOpions
): Promise<any> {

	let NewDimensions = setMediaDimensions(`./tmp/${options.outputname}`, options);
	return new Promise(async(resolve, reject) => {
		//We write the file on filesystem because ffmpeg doesn't support streams
		fs.writeFile(`./tmp/${options.outputname}`, inputFile.buffer, function (err) {
			if (err) {
				logger.error(err);

				reject(err);

				return;
			}
		});

		let totalTime: number;
		ffmpeg()
			.addInput(`./tmp/${options.outputname}`)
			//.videoFilter('crop=in_w:in_h-20')
			.setSize((await NewDimensions).toString())
			.saveToFile(outputName)
			.toFormat(options.outputmime)
			.on("end", (end) => {
				if (totalTime === undefined || Number.isNaN(totalTime)) {
					totalTime = 0;
				}
				logger.info(`File converted successfully: ${outputName} ${totalTime} seconds`);
				fs.unlink(`./tmp/${options.outputname}`, (err) => {
					if (err) {
						logger.error(err);

						reject(err);

						return;
					}
				});

				//Set status completed on the database
				const completed =  dbFileUpdate("completed", options);
				if (!completed) {
					logger.error("Could not update table userfiles, id: " + options.id, "status: completed");
				}
				resolve(end);
			})
			.on("error", (err) => {
				logger.error(`Error converting file`, err);
				const errorstate =  dbFileUpdate("failed", options);
				if (!errorstate) {
					logger.error("Could not update table userfiles, id: " + options.id, "status: failed");
				}
				reject(err);
			})
			// .on("codecData", (data) => {
			// 	totalTime = parseInt(data.duration.replace(/:/g, ""));
			// })
			.on("progress", () => {
				//Set status completed on the database
				const processing =  dbFileUpdate("processing", options);
				if (!processing) {
					logger.error("Could not update table userfiles, id: " + options.id, "status: processing");
				}
			})
			// 	const time = parseInt(p.timemark.replace(/:/g, ""));
			// 	let percent: number = (time / totalTime) * 100;
			// 	if (percent < 0) {
			// 		percent = 0;
			// 	}
			// 	logger.info(
			// 		`Processing : ` +
			// 			`...${outputName.substring(38, outputName.length)} - ${Number(percent).toFixed(2)} %`
			// 	);
			// })
	});
}

function cleanTempDir() {
	let tempdir = "./tmp/";
	logger.info("Cleaning temp dir");
	if (!fs.existsSync(tempdir)){
		fs.mkdirSync(tempdir);
	}
	fs.readdir(tempdir, (err, files) => {
		if (err) {
			logger.error(err);
		}

		for (const file of files) {
			fs.unlink(tempdir + file, (err) => {
				if (err) {
					throw err;
				}
			});
		}
	});
}

export { cleanTempDir, convertFile, requestQueue };

 async function setMediaDimensions(file:string, options:ConvertFilesOpions):Promise<string> {

	const response:string = await new Promise ((resolve, reject) => {
		ffmpeg.ffprobe(file, (err, metadata) => {
		if (err) {
			console.error(err);
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

			

			logger.info("Original dimensions:", mediaWidth, mediaHeight);
			logger.info("New dimensions:", newWidth, newHeight);		

			resolve(newWidth + "x?")
		}})

		});

		return response;
}

async function dbFileUpdate(status: string, options: ConvertFilesOpions): Promise<boolean> {

	const conn = await connect();
	const [dbFileStatusUpdate] = await conn.execute(
		"UPDATE userfiles set status = ? where id = ?",
		[status, options.id]
	);
	if (!dbFileStatusUpdate) {
		logger.error("RES -> Error updating userfiles table, id:", options.id, "status:", status);
		conn.end();
		return false;
	}

	conn.end();
	return true

}

