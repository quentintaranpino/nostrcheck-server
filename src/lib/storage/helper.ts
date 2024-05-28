import app from "../../app.js";
import { mediafilesTableFields } from "../../interfaces/database.js";
import { ProcessingFileData } from "../../interfaces/media.js";
import { dbSelect, dbUpdate } from "../database.js";
import { getHashedPath } from "../hash.js";
import { logger } from "../logger.js";
import { copyFileLocal, createFolderLocal, getLocalFile, deleteLocalFile } from "./local.js";
import { deleteRemoteFile, getRemoteFile, saveRemoteFile } from "./remote.js";

const saveFile = async (filedata: ProcessingFileData, originPath : string) : Promise<boolean> => {

    logger.debug("Saving file", "|", filedata.filename);
    logger.debug("storage type:", app.get("config.storage")["type"]);

    if (app.get("config.storage")["type"] === "local") {

        const hashpath = await getHashedPath(filedata.filename);

        const mediaPath = app.get("config.storage")["local"]["mediaPath"] + hashpath
        const filePath = mediaPath + "/" + filedata.filename;

        if(!await createFolderLocal(mediaPath)){
            logger.error("Error creating folder", "|", mediaPath);
            return false;   
	    }

        if (!await getLocalFile(filePath)) {

            if (!await copyFileLocal(originPath, filePath)){
                logger.error("Error copying file to disk", "|", filePath);
                return false;
            }
        }

        // save local path to database
		const updateLocalPath = await dbUpdate('mediafiles','localpath',hashpath, 'filename', filedata.filename);
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

const getFilePath = async (fileName: string) : Promise<string> => {

    logger.debug("Checking file exist", "|", fileName);
    logger.debug("storage type", app.get("config.storage")["type"]);

    if (app.get("config.storage")["type"] === "local") {

        const mediaPath = app.get("config.storage")["local"]["mediaPath"];
        const localPath = await dbSelect("SELECT localPath FROM mediafiles WHERE filename = ?", "localPath", [fileName], mediafilesTableFields);

        // return await getLocalFile(mediaPath + localPath +  "/" + fileName);

        if (await getLocalFile(mediaPath + localPath +  "/" + fileName)){
            return mediaPath + localPath +  "/" + fileName;
        }

    }

    if (app.get("config.storage")["type"] === "remote") {
        logger.debug(await getRemoteFile(fileName));

        return await getRemoteFile(fileName);
    }

    return ""; 
}

const deleteFile = async (fileName: string, forceLocal : boolean = false) : Promise<boolean> => {
    
        logger.debug("Deleting file", "|", fileName);
        logger.debug("storage type", app.get("config.storage")["type"]);
    
        if (app.get("config.storage")["type"] === "local" || forceLocal) {
    
            const mediaPath = app.get("config.storage")["local"]["mediaPath"];
            const localPath = await dbSelect("SELECT localPath FROM mediafiles WHERE filename = ?", "localPath", [fileName], mediafilesTableFields);
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