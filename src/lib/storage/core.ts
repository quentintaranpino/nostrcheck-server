import app from "../../app.js";
import { fileData } from "../../interfaces/media.js";
import { dbMultiSelect, dbSelect, dbUpdate } from "../database.js";
import { getHashedPath } from "../hash.js";
import { logger } from "../logger.js";
import { copyLocalFile, createLocalFolder, getLocalFile, deleteLocalFile } from "./local.js";
import { deleteRemoteFile, getRemoteFile, saveRemoteFile } from "./remote.js";

/**
 * Save file to storage (local or remote)
 * @param filedata File data
 * @param originPath Origin path
 * @returns Promise<boolean>
 */
const saveFile = async (filedata: fileData, originPath : string) : Promise<boolean> => {

    logger.debug("Saving file", "|", filedata.filename);
    logger.debug("storage type:", app.get("config.storage")["type"]);

    if (app.get("config.storage")["type"] === "local") {

        const hashpath = await getHashedPath(filedata.filename);

        const mediaPath = app.get("config.storage")["local"]["mediaPath"] + hashpath
        const filePath = mediaPath + "/" + filedata.filename;

        if(!await createLocalFolder(mediaPath)){
            logger.error("Error creating folder", "|", mediaPath);
            return false;   
	    }

        if (!await getLocalFile(filePath)) {

            if (!await copyLocalFile(originPath, filePath)){
                logger.error("Error copying file to disk", "|", filePath);
                return false;
            }
        }

        // save local path to database
		const updateLocalPath = await dbUpdate('mediafiles',{'localpath':hashpath}, ['filename'], [filedata.filename]);
        if (!updateLocalPath) {
            return false;
        }

        return true;

    }

    if (app.get("config.storage")["type"] === "remote") {
        return saveRemoteFile(originPath, filedata);
    } 

    return false;
}

/**
 * Get file path
 * @param fileName or hash
 * @returns Promise<string>
 */
const getFilePath = async (value: string) : Promise<string> => {

    logger.debug("Checking file exist", "|", value);
    logger.debug("storage type", app.get("config.storage")["type"]);

    const result  = await dbMultiSelect(["localpath", "filename"],
        "mediafiles",
        "filename = ? or original_hash = ? and localpath is not null",
        [value, value]);

    if (result.length === 0) {return "";}

    const {localpath, filename} = result[0];

    if (app.get("config.storage")["type"] === "local") {

        const mediaPath = app.get("config.storage")["local"]["mediaPath"];

        if (await getLocalFile(mediaPath + localpath +  "/" + filename)){
            return mediaPath + localpath +  "/" + filename;
        }

    }

    if (app.get("config.storage")["type"] === "remote") {
        return await getRemoteFile(filename);
    }

    return ""; 
}

/**
 * Delete file
 * @param fileName File name
 * @param forceLocal Force local
 * @returns Promise<boolean>
 */
const deleteFile = async (fileName: string, forceLocal : boolean = false) : Promise<boolean> => {
    
        logger.debug("Deleting file", "|", fileName);
        logger.debug("storage type", app.get("config.storage")["type"]);
    
        if (app.get("config.storage")["type"] === "local" || forceLocal) {
    
            const mediaPath = app.get("config.storage")["local"]["mediaPath"];
            const localPath = await dbSelect("SELECT localPath FROM mediafiles WHERE filename = ?", "localPath", [fileName]);
            const filePath = mediaPath + localPath +  "/" + fileName;
    
            if (await getLocalFile(filePath)){
                return await deleteLocalFile(filePath);
            }
    
        }
    
        if (app.get("config.storage")["type"] === "remote") {
            return deleteRemoteFile(fileName);
        }
    
        return false;
    }

export { saveFile, getFilePath, deleteFile};