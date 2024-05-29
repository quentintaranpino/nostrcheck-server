import fs from "fs";
import { logger } from "../logger.js";

const createFolderLocal = async (mediaPath: string) : Promise<boolean> => {
    try {
        if (!fs.existsSync(mediaPath)) {
            fs.mkdirSync(mediaPath);
        }
    } catch {
        logger.error("Error creating folder", "|", mediaPath);
          return false;
    }
    return true;
}

const copyFileBufferLocal = async (filePath: string, file: Buffer) : Promise<boolean> => {
    try {
        await fs.promises.writeFile(filePath, file);
    } catch {
        logger.error("Error copying file to pubkey folder", "|", filePath);
        return false;
    }
    return true;
}

const copyFileLocal = async (originPath: string, destPath: string) : Promise<boolean> => {
    try {
        fs.copyFileSync(originPath, destPath);
    } catch (err){
        logger.error("Error copying file to pubkey folder", "|", originPath, "|", destPath);
        logger.error(err)
        return false;
    }
    return true;
}

const deleteLocalFile = async (path:string) :Promise<boolean> => {
	
	try{
		fs.unlinkSync(path);
        logger.debug(`Successfully deleted file from local storage server: ${path}`);
		return true;
	}catch(err){
		logger.error(err);
		return false;
	}

}

const getLocalFile = async (filePath: string) : Promise<boolean> => {
    try {
        return fs.existsSync(filePath);
    } catch {
        logger.error("Error checking file exist", "|", filePath);
        return false;
    }
}

const writeFileLocal = async (filePath: string, file: Buffer) : Promise<boolean> => {
    try {
        if(!file || file.length == 0) {
            logger.error("Error writing file", "|", filePath);
            return false;
        }
        await fs.promises.writeFile(filePath, file);
    } catch {
        logger.error("Error writing file", "|", filePath);
        return false;
    }
    return true;
}


export { createFolderLocal, copyFileBufferLocal, copyFileLocal, deleteLocalFile, getLocalFile, writeFileLocal };