import app from "../../app.js";
import { ProcessingFileData } from "../../interfaces/media.js";
import { logger } from "../logger.js";
import { copyFileLocal, createFolderLocal, fileExistLocal } from "./local.js";
import { saveFileS3 } from "./remote.js";

const saveFile = async (filedata: ProcessingFileData, originPath : string) : Promise<boolean> => {

    logger.debug("Saving file", "|", filedata);
    logger.debug("storage type", app.get("config.storage")["type"]);

    if (app.get("config.storage")["type"] === "local") {

        const mediaPath = app.get("config.storage")["local"]["mediaPath"] + filedata.pubkey
        const filePath = mediaPath + "/" + filedata.filename;

        if(!await createFolderLocal(mediaPath)){
            logger.error("Error creating folder", "|", mediaPath);
            return false;   
	    }

        if (!await fileExistLocal(filePath)) {

            if (!await copyFileLocal(originPath, filePath)){
                logger.error("Error copying file to disk", "|", filePath);
                return false;
            }
        }

    }

    if (app.get("config.storage")["type"] === "remote") {
        saveFileS3(originPath, filedata);
    } 
    return true;
}

const fileExist = async (fileName: string) : Promise<boolean> => {

    logger.debug("Checking file exist", "|", fileName);
    logger.debug("storage type", app.get("config.storage")["type"]);


    // try {
    //     return fs.existsSync(filePath);
    // } catch {
    //     logger.error("Error checking file exist", "|", filePath);
    //     return false;
    // }

    return true; //TODO: implement this
}

export { saveFile, fileExist};