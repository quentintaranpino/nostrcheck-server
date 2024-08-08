import fs from "fs";
import { logger } from "../logger.js";
import crypto from "crypto";
import app from "../../app.js";


const createLocalFolder = async (mediaPath: string) : Promise<boolean> => {
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

const copyLocalFileBuffer = async (filePath: string, file: Buffer) : Promise<boolean> => {
    try {
        await fs.promises.writeFile(filePath, file);
    } catch {
        logger.error("Error copying file to pubkey folder", "|", filePath);
        return false;
    }
    return true;
}

const copyLocalFile = async (originPath: string, destPath: string) : Promise<boolean> => {
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

const writeLocalFile = async (filePath: string, file: Buffer) : Promise<boolean> => {
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


const saveTmpFile = async (filename : string, buffer: Express.Multer.File["buffer"]): Promise<string> => {

    if (filename == "" || buffer.length == 0) {
        return "";
    }

    const tmpPath = app.get("config.storage")["local"]["tempPath"] + "in" + crypto.randomBytes(20).toString('hex') + filename;

    if (!await writeLocalFile(tmpPath, buffer)) {
        logger.error("Could not write temp file to disk", "|", tmpPath);
        return "";
    }
    return tmpPath;

}

export { createLocalFolder, 
         copyLocalFileBuffer, 
         copyLocalFile, 
         deleteLocalFile, 
         getLocalFile, 
         writeLocalFile,
         saveTmpFile 
        };