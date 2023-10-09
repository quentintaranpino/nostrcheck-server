import {encode} from 'blurhash'
import { createCanvas, loadImage, Image } from 'canvas'
import { logger } from './logger.js'

const getImageData = (image: Image) => {
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, image.width, image.height)
}

const generateBlurhash = async (file:any): Promise<string> => {
  
  logger.debug("INIT blurhash generation for file:", file.originalname);
  let image = await loadImage(file.buffer);
  const imageData = getImageData(image);
  let blurhash = encode(imageData.data,imageData.width,imageData.height,4,4);
  logger.debug("END blurhash generation for file:", file.originalname, ":", blurhash);
  return blurhash;

}

export { generateBlurhash};