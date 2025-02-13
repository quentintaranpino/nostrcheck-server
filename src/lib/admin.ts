import { ModuleDataTables, moduleDataSelectFields, moduleDataWhereFields } from "../interfaces/admin.js";
import { dbMultiSelect, dbSelect, dbSimpleSelect } from "./database.js";
import { logger } from "./logger.js";

const dbCountModuleData = async (module: string, field = ""): Promise<number> => {
	const table = ModuleDataTables[module];
	if (!table) {return 0;}
	if (field) {return Number(await dbSelect(`SELECT COUNT(${field}) FROM ${table} WHERE ${field} = '1' `, `COUNT(${field})`, [])) || 0;}
    return Number(await dbSelect(`SELECT COUNT(*) FROM ${table}`, "COUNT(*)", [])) || 0;
}


const dbCountMonthModuleData = async (module: string, field: string): Promise<object> => {
	
	const table = ModuleDataTables[module];
	if (!table) return {};
  
	const data = await dbMultiSelect(
		[
		`COUNT(*) as 'count'`,
		`DATE_FORMAT(
			IF(
				CAST(${field} AS CHAR) REGEXP '^[0-9]+$',
				IF(${field} > 9999999999, FROM_UNIXTIME(${field} / 1000), FROM_UNIXTIME(${field})),
				${field}
			),
			'%Y-%m') as month`
		],
		`${table}`,
		`1=1 GROUP BY month ORDER BY month DESC LIMIT 24`,
		[],
		false
	);
  
	return data;
  };

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

	logger.debug(`dbSelectModuleData - executing query: SELECT ${fieldsLogic} ${fromLogic} ${whereLogic} ${sortLogic} ${limitLogic}`);
	logger.debug(`dbSelectModuleData - executing query: SELECT COUNT(*) as total FROM (SELECT ${fieldsLogic} ${fromLogic}) as ${table} ${whereLogic}`);

	const total = await dbSimpleSelect(table, `SELECT COUNT(*) as total FROM (SELECT ${fieldsLogic} ${fromLogic}) as ${table} ${whereLogic}`);
	const totalNotFiltered =  await dbCountModuleData(module);
	const data = await dbSimpleSelect(table, `SELECT * FROM (SELECT ${fieldsLogic} ${fromLogic}) as ${table} ${whereLogic} ${sortLogic} ${limitLogic}`);

	const result = {
		total: total? JSON.parse(JSON.stringify(total[0])).total : 0,
		totalNotFiltered: totalNotFiltered,
		rows: data || []
	}

	return result;
}

export { dbCountModuleData, dbSelectModuleData, dbCountMonthModuleData };