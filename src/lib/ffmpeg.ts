import ffmpeg from "fluent-ffmpeg"
import { Readable } from "stream"
import { ResultMessage } from "../types"
import { logger } from "../lib/logger";

function convertFile(imagePath: Readable, outputName: string): ResultMessage {

    let totalTime: number

    ffmpeg().input(imagePath).saveToFile(outputName)
        .on("end", () => {
            if(totalTime === undefined || Number.isNaN(totalTime)) {totalTime = 0}
            logger.info("File converted successfully: " + outputName + " " + totalTime + " seconds")
            return {
                result: true,
                description: "Image converted",
            }
        })
        .on("error", () => {
            logger.error(
                `Error converting file`,
            );
            const result: ResultMessage = {
                result: false,
                description: `Error converting file`,
            };
            return result;
            
        })
        .on('codecData', data => {
            totalTime = parseInt(data.duration.replace(/:/g, '')) 
         })
         .on('progress', progress => {
            const time = parseInt(progress.timemark.replace(/:/g, ''))
            let percent : number = (time / totalTime) * 100
            if (percent < 0) {percent = 0}
            logger.info("Processing : " + outputName + " - " + Number(percent).toFixed(2) + " %")
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

export { bufferToStream, convertFile }