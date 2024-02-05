import { logger } from './logger.js'
import crypto from 'crypto'
import fs from 'fs'
import { ProcessingFileData } from '../interfaces/media.js'
import sharp from 'sharp'
import { encode } from 'blurhash'

const generatefileHashfromfile = (filepath:string, options: ProcessingFileData): string => {

  logger.debug("INIT hash generation for file:", filepath);

  let hash = '';
  try{
    hash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(filepath))
        .digest("hex");
    }
  catch (error) {
    logger.error("Error getting file hash", error);
    return "";
  }
  logger.debug("END hash generation for file:", filepath, ":", hash);
  logger.info("Hash for file:", options.filename, ":", hash);

  return hash;

}

const generatefileHashfrombuffer = (file:Express.Multer.File): string => {

  logger.debug("INIT hash generation from buffer", file.originalname);

  let hash = '';
  try{
    hash = crypto
        .createHash("sha256")
        .update(file.buffer)
        .digest("hex");
    }
  catch (error) {
    logger.error("Error getting file hash", error);
    return "";
  }
  logger.debug("END hash generation from buffer,", file.originalname, "=>", hash);

  return hash;

}

const generateBlurhash = async (path:string): Promise<string> =>
  new Promise((resolve) => {
    logger.debug("INIT blurhash generation for file:", path);
    sharp.cache(false);
    sharp(path)
      .raw()
      .ensureAlpha()
      .resize(32, 32, { fit: "inside" })
      .toBuffer((err, buffer, { width, height }) => {
        if (err) return "";
        logger.debug("END blurhash generation for file:", path, "blurhash:", encode(new Uint8ClampedArray(buffer), width, height, 4, 4));
        resolve(encode(new Uint8ClampedArray(buffer), width, height, 4, 4));
      });
  });

export { generateBlurhash, generatefileHashfromfile, generatefileHashfrombuffer};