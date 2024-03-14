import { createStream } from "rotating-file-stream";
import { Logger } from "tslog";
import { logEvent } from "../interfaces/logger.js";
import config from "config";
const logHistory: logEvent[] = [];

const filename = (config.has('logger.filename') ? config.get('logger.filename') : 'server') + '.log';
const fileSize = (config.has('logger.size') ? config.get('logger.size') : '10M') as string;
const fileInterval = (config.has('logger.interval') ? config.get('logger.interval') : '1d') as string;
const fileCompress = (config.has('logger.compression') ? config.get('logger.compression') : 'gzip') as string;
const minLevel = (config.has('logger.minLevel') ? config.get('logger.minLevel') : 5) as number;
const logPath = (config.has('logger.logPath') ? config.get('logger.logPath') : 'logs/') as string;

// Create a rotating write stream
const stream = createStream(logPath + filename, {
	size: fileSize, 
	interval: fileInterval,
	compress: fileCompress, 
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

logger.attachTransport((log) => {
	try{
		stream.write(`${JSON.stringify(log)}\n`);
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
