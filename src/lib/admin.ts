import app from "../app.js";
import { ModuleDataTables, moduleDataReturnMessage, moduleDataSelectFields, moduleDataWhereFields } from "../interfaces/admin.js";
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

export { dbCountModuleData, dbCountModuleField, dbSelectModuleData };