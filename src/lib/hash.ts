import { logger } from './logger.js'
import crypto from 'crypto'
import fs from 'fs'
import sharp from 'sharp'
import { encode } from 'blurhash'
import { credentialTypes } from '../interfaces/authorization.js';
import bcrypt from 'bcrypt';

const generatefileHashfromfile = (filepath:string): string => {

  logger.debug(`generatefileHashfromfile - INIT hash generation for file: ${filepath}`);

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
  logger.debug(`generatefileHashfromfile - END hash generation for file: ${filepath} => ${hash}`);

  return hash;

}

const generatefileHashfrombuffer = async (file:Express.Multer.File, type:string): Promise<string> => {

  logger.debug(`generatefileHashfrombuffer - INIT hash generation for file: ${file.originalname}`);

  let hash = '';
  try{

    // If the file is an avatar or banner, we prepend the type to the buffer to create a unique hash
    const buffer = type == "avatar" || type == "banner" ? Buffer.concat([Buffer.from(type), file.buffer]) : file.buffer;

    hash = crypto
        .createHash("sha256")
        .update(buffer)
        .digest("hex");
    }
  catch (error) {
    logger.error(`generatefileHashfrombuffer - Error getting file hash with error: ${error}`);
    return "";
  }
  logger.debug(`generatefileHashfrombuffer - END hash generation for file: ${file.originalname} => ${hash}`);

  return hash;

}

const generateBlurhash = async (path: string): Promise<string> =>
  new Promise((resolve) => {
    logger.debug(`generateBlurhash - INIT blurhash generation for file: ${path}`);
    sharp.cache(false);
    sharp(path)
      .raw()
      .ensureAlpha()
      .resize(32, 32, { fit: "inside" })
      .toBuffer((err, buffer, info) => {
        if (err || !info) {
          logger.error(`generateBlurhash - Error processing image or 'info' is undefined for file: ${path} with error: ${err.cause} ${err.message}`);
          return resolve("");
        }

        const { width, height } = info;
        const blurhash = encode(new Uint8ClampedArray(buffer), width, height, 4, 4);
        logger.debug(`generateBlurhash - END blurhash generation for file: ${path} => ${blurhash}`);
        resolve(blurhash);
      });
  });


/**
 * Hashes a given string using bcrypt with a specified number of salt rounds.
 * @param {string} input - The string to be hashed.
 * @param {credentialTypes} type - The type of credential to be hashed.
 * @param {number} saltRounds - The number of rounds to use when generating the salt (default is 40).
 * @returns {Promise<string>} A promise that resolves to the hashed string, or an empty string if an error occurs or if the input is undefined.
 */
const hashString = async (input:string, type: credentialTypes, saltRounds:number = 10): Promise<string> => {

  let hashedString; 
  try{
    if (type == "password"){
      hashedString = await bcrypt.hash(input, saltRounds).catch(err => {logger.error(err)});
    }
    else if (type == "otc"){
      hashedString =  await crypto.createHash('sha256').update(input + saltRounds).digest('hex');
    }
    else if (type == "preimage"){
      hashedString = await crypto.createHash('sha256').update(Buffer.from(input, 'hex')).digest('hex');
    }
    else{
      logger.error(`hashString - Invalid credential type: ${type}`);
      return "";
    }
		if (hashedString == undefined) {
			return "";
		}
    return hashedString;
  }catch (error) {
    logger.error(`hashString - Error hashing string with error: ${error}`);
    return "";
  }
}

const validateHash = async (input:string, hash:string): Promise<boolean> => {
  
  hash = hash.replace(/^\$2y(.+)$/i, '$2a$1'); // PHP old hashes compatibility

    try{
      const result = await bcrypt.compare(input, hash);
      logger.debug(`validateHash - Hash validation result: ${result}`);
      return result;
    }catch (error) {
      logger.debug(`validateHash - Error validating hash with error: ${error}`);
      return false;
    }
  }

const getHashedPath = async (filename : string) => {
    const hash = crypto.createHash('md5').update(filename).digest('hex').slice(0, 4);
    return hash.slice(0, 4);
}

export { generateBlurhash, generatefileHashfromfile, generatefileHashfrombuffer, hashString, validateHash, getHashedPath};