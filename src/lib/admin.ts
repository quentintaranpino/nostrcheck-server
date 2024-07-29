import app from "../app.js";
import { ModuleDataTables, moduleDataSelectFields, moduleDataWhereFields } from "../interfaces/admin.js";
import { ResultMessagev2 } from "../interfaces/server.js";
import { dbDelete, dbInsert, dbMultiSelect, dbSelect, dbSimpleSelect, dbUpdate } from "./database.js";
import { logger } from "./logger.js";

const dbCountModuleData = async (module: string, field = ""): Promise<number> => {

	const table = ModuleDataTables[module];
	if (!table) {return 0;}

	logger.debug("Counting records in", table, "table", field? "with field" + field: "");

	if (field) {return Number(await dbSelect(`SELECT COUNT(${field}) FROM ${table} WHERE ${field} = '1' `, `COUNT(${field})`, [])) || 0;}
    return Number(await dbSelect(`SELECT COUNT(*) FROM ${table}`, "COUNT(*)", [])) || 0;
}


const dbCountMonthModuleData = async (module: string, field : string): Promise<object> => {

	const table = ModuleDataTables[module];
	if (!table) {return {}}
	const data = await dbMultiSelect(
									[`COUNT(*) as 'count'`, `DATE_FORMAT(${field}, '%Y-%m') as month`],
		 							`${table}`,
									`1= 1 GROUP BY month ORDER BY month DESC LIMIT 24`,
									[],
									false);
	return data;

}

async function dbSelectModuleData(module:string, offset:number, limit:number, order:string = "DESC", sort:string, search:string, filter: any): Promise<{ total: number; totalNotFiltered: number; rows: string | never[]; }>{

	const table = ModuleDataTables[module];
	if (!table) {return {total: 0, totalNotFiltered: 0, rows: []}}

	let {fieldsLogic, fromLogic, whereLogic, sortLogic, limitLogic} = {fieldsLogic: "", fromLogic: "", whereLogic: "WHERE (1=1) ", sortLogic: "", limitLogic: ""};

	fieldsLogic = moduleDataSelectFields[module];
	fromLogic = `FROM ${table}`;
    if (search) {
        const fieldsArray = moduleDataWhereFields[module].join(',').split(',');
        const fields = fieldsArray.map(field => `COALESCE(${field.trim()}, '')`).join(", ");
        whereLogic += `AND CONCAT(${fields}) LIKE "%${search}%"`;
    } else {
        whereLogic = "WHERE (1=1) ";
    }
	sort? sortLogic = `ORDER BY ${sort} ${order}`: sortLogic = `ORDER BY ${table}.id ${order}`;
	limitLogic = `LIMIT ${offset} , ${limit}`;

	if (filter && filter.length > 0){
	  for (const item of filter) {
		if (item.field && item.value) {whereLogic += ` AND ${item.field} = '${item.value}'`;}
	  }
	}

	const total = await dbSimpleSelect(table, `SELECT COUNT(*) as total FROM (SELECT ${fieldsLogic} ${fromLogic}) as ${table} ${whereLogic}`);
	const totalNotFiltered =  await dbCountModuleData(module);
	const data = await dbSimpleSelect(table, `SELECT * FROM (SELECT ${fieldsLogic} ${fromLogic}) as ${table} ${whereLogic} ${sortLogic} ${limitLogic}`);

	const result = {
		total: total? JSON.parse(JSON.stringify(total[0])).total : 0,
		totalNotFiltered: totalNotFiltered,
		rows: data || []
	}

	logger.debug("Selected", data.length, "records from", "totalnotfiltered", result.totalNotFiltered, "from", table, "table");

	return result;
}

const banSentinel = async (pubkey: string, reason: string, deleteMedia : boolean = false, deleteRegistered : boolean = false): Promise<ResultMessagev2> => {

	if (pubkey == "" || pubkey == null || reason == "" || reason == null) {return {status: "error", message: "Invalid parameters"};}

	if (pubkey == app.get("config.server")["pubkey"]) {return {status: "error", message: "You can't ban the server pubkey"};}

	let message = "";

	if (deleteMedia){
		const resultMedia = await dbMultiSelect(["id"], "mediafiles", "pubkey = ?", [pubkey], false);
		if (resultMedia.length > 0){
			const deleteMediaResult = await dbDelete("mediafiles", ["pubkey"], [pubkey]);
			if (deleteMediaResult == false) {return {status: "error", message: "Error deleting pubkey's media files"};}
		message += "Pubkey's media files deleted. ";
		}
	}

	if (deleteRegistered){
		const resultRegistered = await dbMultiSelect(["id"], "registered", "hex = ?", [pubkey], false);
		if (resultRegistered.length > 0) {
			const deleteRegistered = await dbDelete("registered", ["hex"], [pubkey]);
			if (deleteRegistered == false) {return {status: "error", message: message += "Error deleting pubkey's registered data"};}
			message += "Pubkey's registered data deleted. ";
		}
	}

	const resultBanTable = await dbMultiSelect(["id"], "banned", "pubkey = ?", [pubkey], false);
	if (resultBanTable.length > 0) {
		const isActive = await dbMultiSelect(["id"], "banned", "pubkey = ? AND active = 1", [pubkey], true);
		if (isActive.length > 0) {
			message += "Pubkey is already banned and active";
			return {status: "success", message: message};
		}else{
			const updateResult = await dbUpdate("banned","active", "1", ["pubkey"], [pubkey]);
			if (updateResult == false) {return {status: "error", message: "Error setting active pubkey's ban"};}
			message += "Pubkey ban was inactive, now is active";
			return {status: "success", message: message};
		}
	}
	
	const insertResult = await dbInsert("banned", ["pubkey", "reason"], [pubkey, reason]);
	if (insertResult == 0) {return {status: "error", message: message += "Error inserting pubkey ban"};}

	message += `Pubkey ${pubkey} banned successfully`;
	return {status: "success", message: message};

}

export { dbCountModuleData, dbSelectModuleData, dbCountMonthModuleData, banSentinel };