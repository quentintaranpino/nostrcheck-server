import { logger } from "./logger.js";
import path from 'path';
import url from 'url';
import QRCode from 'qrcode';
import sharp from "sharp";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import { randomBytes } from "crypto";
import MarkdownIt from "markdown-it";
import { getConfig } from "./config/core.js";

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

	const md = new MarkdownIt({
		html: true,
		breaks: true,
		linkify: true,
		typographer: true
	});
	
    try{
        return md.render(text).toString();
    }catch(err){
		logger.error(`markdownToHtml - Error parsing markdown to html: ${err}`);
        return "";
    }
}

const generateQRCode = async (text: string, firstText: string, secondText: string, type: 'image' | 'video'): Promise<{ buffer: Buffer; type: 'image/webp' | 'video/mp4' }> => {
    return new Promise(async (resolve, reject) => {
        try {
            const buffer = await QRCode.toBuffer(text, { type: 'png', width: 290, margin: 3 });
            const imageBuffer = await addTextToImage(buffer, firstText, secondText);
            
            if (type === 'video') {
                const videoBuffer = await generateVideoFromImage(imageBuffer);
                resolve({ buffer: videoBuffer, type: 'video/mp4' });
            } else {
                resolve({ buffer: imageBuffer, type: 'image/webp' });
            }
        } catch (err) {
            reject(err);
        }
    });
};


const generateVideoFromImage = (imageBuffer: Buffer): Promise<Buffer> => {
    return new Promise((resolve) => {

		const tempImagePath = getConfig(null, ["storage", "local", "tempPath"]) + `/${randomBytes(32).toString('hex')}.webp`;
		const tempVideoPath = getConfig(null, ["storage", "local", "tempPath"]) + `/${randomBytes(32).toString('hex')}.mp4`;

        fs.writeFileSync(tempImagePath, imageBuffer);

		ffmpeg(tempImagePath)
    .loop(1)
			.outputOptions([
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', 
                '-r', '15',                                  
                '-b:v', '500k',                               
                '-pix_fmt', 'yuv420p',
            ])
    .output(tempVideoPath)
    .on('end', () => {
        const videoBuffer = fs.readFileSync(tempVideoPath);
        fs.unlinkSync(tempImagePath);
        fs.unlinkSync(tempVideoPath);
        resolve(videoBuffer);
    })
    .on('error', (err) => {
		logger.error(`generateVideoFromImage - Error generating video from image: ${err}`);
		resolve(Buffer.from("")); 
    })
    .run();
    });
};


const addTextToImage = async (imageBuffer: Buffer, firstText: string, secondText : string): Promise<Buffer> => {

	const image = sharp(imageBuffer);
	const { width, height } = await image.metadata();
  
	const sideLength = Math.max(width!, height!);
  
    const svgFirstText = `
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
	
	if (currentLine) {
	lines.push(currentLine);
	}
	
	let svgSecondText = `<svg width="${sideLength}" height="${lines.length * 14 + 10}">`;
	svgSecondText += `<rect x="0" y="0" width="800" height="${lines.length * 14 + 10}" fill="transparent" />`;
	
	lines.forEach((line, index) => {
	svgSecondText += `<text x="50%" y="${14 + (index * 14)}" alignment-baseline="middle" text-anchor="middle" font-size="10" font-family="Arial, sans-serif" fill="white">${line}</text>`;
	});
	
	svgSecondText += `</svg>`;


	const firstTextImage = await sharp(Buffer.from(svgFirstText)).resize(sideLength + 130).toBuffer();
	const secondTextImage = await sharp(Buffer.from(svgSecondText)).resize(sideLength + 130).toBuffer();
	
	try{
		const logoImage = await sharp(fs.readFileSync('./src/pages/static/resources/appearance-server-logo-dark.default.png')).resize(sideLength).toBuffer();
  
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
	}catch(err){
		logger.error(`generateQRCode - Error generating QR code: ${err}`);
		return Buffer.from("");
	}
	
};

const getNewDate = (): string =>{
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0'); 
	const day = String(now.getDate()).padStart(2, '0');
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function isBase64(str: string): boolean {
	return /^[A-Za-z0-9+/=]+$/.test(str);
}

function getCPUUsage(): Promise<number> {
	return new Promise((resolve) => {
		const startUsage = process.cpuUsage();
		const startTime = process.hrtime();

		setTimeout(() => {
			const endUsage = process.cpuUsage(startUsage);
			const elapsedTime = process.hrtime(startTime);

			const elapsedMs = (elapsedTime[0] * 1000) + (elapsedTime[1] / 1e6);
			const totalCPU = (endUsage.user + endUsage.system) / 1000;
			const cpuPercentage = (totalCPU / elapsedMs) * 100;
			resolve(Math.floor(cpuPercentage));	
		}, 1000);
	});
}

/**
 * Get host information
 * @returns { hostname: string, port: string, url: string, mediaURL: string }
 */
const getHostInfo = (domain: string): { hostname: string, port: string, url: string} => {
	const environment = getConfig(null, ["environment"]);
	const port = getConfig(null, ["server", "port"]);
	const hostname = getConfig(domain, ["server", "host"]);
	const url = environment === "development" ? `http://localhost:${port}` : `https://${hostname}`;
	return {hostname, port, url};
};

