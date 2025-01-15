import { createStream } from "rotating-file-stream";
import { Logger } from "tslog";
import { logEvent } from "../interfaces/logger.js";
import { getNewDate } from "./utils.js";
import { sendMessage } from "./nostr/NIP04.js";
import app from "../app.js";
const logHistory: logEvent[] = [];

const filename = (app.get('config.logger')['filename'] || 'server' ) + '.log'
const fileInterval = app.get('config.logger')['fileInterval'] || '1d';
const fileSize = app.get('config.logger')['fileSize'] || '10M';
const fileCompress = app.get('config.logger')['fileCompress'] || 'gzip';
const logPath = app.get('config.logger')['logPath'] || 'logs/';
const minLevel = app.get('config.logger')['minLevel'] || 5;

// Create a rotating write stream
const stream = createStream(filename, {
	size: fileSize, 
	interval: fileInterval,
	compress: fileCompress, 
	path: logPath,
});

// Create a logger instance
const logger = new Logger({
	minLevel: minLevel,
	prettyLogTemplate: "{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}}\t{{logLevelName}} - ",
	prettyErrorTemplate: "\n{{errorName}} {{errorMessage}}\nerror stack:\n{{errorStack}}",
	prettyErrorStackTemplate: "  • {{fileName}}\t{{method}}\n\t{{filePathWithLine}}",
	prettyErrorParentNamesSeparator: ":",
	prettyErrorLoggerNameDelimiter: "\t",
	stylePrettyLogs: true,
	prettyLogTimeZone: "UTC",
	prettyLogStyles: {
		logLevelName: {
			"*": ["bold", "black", "bgWhiteBright", "dim"],
			SILLY: ["bold", "white"],
			TRACE: ["bold", "whiteBright"],
			DEBUG: ["bold", "green"],
			INFO: ["bold", "blue"],
			WARN: ["bold", "yellow"],
			ERROR: ["bold", "red"],
			FATAL: ["bold", "redBright"],
		},
		dateIsoStr: "white",
		name: ["white", "bold"],
		nameWithDelimiterPrefix: ["white", "bold"],
		nameWithDelimiterSuffix: ["white", "bold"],
		errorName: ["bold", "bgRedBright", "whiteBright"],
		fileName: ["yellow"],
	},
});

logger.attachTransport(async (log) => {
	try{
		const formattedLog = {
			...log,
			_meta: {
			  ...log._meta,
			  date: getNewDate(),
			}
		  };
		  stream.write(`${JSON.stringify(formattedLog)}\n`);
		// only push to transports if logLevel is greater than or equal to 4 (warn)
		if (log._meta.logLevelId >= 4) {
			let logMessage: string = "";
			for (let key in log) {
				if (!isNaN(Number(key))) {
					logMessage += " " + log[key];
				}
			}
			const logEvent: logEvent = {
				date : log._meta.date,
				severity: log._meta.logLevelName,
				message: logMessage,
			};

			if (app.get('config.logger')['sendDM'] == true) await sendMessage(`${logEvent.severity} message detected: ${logEvent.message}`, app.get('config.logger')['sendPubkey'] != "" ? app.get('config.logger')['sendPubkey'] : app.get('config.server')['pubkey']);

			logHistory.push(logEvent);
			// Keep only the last 1000 lines in logHistory
			if (logHistory.length > 1000) {
				logHistory.shift();
			}
		}
	}catch(e){
		logger.fatal("Can't write to log file");
	}
	
});

export { logger, logHistory };
