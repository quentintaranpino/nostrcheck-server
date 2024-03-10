import { logger } from "./logger.js";
import path from 'path';
import url from 'url';
import markdownit from 'markdown-it';
import { Request } from "express";

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

export { getClientIp, format, currDir, markdownToHtml};