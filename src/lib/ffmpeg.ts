import ffmpeg from "fluent-ffmpeg"
import { Readable } from "stream"
import { ResultMessage } from "../types"
import { logger } from "../lib/logger";
import fs from "fs";
import os from "os";
import { ConvertFilesOpions } from "../types";

function convertFile(inputFile: any, outputName: string, options : ConvertFilesOpions): ResultMessage {

    //We write the file on filesystem because ffmpeg doesn't support streams
    fs.writeFile("./tmp/" + options.id, inputFile.buffer, function(err) {
        if(err) {
            return logger.error(err);
        }
    }); 

    let totalTime: number
    ffmpeg()    
        .addOption(['-movflags faststart'])
        .input("./tmp/" + options.id)
        .inputFormat(options.originalmime.toString().substring(options.originalmime.indexOf("/") +1, options.originalmime.length))
        .size(options.width + "x" + options.height)
        .saveToFile(outputName)
        .toFormat(options.outputmime)
        .on("end", () => {
            if(totalTime === undefined || Number.isNaN(totalTime)) {totalTime = 0}
            logger.info("File converted successfully: " + outputName + " " + totalTime + " seconds")
            fs.unlink("./tmp/" + options.id, (err) => {
                if (err) {
                  return logger.error(err)
                }
              })
        })
        .on("error", (err) => {
            logger.error(
                `Error converting file`, err
            );
        })
        .on('codecData', (data) => {
            totalTime = parseInt(data.duration.replace(/:/g, '')) 
         })
         .on('progress', (progress) => {
            const time = parseInt(progress.timemark.replace(/:/g, ''))
            let percent : number = (time / totalTime) * 100
            if (percent < 0) {percent = 0}
            logger.info("Processing : " + "..." + outputName.substring(38,outputName.length) + " - " + Number(percent).toFixed(2) + " %")
          })

        return {
            result: true,
            description: "File queued for conversion",
        }
  }

function bufferToStream(buffer: Buffer): Readable {
    const readable = new Readable()
    readable._read = () => {}
    readable.push(buffer)
    readable.push(null)
    return readable
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

export { bufferToStream, convertFile, cleanTempDir }