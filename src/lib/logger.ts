import { createStream } from "rotating-file-stream";
import { Logger } from "tslog";
import { LogEvent } from "../interfaces/logger.js";
import { getNewDate } from "./utils.js";
import { sendMessage } from "./nostr/NIP04.js";
import app from "../app.js";

const logHistory: LogEvent[] = [];

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
		// if (log._meta.logLevelId >= 4) {
			let logMessage: string = "";
			for (let key in log) {
				if (!isNaN(Number(key))) {
					logMessage += " " + log[key];
				}
			}
			const logEvent: LogEvent = {
				id : logHistory.length,
				date : log._meta.date,
				severity: log._meta.logLevelName,
				message: logMessage,
			};

			if (app.get('config.logger')['sendDM'] == true && log._meta.logLevelId >= 4) await sendMessage(`${logEvent.severity} message detected: ${logEvent.message}`, app.get('config.logger')['sendPubkey'] != "" ? app.get('config.logger')['sendPubkey'] : app.get('config.server')['pubkey']);

			logHistory.push(logEvent);
			if (logHistory.length > 10000) logHistory.shift();
		// }
	}catch(e){
		logger.fatal(`Logger - Error writing to log file: ${e}`);
	}
	
});

/**
 * Retrieves a subset of log events from in-memory log history with optional text search, additional filtering, sorting, and pagination.
 *
 *
 * @param {number} offset - The starting index for pagination.
 * @param {number} limit - The maximum number of log entries to return.
 * @param {string} [order="DESC"] - The sort order ("ASC" for ascending or "DESC" for descending). Defaults to "DESC".
 * @param {string} sort - The field to sort by. Valid options are "id", "date", "severity", and "message". Defaults to "date" if an invalid value is provided.
 * @param {string} [search] - Optional text to search for within the log's message or severity fields (case-insensitive).
 * @param {any} filter - Additional filtering criteria as an array of objects, each having a "field" and a "value". This enables complex filtering (e.g., OR conditions).
 * @returns {{ total: number; totalNotFiltered: number; rows: LogEvent[] }} 
 */
const getLogHistory = (offset: number, limit: number, order: string = "desc", sort: string, search: string, filter: any ): { total: number; totalNotFiltered: number; rows: LogEvent[] } => {

	let logs = [...logHistory];
	const totalNotFiltered = logs.length;

	const allowedSortKeys: string[] = ["id", "date", "severity", "message"];
	if (!allowedSortKeys.includes(sort)) sort = "date";

	if (search && search.trim().length > 0) {
		const searchLower = search.toLowerCase();
		logs = logs.filter(
			(log) =>
			log.message.toLowerCase().includes(searchLower) ||
			log.severity.toLowerCase().includes(searchLower)
		);
	}

	if (filter && Array.isArray(filter) && filter.length > 0) {
		filter.forEach((item: { field: string; value: any }) => {
		  if (item.field && item.value !== undefined && item.value !== null) {
			logs = logs.filter((log) => {
			  const logValue = (log as any)[item.field];
			  if (typeof item.value === "string" && item.value.includes("||")) {
				const values = item.value.split("||").map(v => v.trim().toLowerCase());
				if (typeof logValue === "string") {
				  return values.includes(logValue.toLowerCase());
				}
				return values.includes(String(logValue).toLowerCase());
			  }
			  else if (Array.isArray(item.value)) {
				if (typeof logValue === "string") {
				  return item.value.map((v: any) => String(v).toLowerCase()).includes(logValue.toLowerCase());
				}
				return item.value.includes(logValue);
			  }
			  else {
				if (typeof logValue === "string" && typeof item.value === "string") {
				  return logValue.toLowerCase() === item.value.toLowerCase();
				}
				return logValue === item.value;
			  }
			});
		  }
		});
	}

	const total = logs.length;

	logs.sort((a, b) => {
		const key = sort as keyof LogEvent;
		const valueA = a[key];
		const valueB = b[key];
		let cmp = 0;
		
		if (valueA instanceof Date && valueB instanceof Date) {
		  cmp = valueA.getTime() - valueB.getTime();
		} else if (typeof valueA === "number" && typeof valueB === "number") {
		  cmp = valueA - valueB;
		} else {
		  cmp = String(valueA).localeCompare(String(valueB));
		}
		
		return order.toLocaleLowerCase() === "asc" ? cmp : -cmp;
	  });

	const rows = logs.slice(offset, offset + limit);
	return { total, totalNotFiltered, rows };
};

export { logger, getLogHistory };
