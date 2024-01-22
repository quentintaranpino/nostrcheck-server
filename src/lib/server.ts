
//General server functions

import config from "config";
import { ResultMessagev2 } from "../interfaces/server.js";
import { logger } from "./logger.js";
import fs from "fs";
import path from 'path';
import url from 'url';
import markdownit from 'markdown-it';

const getClientIp = (req: any) =>{

    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (ip.substr(0, 7) == "::ffff:") {
        ip = ip.substr(7)
    }
    return ip;
};

const IsAuthorized = async (req: any) : Promise<ResultMessagev2> =>{

    const ip = getClientIp(req);

    //Check if request has authorization header
	if (req.headers.authorization === undefined) {
		logger.warn(
			"RES -> 400 Bad request - Authorization header not found",
			"|",
			req.socket.remoteAddress
		);
		const result: ResultMessagev2 = {
            status: "error",
            message: "Authorization header not found"
		};

		return result;
	}

    //Check if authorization header is valid
    const DbPassword = config.get("database.password")
    const AuthHeader = req.headers.authorization.toString();
    if (AuthHeader !== DbPassword) {
        logger.warn(
            "RES -> 401 unauthorized  - ",
            ip
        );
        const result: ResultMessagev2 = {
            status: "error",
            message: "Unauthorized"
        };

        return result;
    }

    const result: ResultMessagev2 = {
        status: "success",
        message: "Authorized"
    };

    return result;

};

function format(seconds:number):string{
	function pad(s: number){
	  return (s < 10 ? '0' : '') + s;
	}
	var hours = Math.floor(seconds / (60*60));
	var minutes = Math.floor(seconds % (60*60) / 60);
	var seconds = Math.floor(seconds % 60);
  
	return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
  }

const getServerLogo = () : string => {
    try{
        const serverLogo :Buffer = fs.readFileSync(path.normalize(path.resolve(config.get("server.logoFilePath"))));
        if (serverLogo.length > 0) {
            return Buffer.from(serverLogo).toString("base64");
        }
    }catch(err){
        logger.error("Error reading server logo file: ", err);
    }
    return "";
}

const getTOSUrl = (hostname: string) : string => {
    if(config.get("media.tosURL")){
        return config.get("media.tosURL")
    }else{
        return "https://" + hostname + "/tos"
    };
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

export { getClientIp, IsAuthorized, format, getServerLogo, getTOSUrl, currDir, markdownToHtml};