import fs from "fs";
import { logger } from "../logger.js";
import crypto from "crypto";
import { getConfig } from "../config/core.js";

const createLocalFolder = async (path: string) : Promise<boolean> => {
    try {
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    } catch {
        logger.error("Error creating folder", "|", path);
          return false;
    }
    return true;
}

const getLocalFolder = (path: string) : string => {
    if (!fs.existsSync(path)) {
        logger.error(`getLocalFolder - Folder does not exist: ${path}`);
        return "";
    }
    return path;
}

const copyLocalFileBuffer = async (filePath: string, file: Buffer) : Promise<boolean> => {
    try {
        await fs.promises.writeFile(filePath, file);
    } catch {
        logger.error(`copyLocalFileBuffer - Error copying file to pubkey folder: ${filePath}`);
        return false;
    }
    return true;
}

const copyLocalFile = async (originPath: string, destPath: string) : Promise<boolean> => {
    try {
        fs.copyFileSync(originPath, destPath);
    } catch (err){
        logger.error(`copyLocalFile - Error copying file to pubkey folder: ${originPath} -> ${destPath} with error: ${err}`);
        return false;
    }
    return true;
}

const deleteLocalFile = async (path:string) :Promise<boolean> => {
	
	try{
		fs.unlinkSync(path);
		return true;
	}catch(err){
        logger.error(`deleteLocalFile - Error deleting file: ${path} with error: ${err}`);
		return false;
	}

}

const getLocalFile = async (filePath: string) : Promise<boolean> => {
    try {
        return fs.existsSync(filePath);
    } catch {
        logger.error(`getLocalFile - Error checking file exist: ${filePath}`);
        return false;
    }
}

const writeLocalFile = async (filePath: string, file: Buffer) : Promise<boolean> => {
    try {
        if(!file || file.length == 0) {
            logger.error(`writeLocalFile - Empty file buffer: ${filePath}`);
            return false;
        }
        await fs.promises.writeFile(filePath, file);
    } catch {
        logger.error(`writeLocalFile - Error writing file: ${filePath}`);
        return false;
    }
    return true;
}


const saveTmpFile = async (filename : string, buffer: Express.Multer.File["buffer"]): Promise<string> => {

    if (filename == "" || buffer.length == 0) {
        return "";
    }

    const tmpPath = getConfig(null, ["storage", "local", "tempPath"]) + "in" + crypto.randomBytes(20).toString('hex') + filename;

    if (!await writeLocalFile(tmpPath, buffer)) {
        logger.error(`saveTmpFile - Error writing temp file to disk: ${tmpPath}`);
        return "";
    }
    return tmpPath;

}

export { 
    createLocalFolder, 
    getLocalFolder,
    copyLocalFileBuffer, 
    copyLocalFile, 
    deleteLocalFile, 
    getLocalFile, 
    writeLocalFile,
    saveTmpFile 
};