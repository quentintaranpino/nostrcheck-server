import { get } from "config";
import app from "../../app.js";
import { ProcessingFileData } from "../../interfaces/media.js";
import { logger } from "../logger.js";
import { copyFileLocal, createFolderLocal, fileExistLocal } from "./local.js";
import { getR2File, saveR2File } from "./remote.js";

const saveFile = async (filedata: ProcessingFileData, originPath : string) : Promise<boolean> => {

    logger.debug("Saving file", "|", filedata.filename);
    logger.debug("storage type:", app.get("config.storage")["type"]);

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

        return true;

    }

    if (app.get("config.storage")["type"] === "remote") {
        return saveR2File(originPath, filedata);
    } 

    return false;
}

const fileExist = async (fileName: string) : Promise<boolean> => {

    logger.debug("Checking file exist", "|", fileName);
    logger.debug("storage type", app.get("config.storage")["type"]);

    if (app.get("config.storage")["type"] === "local") {
        return fileExistLocal(fileName);
    }

    if (app.get("config.storage")["type"] === "remote") {
        logger.debug(await getR2File(fileName));

        if (await getR2File(fileName) !== ""){
            return true;
        }
    }

    return false; 
}

export { saveFile, fileExist};