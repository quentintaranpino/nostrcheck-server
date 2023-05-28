import fastq, { queueAsPromised } from "fastq";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";

import { asyncTask, ConvertFilesOpions } from "../types";
import { logger } from "./logger";
import { connect } from "./database";
const requestQueue: queueAsPromised<any> = fastq.promise(PrepareFile, 1); //number of workers for the queue

async function PrepareFile(t: asyncTask): Promise<void> {

	logger.info(`${requestQueue.length()} items in queue`);

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

	if (!t.req.body.username) {
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

			.input(`./tmp/${options.outputname}`)
			//.videoFilter('crop=in_w:in_h-20')
			.setSize((await NewDimensions).toString())
			.saveToFile(`./media/${options.username}/${options.outputname}.${options.outputmime}`)
			.toFormat(options.outputmime)
			//.loop()

			.on("end", (end) => {
				
				// if (totalTime === undefined || Number.isNaN(totalTime)) {
				// 	totalTime = 0;
				// }
				fs.unlink(`./tmp/${options.outputname}`, (err) => {
				if (err) {
					logger.error(err);

					reject(err);

					return;
				}
				});

				logger.info(`File converted successfully: ${options.outputname} ${totalTime} seconds`);
				const completed =  dbFileUpdate("completed", options);
				if (!completed) {
					logger.error("Could not update table userfiles, id: " + options.id, "status: completed");
				}
				resolve(end);
			})
			.on("error", (err) => {

				logger.warn(`Error converting file, retrying file conversion: ${options.outputname} retry: ${retry}/5`);
				retry++
				fs.unlink(`./tmp/${options.outputname}`, (err) => {
					if (err) {
						logger.error(err);
	
						reject(err);
	
						return;
					}
				});

				if (retry > 5){
					logger.error(`Error converting file after 5 retries: ${inputFile.originalname}`);
					const errorstate =  dbFileUpdate("failed", options);
					if (!errorstate) {
						logger.error("Could not update table userfiles, id: " + options.id, "status: failed");
					}
					resolve(err);
				}
				convertFile(inputFile, options, retry);
				resolve(err);

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

function PrepareMediaFolders() {
	let tempdir = "./tmp/";
	logger.info("Cleaning temp dir");
	//If not exist create temp folder
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

	//If not exist create media folder
	const userfolder = `./media/`;
	if (!fs.existsSync(userfolder)){
		fs.mkdirSync(userfolder);
	}

}

export { PrepareMediaFolders, convertFile, requestQueue };

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

