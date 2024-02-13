import { logger } from "./logger.js";
import path from 'path';
import url from 'url';
import markdownit from 'markdown-it';
import { Application } from "express";
import { Request } from "express";

const getClientIp = (req: Request) =>{

    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (typeof ip === 'string' && ip.startsWith("::ffff:")) {
        ip = ip.substring(7);
    }
    return ip;
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

const loadConsoleBanner = (app: Application) : void => {

    console.log("");
	console.log("");

	console.log(
	"███╗   ██╗ ██████╗ ███████╗████████╗██████╗  ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗"
	);
	console.log(
		"████╗  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝" 
	);
	console.log(
		"██╔██╗ ██║██║   ██║███████╗   ██║   ██████╔╝██║     ███████║█████╗  ██║     █████╔╝" 
	);
	console.log(
		"██║╚██╗██║██║   ██║╚════██║   ██║   ██╔══██╗██║     ██╔══██║██╔══╝  ██║     ██╔═██╗"  
	);
	console.log(
		"██║ ╚████║╚██████╔╝███████║   ██║   ██║  ██║╚██████╗██║  ██║███████╗╚██████╗██║  ██╗"
	);
	console.log(
		"╚═╝  ╚═══╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝"
	);
	console.log("");
	console.log(
		"███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ "
	);
	console.log(
		"██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗"
	);
	console.log(
		"███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝"
	);
	console.log(
		"╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗"
	);
	console.log(
		"███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║"
	);
	console.log(
		"╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝"
	);

	console.log("Nostrcheck server started, version %s", app.get("version"));
	console.log("Running at http://" + app.get('server.host') + " - " + app.get("env"), "mode");
	console.log("Press CTRL-C to exit\n");
}

const showActiveModules = (app: Application) : string => {
		let activeModules : string = "Active modules: ";
		let first : boolean = true;
		for(const key in app.get("activeModules")){
			if (app.get("activeModules")[key]["enabled"] == true) {
				if (first) { activeModules = activeModules + key; first = false;}
				else { activeModules = activeModules + ", " + key;}
			}
		}
		return activeModules;
}

export { getClientIp, format, currDir, markdownToHtml, loadConsoleBanner, showActiveModules};