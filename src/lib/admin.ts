import app from "../app.js";
import { ModuleDataTables, moduleDataReturnMessage, moduleDataWhereFields } from "../interfaces/admin.js";
import { isModuleEnabled } from "./config.js";
import { dbMultiSelect, dbSelect, dbSimpleSelect } from "./database.js";
import { logger } from "./logger.js";


const dbCountModuleData = async (module: string): Promise<number> => {

	const table = ModuleDataTables[module];
	if (!table) {return 0;}

	logger.debug("Counting records in", table, "table");

    return Number(await dbSelect("SELECT COUNT(*) FROM " + table, "COUNT(*)", [])) || 0;
}

const dbCountModuleField = async (module: string, field: string): Promise<string[]> => {

	const table = ModuleDataTables[module];
	if (!table) {return [];}

	let select = "SELECT " +
		"SUM(CASE WHEN " + field + " = TRUE THEN 1 ELSE 0 END) AS " + field + ", " +
		"SUM(CASE WHEN " + field + " = FALSE THEN 1 ELSE 0 END) AS un" + field + " " +
		"FROM " + table;
	return await dbMultiSelect(select, [field, "un" + field], [field]);
}


async function dbSelectModuleData(module:string, offset:number, limit:number, order:string = "", sort:string, search:string): Promise<moduleDataReturnMessage>{

	const table = ModuleDataTables[module];
	if (!table) {return {total: 0, totalNotFiltered: 0, rows: []}}

	let {tableLogic, whereLogic, sortLogic, limitLogic} = {tableLogic: "", whereLogic: "", sortLogic: "", limitLogic: ""};

	(isModuleEnabled(module,app) && (module == "nostraddress" || module == "media" ))? tableLogic = `FROM ${table} LEFT JOIN transactions on ${table}.transactionid = transactions.id` : tableLogic = `FROM ${table}`;
	search? whereLogic = `WHERE CONCAT(${moduleDataWhereFields[module]}) LIKE "%${search}%"`: whereLogic = "";
	sort? sortLogic = `ORDER BY ${table}.${sort} ${order}`: sortLogic = `ORDER BY ${table}.id ${order}`;
	search? limitLogic = ` `: limitLogic = `LIMIT ${offset} , ${limit}`;

	const data = await dbSimpleSelect(table, `SELECT *, ${table}.id ${tableLogic} ${whereLogic} ${sortLogic} ${limitLogic}`);
	const totalLength = await dbCountModuleData(module);

	const result = {
		total: search? data.length : totalLength,
		totalNotFiltered: totalLength,
		rows: data
	}

	logger.debug("Selected", data.length, "records from", "totalnotfiltered", result.totalNotFiltered, "from", table, "table");

	return result;

	// if (module == "media" && isModuleEnabled("payments", app) == false){
	// 	return await dbSelectAllRecords("mediafiles", 
	// 	"SELECT mediafiles.id," +
	// 	"mediafiles.checked, " +
	// 	"mediafiles.active, " +
	// 	"mediafiles.visibility, " +
	// 	"(SELECT registered.username FROM registered WHERE mediafiles.pubkey = registered.hex LIMIT 1) as username, " +
	// 	"(SELECT registered.pubkey FROM registered WHERE mediafiles.pubkey = registered.hex LIMIT 1) as npub, " +
	// 	"mediafiles.pubkey as 'pubkey', " +
	// 	"mediafiles.filename, " +
	// 	"mediafiles.original_hash, " +
	// 	"mediafiles.hash, " +
	// 	"mediafiles.status, " +
	// 	"mediafiles.dimensions, " +
	// 	"ROUND(mediafiles.filesize / 1024 / 1024, 2) as 'filesize', " +
	// 	"DATE_FORMAT(mediafiles.date, '%Y-%m-%d %H:%i') as date, " +
	// 	"mediafiles.comments " +
	// 	"FROM mediafiles " +
	// 	"ORDER BY id DESC;");
	// }

	// if (module == "media" && isModuleEnabled("payments", app) == true){
	// 	return await dbSelectAllRecords("mediafiles", 
	// 	"SELECT mediafiles.id," +
	// 	"mediafiles.checked, " +
	// 	"mediafiles.active, " +
	// 	"mediafiles.visibility, " +
	// 	"transactions.id as 'transactionid', " +
	// 	"transactions.satoshi, " +
	// 	"transactions.paid, " +
	// 	"(SELECT registered.username FROM registered WHERE mediafiles.pubkey = registered.hex LIMIT 1) as username, " +
	// 	"(SELECT registered.pubkey FROM registered WHERE mediafiles.pubkey = registered.hex LIMIT 1) as npub, " +
	// 	"mediafiles.pubkey as 'pubkey', " +
	// 	"mediafiles.filename, " +
	// 	"mediafiles.original_hash, " +
	// 	"mediafiles.hash, " +
	// 	"mediafiles.status, " +
	// 	"mediafiles.dimensions, " +
	// 	"ROUND(mediafiles.filesize / 1024 / 1024, 2) as 'filesize', " +
	// 	"DATE_FORMAT(mediafiles.date, '%Y-%m-%d %H:%i') as date, " +
	// 	"mediafiles.comments " +
	// 	"FROM mediafiles LEFT JOIN transactions on mediafiles.transactionid = transactions.id " +
	// 	"ORDER BY id DESC;");
	// }

	// if (module == "lightning"){
	// 	return await dbSelectAllRecords("lightning", "SELECT id, active, pubkey, lightningaddress, comments FROM lightning ORDER BY id DESC");
	// }
	// if (module == "domains"){
	// 	return await dbSelectAllRecords("domains", "SELECT id, active, domain, comments FROM domains ORDER BY id DESC");
	// }

	// if (module == "payments"){
	// 	return await dbSelectAllRecords("transactions", 
	// 		"SELECT id, type, accountid, paymentrequest, paymenthash, satoshi, paid, DATE_FORMAT(transactions.createddate, '%Y-%m-%d %H:%i') as createddate, DATE_FORMAT(expirydate, '%Y-%m-%d %H:%i') as expirydate, DATE_FORMAT(transactions.paiddate, '%Y-%m-%d %H:%i') as paiddate, comments FROM transactions ORDER BY id DESC");
	// }
	// return "";
}

export { dbCountModuleData, dbCountModuleField, dbSelectModuleData };