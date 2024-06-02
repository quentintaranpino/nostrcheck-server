import { logger } from "./logger.js";
import path from 'path';
import url from 'url';
import markdownit from 'markdown-it';
import { Request } from "express";
import QRCode from 'qrcode';
import sharp from "sharp";
import fs from "fs";

const getClientIp = (req: Request): string => {
    let ip = req.headers['x-forwarded-for'];
    if (Array.isArray(ip)) {
        ip = ip[0];
    } else {
        ip = ip || req.connection.remoteAddress;
    }
    if (typeof ip === 'string' && ip.startsWith("::ffff:")) {
        ip = ip.substring(7);
    }
    return ip || "";
};

const format = (seconds:number):string =>{
	function pad(s: number){
		return (s < 10 ? '0' : '') + s;
	}
	const hours = Math.floor(seconds / (60*60));
	const minutes = Math.floor(seconds % (60*60) / 60);
	const secs = Math.floor(seconds % 60);
  
	return pad(hours) + ':' + pad(minutes) + ':' + pad(secs);
}

const currDir = (fileUrl:string) : string =>{
    const __filename = url.fileURLToPath(fileUrl);
    return path.dirname(__filename);
}

const markdownToHtml = (text:string) : string => {

    const md = markdownit();
    try{
        return md.render(text).toString();
    }catch(err){
        logger.error("Error parsing markdown to html: ", err);
        return "";
    }
}

const generateQRCode = async (text: string, bottomText:string): Promise<Buffer> => {
	return new Promise((resolve, reject) => {
	  QRCode.toBuffer(text, { type: 'png' }, (err, buffer) => {
		if (err) reject(err);
		else resolve(addTextToImage(buffer, bottomText));
	  });
	});
};

const addTextToImage = async (imageBuffer: Buffer, bottomText: string): Promise<Buffer> => {

	const image = sharp(imageBuffer);
	const { width, height } = await image.metadata();
  
	const sideLength = Math.max(width!, height!);
    
    const svgBottomText = `
    <svg width="${sideLength}" height="40">
      <rect x="0" y="0" width="800" height="40" fill="transparent" />
      <text x="50%" y="50%" alignment-baseline="middle" text-anchor="middle" font-size="14" font-family="Arial, sans-serif" fill="white">${bottomText}</text>
    </svg>
  `;

    const bottomTextBuffer = Buffer.from(svgBottomText);
	const bottomTextImage = await sharp(bottomTextBuffer).resize(sideLength + 60).toBuffer();
	const logoImage = await sharp(fs.readFileSync('./src/pages/static/resources/navbar-logo.webp')).resize(sideLength).toBuffer();
  
	return sharp({
	  create: {
		width: sideLength + 60,
		height: sideLength + 175,
		channels: 4,
		background: '#212529',
	  },
	})
	  .composite([
		{ input: logoImage, top: 15, left: 30 },
		{ input: imageBuffer, top: 130, left: 30 },
		{ input: bottomTextImage, top: sideLength + 135, left: 0 },
	  ])
	  .webp()
	  .toBuffer();
  };

export { getClientIp, format, currDir, markdownToHtml, generateQRCode};