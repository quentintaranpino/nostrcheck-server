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

const generateQRCode = async (text: string, firstText:string, secondText:string): Promise<Buffer> => {
	return new Promise((resolve, reject) => {
	  QRCode.toBuffer(text, { type: 'png' }, (err, buffer) => {
		if (err) reject(err);
		else resolve(addTextToImage(buffer, firstText, secondText));
	  });
	});
};

const addTextToImage = async (imageBuffer: Buffer, firstText: string, secondText : string): Promise<Buffer> => {

	const image = sharp(imageBuffer);
	const { width, height } = await image.metadata();
  
	const sideLength = Math.max(width!, height!);
    
    let svgFirstText = `
    <svg width="${sideLength}" height="40">
      <rect x="0" y="0" width="800" height="40" fill="transparent" />
      <text x="50%" y="50%" alignment-baseline="middle" text-anchor="middle" font-size="12" font-family="Arial, sans-serif" fill="white">${firstText}</text>
    </svg>
  	`;

	const words = secondText.split(' ');
	const lines = [];
	let currentLine = '';
	  
	  words.forEach(word => {
		if ((currentLine + word).length <= 55) {
		  currentLine += ` ${word}`;
		} else {
		  lines.push(currentLine);
		  currentLine = word;
		}
	  });
	  
	  // Add the last line if it's not empty
	  if (currentLine) {
		lines.push(currentLine);
	  }
	  
	  let svgSecondText = `<svg width="${sideLength}" height="${lines.length * 14 + 10}">`;
	  svgSecondText += `<rect x="0" y="0" width="800" height="${lines.length * 14 + 10}" fill="transparent" />`;
	  
	  lines.forEach((line, index) => {
		svgSecondText += `<text x="50%" y="${14 + (index * 14)}" alignment-baseline="middle" text-anchor="middle" font-size="12" font-family="Arial, sans-serif" fill="white">${line}</text>`;
	  });
	  
	  svgSecondText += `</svg>`;


	const firstTextImage = await sharp(Buffer.from(svgFirstText)).resize(sideLength + 130).toBuffer();
	const secondTextImage = await sharp(Buffer.from(svgSecondText)).resize(sideLength + 130).toBuffer();
	const logoImage = await sharp(fs.readFileSync('./src/pages/static/resources/navbar-logo.webp')).resize(sideLength).toBuffer();
  
	return sharp({
	  create: {
		width: sideLength + 130,
		height: sideLength + 255,
		channels: 4,
		background: '#212529',
	  },
	})
	  .composite([
		{ input: logoImage, top: 20, left: 65 },
		{ input: imageBuffer, top: 140, left: 65 },
		{ input: firstTextImage, top: sideLength + 140, left: 0 },
		{ input: secondTextImage, top: sideLength + 190, left: 0 },
	  ])
	  .webp()
	  .toBuffer();
  };

export { getClientIp, format, currDir, markdownToHtml, generateQRCode};