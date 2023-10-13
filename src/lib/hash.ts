import {encode} from 'blurhash'
import { createCanvas, loadImage, Image } from 'canvas'
import { logger } from './logger.js'
import crypto from 'crypto'
import fs from 'fs'

const getImageData = (image: Image) => {
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, image.width, image.height)
}


const generatefileHashfromfile = (filepath:string): string => {

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


const generateBlurhash = async (file:any): Promise<string> => {

  logger.debug("INIT blurhash generation for file:", file.originalname);
  let image = await loadImage(file.buffer);
  const imageData = getImageData(image);
  let blurhash = encode(imageData.data,imageData.width,imageData.height,4,3);
  logger.debug("END blurhash generation for file:", file.originalname, ":", blurhash);
  return blurhash;

}

export { generateBlurhash, generatefileHashfromfile, generatefileHashfrombuffer};