/**
 * Safely parse JSON strings
 * @param {string} str - The JSON string to parse
 * @param {T} defaultVal - The default value to return in case of an error
 * @returns {T} - The parsed object or the default value
 */
const safeJSONParse = <T>(str: string, defaultVal: T): T => {
	try {
		return JSON.parse(str);
	} catch (e) {
		logger.error("getEventsDB - Error parsing JSON", e);
		return defaultVal;
	}
};


/**
 * Converts a string or value to a real boolean.
 * 
 * @param value - The input value (string, number, or boolean).
 * @returns A boolean value based on typical truthy/falsey string representations.
 *
 * @example
 * parseBoolean("true")   // true
 * parseBoolean("false")  // false
 * parseBoolean("1")      // true
 * parseBoolean("0")      // false
 * parseBoolean(true)     // true
 */
const parseBoolean = (value: any): boolean => {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const val = value.trim().toLowerCase();
		return val === "true" || val === "1" || val === "yes" || val === "on";
	}
	if (typeof value === "number") return value === 1;
	return false;
};

const serverBanner = () : string => {

	const banner : string[] = [];

	banner.push("");
	banner.push("");

	banner.push(
	"███╗   ██╗ ██████╗ ███████╗████████╗██████╗  ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗"
	);
	banner.push(
		"████╗  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝" 
	);
	banner.push(
		"██╔██╗ ██║██║   ██║███████╗   ██║   ██████╔╝██║     ███████║█████╗  ██║     █████╔╝" 
	);
	banner.push(
		"██║╚██╗██║██║   ██║╚════██║   ██║   ██╔══██╗██║     ██╔══██║██╔══╝  ██║     ██╔═██╗"  
	);
	banner.push(
		"██║ ╚████║╚██████╔╝███████║   ██║   ██║  ██║╚██████╗██║  ██║███████╗╚██████╗██║  ██╗"
	);
	banner.push(
		"╚═╝  ╚═══╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝"
	);
	banner.push("");
	banner.push(
		"███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ "
	);
	banner.push(
		"██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗"
	);
	banner.push(
		"███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝"
	);
	banner.push(
		"╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗"
	);
	banner.push(
		"███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║"
	);
	banner.push(
		"╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝"
	);
	banner.push(`Nostrcheck server started, version ${getConfig(null, ["version"])}.`);
	banner.push(`Running at http://localhost:${getConfig(null, ["server", "port"])} in ${getConfig(null, ["environment"])} mode.`);
	banner.push(`Documentation: https://github.com/quentintaranpino/nostrcheck-server/blob/main/DOCS.md`)
	banner.push("");
	banner.push("Press CTRL-C to stop the server");
	banner.push("");

	return banner.join('\r\n').toString();
}

const execWithTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        promise
            .then((result) => {
                clearTimeout(timeout);
                resolve(result);
            })
            .catch((err) => {
                clearTimeout(timeout);
                reject(err);
            });
    });
}

export { format, 
	    currDir, 
		markdownToHtml, 
		generateQRCode, 
		getNewDate, 
		isBase64, 
		getCPUUsage, 
		getHostInfo, 
		safeJSONParse,
		parseBoolean,
		serverBanner,
		execWithTimeout,
		generateVideoFromImage};