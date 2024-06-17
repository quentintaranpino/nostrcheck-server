import { ModuleDataTables, moduleDataSelectFields, moduleDataWhereFields } from "../interfaces/admin.js";
import { dbMultiSelect, dbSelect, dbSimpleSelect } from "./database.js";
import { logger } from "./logger.js";

const dbCountModuleData = async (module: string, field = ""): Promise<number> => {

	const table = ModuleDataTables[module];
	if (!table) {return 0;}

	logger.debug("Counting records in", table, "table", field? "with field" + field: "");

	if (field) {return Number(await dbSelect(`SELECT COUNT(${field}) FROM ${table} WHERE ${field} = '1' `, `COUNT(${field})`, [])) || 0;}
    return Number(await dbSelect(`SELECT COUNT(*) FROM ${table}`, "COUNT(*)", [])) || 0;
}


const dbCountMonthModuleData = async (module: string, field = ""): Promise<object> => {

	const table = ModuleDataTables[module];
	if (!table) {return {}}

	// Return a JSON object with the number of records for every month in the last 2 years
	const query = `SELECT COUNT(*) as count, DATE_FORMAT(${field}, "%Y-%m") as month FROM ${table} GROUP BY month ORDER BY month DESC LIMIT 24`;
	const data = await dbMultiSelect(query, ["count", "month"], [], false);
	logger.debug(data);
	return data;

}

async function dbSelectModuleData(module:string, offset:number, limit:number, order:string = "DESC", sort:string, search:string): Promise<{ total: number; totalNotFiltered: number; rows: string | never[]; }>{

	const table = ModuleDataTables[module];
	if (!table) {return {total: 0, totalNotFiltered: 0, rows: []}}

	let {fieldsLogic, fromLogic, whereLogic, sortLogic, limitLogic} = {fieldsLogic: "", fromLogic: "", whereLogic: "", sortLogic: "", limitLogic: ""};

	fieldsLogic = moduleDataSelectFields[module];
	fromLogic = `FROM ${table}`;
	search? whereLogic = `WHERE CONCAT(${moduleDataWhereFields[module]}) LIKE "%${search}%"`: whereLogic = "";
	sort? sortLogic = `ORDER BY ${sort} ${order}`: sortLogic = `ORDER BY ${table}.id ${order}`;
	search? limitLogic = ` `: limitLogic = `LIMIT ${offset} , ${limit}`;

	const data = await dbSimpleSelect(table, `SELECT * FROM (SELECT ${fieldsLogic} ${fromLogic}) as ${table} ${whereLogic} ${sortLogic} ${limitLogic}`);
	const totalLength = await dbCountModuleData(module);

	const result = {
		total: search? data.length : totalLength,
		totalNotFiltered: totalLength,
		rows: data || []
	}

	logger.debug("Selected", data.length, "records from", "totalnotfiltered", result.totalNotFiltered, "from", table, "table");

	return result;
}

export { dbCountModuleData, dbSelectModuleData, dbCountMonthModuleData };