import { FileData } from "../../interfaces/media.js";
import { getConfig } from "../config/core.js";
import { dbMultiSelect, dbSelect, dbUpdate } from "../database/core.js";
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
const saveFile = async (filedata: FileData, originPath : string) : Promise<boolean> => {
    
    logger.debug(`saveFile - Saving file: ${filedata.filename}, storage type: ${getConfig(null, ["storage", "type"])}`);    

    if (getConfig(null, ["storage", "type"]) === "local") {

        const hashpath = await getHashedPath(filedata.filename);

        const mediaPath = getConfig(null, ["storage", "local", "mediaPath"]) + hashpath;
        const filePath = mediaPath + "/" + filedata.filename;

        if(!await createLocalFolder(mediaPath)){
            logger.error(`saveFile - Error creating folder: ${mediaPath}`);
            return false;   
	    }

        if (!await getLocalFile(filePath)) {

            if (!await copyLocalFile(originPath, filePath)){
                logger.error(`saveFile - Error copying file to disk: ${filePath}`);
                return false;
            }
        }

        // save local path to database
		const updateLocalPath = await dbUpdate('mediafiles',{'localPath':hashpath}, ['filename'], [filedata.filename]);
        if (!updateLocalPath)  return false;

        return true;

    }

    if (getConfig(null, ["storage", "type"]) === "remote") {
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

    logger.debug(`getFilePath - Checking file exist: ${value}, storage type: ${getConfig(null, ["storage", "type"])}`);    

    const result  = await dbMultiSelect(["localPath", "filename"],
        "mediafiles",
        "(filename = ? or original_hash = ?) and localPath is not null",
        [value, value]);

    if (result.length === 0) {return "";}

    const {localPath, filename} = result[0];

    if (getConfig(null, ["storage", "type"]) === "local") {

        const mediaPath = getConfig(null, ["storage", "local", "mediaPath"]);

        if (await getLocalFile(mediaPath + localPath +  "/" + filename)){
            return mediaPath + localPath +  "/" + filename;
        }

    }

    if (getConfig(null, ["storage", "type"]) === "remote") {
    
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
    
    logger.debug(`deleteFile - Deleting file: ${fileName}, storage type: ${getConfig(null, ["storage", "type"])}`);    

    if (getConfig(null, ["storage", "type"]) === "local" || forceLocal) {

        const mediaPath = getConfig(null, ["storage", "local", "mediaPath"]);
        const localPath = await dbSelect("SELECT localPath FROM mediafiles WHERE filename = ?", "localPath", [fileName]);
        const filePath = mediaPath + localPath +  "/" + fileName;

        if (await getLocalFile(filePath)){
            return await deleteLocalFile(filePath);
        }

    }

    if (getConfig(null, ["storage", "type"]) === "remote") {
        return deleteRemoteFile(fileName);
    }

    return false;
}

export { saveFile, getFilePath, deleteFile};