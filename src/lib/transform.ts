import ffmpeg from "fluent-ffmpeg"
import { logger } from "./logger";
import fs from "fs";

import { ConvertFilesOpions, asyncTask } from "../types";
import fastq, { queueAsPromised } from "fastq";

const requestQueue: queueAsPromised<any> = fastq.promise(PrepareFile, 2);

async function PrepareFile(t: asyncTask): Promise<void> {

	logger.info(requestQueue.length() + " items in queue");

	if (!t.req.file) {
		logger.error("PrepareFile", "->", "Empty file");
		return;
	}

	if (!t.req.file.mimetype) {
		logger.error("PrepareFile", "->", "Empty mimetype");
		return;
	}

	if (!t.req.body.type) {
		logger.error("PrepareFile", "->", "Empty type");
		return;
	}

	logger.info("PrepareFile", ":", t.req.file.originalname, "=>",  "..." + t.fileoptions.id.substring(38,t.fileoptions.id.length) + "." + t.fileoptions.outputmime);

	await convertFile(t.req.file, "./" + t.fileoptions.id + "." + t.fileoptions.outputmime, t.fileoptions)

};


 function convertFile(inputFile: any, outputName: string, options : ConvertFilesOpions):Promise<any>{

    return new Promise((resolve,reject)=>{

    //We write the file on filesystem because ffmpeg doesn't support streams
    fs.writeFile("./tmp/" + options.id, inputFile.buffer, function(err) {
        if(err) {
            logger.error(err);
            return reject(err);
        }
    }); 

    let totalTime: number
     ffmpeg()    
        .addInput("./tmp/" + options.id)
       // .inputFormat(options.originalmime.toString().substring(options.originalmime.indexOf("/") +1, options.originalmime.length))
        .size(options.width + "x" + options.height)
        .videoCodec('libx264')
        .saveToFile(outputName)
        .toFormat(options.outputmime)
        .on("end", () => {
            if(totalTime === undefined || Number.isNaN(totalTime)) {totalTime = 0}
            logger.info("File converted successfully: " + outputName + " " + totalTime + " seconds")
            fs.unlink("./tmp/" + options.id, (err) => {
                if (err) {
                    logger.error(err);
                    return reject(err);
                }
              })
            return resolve(true);
        })
        .on("error", (err) => {
            logger.error(
                `Error converting file`, err
            );
            return reject(err)
        })
        .on('codecData', (data) => {
            totalTime = parseInt(data.duration.replace(/:/g, '')) 
         })
         .on('progress', (p) => {
            let time = parseInt(p.timemark.replace(/:/g, ''))
            let percent : number = (time / totalTime) * 100
            if (percent < 0) {percent = 0}
            logger.info("Processing : " + "..." + outputName.substring(38,outputName.length) + " - " + Number(percent).toFixed(2) + " %")
          })
          .on('end',(end)=>{
            return resolve(end)
        })

    })
  }

function cleanTempDir(){
    logger.info("Cleaning temp dir");
    fs.readdir("./tmp", (err, files) => {
        if (err) {
            logger.error(err);
        }
      
        for (const file of files) {
          fs.unlink("./tmp/" +  file, err => {
            if (err) throw err;
          });
        }
      });
}

export { convertFile, cleanTempDir, requestQueue }