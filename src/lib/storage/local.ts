import fs from "fs";
import { logger } from "../logger.js";
import crypto from "crypto";
import { getConfig } from "../config/core.js";
import sharp from "sharp";
import { createSlots } from "../utils.js";

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

// Thumbnail widths a client may ask for. A closed list, so nobody can fill
// the disk asking for every width between 1 and 4000.
const thumbnailWidths = [200, 400, 800];
const thumbnailJobs = new Map<string, Promise<string>>();
// Every job decodes the whole original: two at a time, a short wait, and the caller
// serves the original when the queue is full.
const thumbnailSlots = createSlots(2);
const THUMBNAIL_MAX_WAITING = 20;
const THUMBNAIL_WAIT_MS = 5000;
// Thumbnails are for photos and memes, not 200 MP scans (~700 MB decoded each)
const THUMBNAIL_MAX_PIXELS = 50_000_000;
// Originals that failed to decode, so they aren't decoded again on every home page view
const thumbnailFailures = new Map<string, number>();
const THUMBNAIL_FAILURE_TTL_MS = 6 * 60 * 60 * 1000;
const THUMBNAIL_FAILURE_MAX = 10000;

const fileExists = async (filePath: string): Promise<boolean> =>
    fs.promises.access(filePath).then(() => true, () => false);

/**
 * Get the path of a webp thumbnail for an image, generating it next to the
 * original the first time. Square and centred, the same crop the grid tiles
 * show with object-fit: cover. Animated files keep only their first frame.
 * @param filePath The path of the original file
 * @param width The thumbnail width, one of thumbnailWidths
 * @returns The thumbnail path, or "" if there is none (undecodable, too big or busy)
 */
const getLocalThumbnail = async (filePath: string, width: number) : Promise<string> => {

    const thumbPath = `${filePath}.t${width}.webp`;
    if (await fileExists(thumbPath)) return thumbPath;

    const failedAt = thumbnailFailures.get(filePath);
    if (failedAt !== undefined) {
        if (Date.now() - failedAt < THUMBNAIL_FAILURE_TTL_MS) return "";
        thumbnailFailures.delete(filePath);
    }

    // Same thumbnail asked twice at once: the second one waits for the first
    const running = thumbnailJobs.get(thumbPath);
    if (running) return running;

    if (thumbnailSlots.waiting() >= THUMBNAIL_MAX_WAITING) return "";

    const job = (async () => {
        if (!await thumbnailSlots.acquire(THUMBNAIL_WAIT_MS)) return "";
        const tmpPath = `${thumbPath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
        try {
            const maxPixels = Math.min(Number(getConfig(null, ["media", "maxInputPixels"])) || THUMBNAIL_MAX_PIXELS, THUMBNAIL_MAX_PIXELS);
            const image = sharp(filePath, { pages: 1, limitInputPixels: maxPixels });
            const { width: w = width, height: h = width } = await image.metadata();
            // Never upscale: a 100px image or a 4000x300 panorama crops at its short side
            const side = Math.min(width, w, h);
            await image
                .rotate()
                .resize({ width: side, height: side, fit: "cover" })
                .webp({ quality: 75 })
                .toFile(tmpPath);
            await fs.promises.rename(tmpPath, thumbPath);
            // The original may have been deleted (or banned) while this ran
            if (!await fileExists(filePath)) {
                await fs.promises.unlink(thumbPath).catch(() => {});
                return "";
            }
            return thumbPath;
        } catch (err) {
            logger.warn(`getLocalThumbnail - Unable to generate thumbnail for ${filePath}: ${err}`);
            await fs.promises.unlink(tmpPath).catch(() => {});
            if (thumbnailFailures.size >= THUMBNAIL_FAILURE_MAX) thumbnailFailures.clear();
            thumbnailFailures.set(filePath, Date.now());
            return "";
        } finally {
            thumbnailSlots.release();
        }
    })().finally(() => thumbnailJobs.delete(thumbPath));

    thumbnailJobs.set(thumbPath, job);
    return job;
}

/**
 * Delete every thumbnail of a file. A missing thumbnail is not an error.
 * Waits for any thumbnail of it still being generated, so none is left behind.
 * @param filePath The path of the original file
 */
const deleteLocalThumbnails = async (filePath: string) : Promise<void> => {
    await Promise.all(thumbnailWidths.map(width => thumbnailJobs.get(`${filePath}.t${width}.webp`)?.catch(() => "")));
    thumbnailFailures.delete(filePath);
    for (const width of thumbnailWidths) {
        try {
            await fs.promises.unlink(`${filePath}.t${width}.webp`);
        } catch (err: any) {
            if (err.code != "ENOENT") logger.error(`deleteLocalThumbnails - Error deleting thumbnail: ${filePath}.t${width}.webp with error: ${err}`);
        }
    }
}

export { 
    createLocalFolder, 
    getLocalFolder,
    copyLocalFileBuffer, 
    copyLocalFile, 
    deleteLocalFile, 
    getLocalFile, 
    writeLocalFile,
    saveTmpFile,
    thumbnailWidths,
    getLocalThumbnail,
    deleteLocalThumbnails
};