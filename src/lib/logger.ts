import { createStream } from "rotating-file-stream";
import { Logger } from "tslog";
import config from "config";

// Create a rotating write stream
const stream = createStream(config.get('logger.filename') + ".log", {
	size: config.get('logger.size'), 
	interval: config.get('logger.interval'),
	compress: config.get('logger.compression'), 
});

// Create a logger instance
const logger = new Logger({
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

logger.attachTransport((logger) => {
	stream.write(`${JSON.stringify(logger)}\n`);
});

export { logger };
