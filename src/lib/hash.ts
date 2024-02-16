import { logger } from './logger.js'
import crypto from 'crypto'
import fs from 'fs'
import { ProcessingFileData } from '../interfaces/media.js'
import sharp from 'sharp'
import { encode } from 'blurhash'
import { credentialTypes } from '../interfaces/authorization.js';
import bcrypt from 'bcrypt';

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

const generatefileHashfrombuffer = async (file:Express.Multer.File): Promise<string> => {

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


/**
 * Hashes a given string using bcrypt with a specified number of salt rounds.
 * @param {string} input - The string to be hashed.
 * @param {number} saltRounds - The number of rounds to use when generating the salt (default is 40).
 * @returns {Promise<string>} A promise that resolves to the hashed string, or an empty string if an error occurs or if the input is undefined.
 */
const hashString = async (input:string, type: credentialTypes, saltRounds:number = 10): Promise<string> => {

  let hashedString; 
  try{
    if (type == "password"){
      hashedString = await bcrypt.hash(input, saltRounds).catch(err => {logger.error(err)});
    }
    else if (type == "authkey"){
      hashedString =  await crypto.createHash('sha256').update(input + saltRounds).digest('hex');
    }
    else{
      logger.error("Invalid credential type");
      return "";
    }
		if (hashedString == undefined) {
			return "";
		}
    return hashedString;
  }catch (error) {
    logger.error(error);
    return "";
  }
}

const validateHash = async (input:string, hash:string): Promise<boolean> => {
  
  hash = hash.replace(/^\$2y(.+)$/i, '$2a$1'); // PHP old hashes compatibility

    try{
      const result = await bcrypt.compare(input, hash);
      logger.debug("Hash validation result", result);
      return result;
    }catch (error) {
      logger.error(error);
      return false;
    }
  }

export { generateBlurhash, generatefileHashfromfile, generatefileHashfrombuffer, hashString, validateHash};