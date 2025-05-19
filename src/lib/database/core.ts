import { ConnectionOptions, createPool, Pool, RowDataPacket } from "mysql2/promise";
import { logger } from "../logger.js";
import { getConfig } from "../config/core.js";

let pool: Pool | undefined;
let retry: number = 0;

const connOptions : ConnectionOptions = {
	host: process.env.DATABASE_HOST || getConfig(null, ["database", "host"]),
	user: process.env.DATABASE_USER || getConfig(null, ["database", "user"]),
	password: process.env.DATABASE_PASSWORD || getConfig(null, ["database", "password"]),
	database: process.env.DATABASE_DATABASE || getConfig(null, ["database", "database"]),
	waitForConnections: true,
	connectionLimit: 20,
	connectTimeout: 5000,
	enableKeepAlive: true,
	keepAliveInitialDelay: 60000,
};

const connect = async (source: string): Promise<Pool> => {

	if (pool) {
		try {
			const conn = await pool.getConnection();
			conn.release();
			return pool
		} catch (error) {
			logger.warn("Pool is not functional, recreating...");
			pool = undefined;
		}
	}

	try {
		pool = await createPool(connOptions);

		const conn = await pool.getConnection();
		conn.release();
		logger.info(`Created a new connection pool from ${source}`);
		retry = 0;
		return pool;
	} catch (error) {
		logger.error(`Failed to connect to database: ${error}`);
		retry++;
		if (retry >= 3) {
			logger.fatal("Failed to connect after multiple attempts. Exiting.");
			process.exit(1);
		}

		logger.warn(`Retrying to connect... Attempt ${retry}/3`);
		await new Promise((resolve) => setTimeout(resolve, 10000));
		return await connect(source);
	}

};

/**
 * Updates a record in the database table.
 * 
 * @param tableName - The name of the table to update.
 * @param fields - An object containing the fields to update and their new values (e.g. { field1: value1, field2: value2 }).
 * @param whereFieldName - Array of names of the fields to use in the WHERE clause.
 * @param whereFieldValue - Array of values of the fields to use in the WHERE clause.
 * @returns A Promise that resolves to a boolean indicating whether the update was successful.
 * @async
 */
const dbUpdate = async (
	tableName: string,
	fields: Record<string, any>,
	whereFieldName: string[],
	whereFieldValue: any[]
  ): Promise<boolean> => {
  
	if (whereFieldName.length !== whereFieldValue.length) {
		logger.error(`dbUpdate - whereFieldName and whereFieldValue must have the same length`);
		return false;
	}
  
	const pool = await connect("dbUpdate: " + JSON.stringify(fields) + " | Table: " + tableName);
  
	try {

		const fieldKeys = Object.keys(fields);
		const setClause = fieldKeys.map(key => `${key} = ?`).join(', ');

		const whereClause = whereFieldName.map((field, index) => {
			if (whereFieldValue[index] === "IS NOT NULL" || whereFieldValue[index] === "IS NULL") {
				return `${field} ${whereFieldValue[index]}`;
			} else {
				return `${field} = ?`;
			}
		}).join(' AND ');

		const params = fieldKeys.map(key => fields[key]).concat(whereFieldValue);

		const [result]: any[] = await pool.execute(
		`UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`,
		params
		);

		if (!result) {
			logger.error(`dbUpdate - Error updating ${tableName} table | ${whereFieldName.join(', ')} : ${whereFieldValue.join(', ')} | Fields: ${JSON.stringify(fields)}`);
			return false;
		}

		if (result.affectedRows === 0) {
			logger.warn(`dbUpdate - No rows updated in ${tableName} table | ${whereFieldName.join(', ')} : ${whereFieldValue.join(', ')} | Fields: ${JSON.stringify(fields)}`);
			return false;
		}

		logger.debug(`dbUpdate - Updated ${result.affectedRows} rows in ${tableName} table | ${whereFieldName.join(', ')} : ${whereFieldValue.join(', ')} | Fields: ${JSON.stringify(fields)}`);
		return true;

	} catch (error) {
		logger.error(`Error updating ${tableName} table | ${whereFieldName.join(', ')} : ${whereFieldValue.join(', ')} | Fields: ${JSON.stringify(fields)} with error: ${error}`);
		return false;
	}
};
  
/**
 * Inserts data into the specified table in the database.
 * 
 * @param tableName - The name of the table to insert data into.
 * @param fields - An array of field names in the table.
 * @param values - An array of values to insert into the table.
 * @returns A Promise that resolves to the ID of the inserted record, or 0 if an error occurred.
 */
const dbInsert = async (tableName: string, fields: string[], values: (string | number | boolean)[]): Promise<number> => {

	// Check if fields are not empty
	if (fields.length == 0){
		logger.error(`dbInsert - Error inserting data into ${tableName} table, fields are empty`);
		return 0;
	}

	const pool = await connect("dbInsert:" + tableName);
	try{
		const [dbFileInsert] = await pool.execute(
			"INSERT INTO " + tableName + " (" + fields.join(", ") + ") VALUES (" + Array(fields.length).fill("?").join(", ") + ")",
			values
		);
		if (!dbFileInsert) {
			logger.error(`dbInsert - Error inserting data into ${tableName} table | Fields: ${fields.join(", ")} | Values: ${values.join(", ")}`);
			return 0;
		}

		logger.debug(`dbInsert - Inserted record into ${tableName}`,"with id:", JSON.parse(JSON.stringify(dbFileInsert)).insertId )
		return JSON.parse(JSON.stringify(dbFileInsert)).insertId;
	} catch (error) {
		logger.error("Error inserting data into " + tableName + " table");
		logger.debug(error, "Fields:", fields.join(", "), "Values:", values.join(", "));
		return 0;
	}
}

/**
 * Executes a SELECT SQL query on a database and returns the specified field from the first row of the result.
 * @param {string} queryStatement - The SQL query to be executed.
 * @param {string} returnField - The field to be returned from the first row of the result.
 * @param {string[]} whereFields - The fields to be used in the WHERE clause of the SQL query.
 * @param {boolean} [onlyFirstResult=true] - A boolean indicating whether to return only the first result from the query or all results.
 * @returns {Promise<string>} A promise that resolves to the value of the specified return field from the first row of the result, or an empty string if an error occurs or if the result is empty.
 */
const dbSelect = async (queryStatement: string, returnField :string, whereFields: string[], onlyFirstResult = true): Promise<string | string[]> => {

	const pool = await connect("dbSimpleSelect: " + queryStatement + " | Fields: " + whereFields.join(", "));

    try {
        const [rows] = await pool.execute<RowDataPacket[]>(queryStatement, whereFields);
        if (onlyFirstResult){
            return rows[0]?.[returnField] as string || "";
        }
        const result = rows.map(row => row[returnField] as string);
		logger.debug(`dbSelect - Retrieved ${returnField} from database`);
        return result;
        
    } catch (error) {
		logger.error(`dbSelect - Error getting ${returnField} from database with error: ${error}`);
        return "";
    }
}

/**
/  * Executes a SELECT SQL query on a database and returns the specified fields from the result.
/  * @param {string[]} queryFields - The fields to be selected from the table.
/  * @param {string} fromStatement - The table (or tables) to select data from.
/  * @param {string} whereStatement - The WHERE and ORDER clause of the SQL query.
/  * @param {string[]} whereFields - The fields to be used in the WHERE clause of the SQL query.
/  * @param {boolean} [onlyFirstResult=true] - A boolean indicating whether to return only the first result from the query or all results.
/  * @param {string} [limitClause=""] - The LIMIT clause of the SQL query.
/  * @returns {Promise<any[]>} A promise that resolves to an array of objects containing the specified fields from the result, or an empty array if an error occurs or if the result is empty.
*/
const dbMultiSelect = async (queryFields: string[], fromStatement: string, whereStatement: string, whereFields: any[], onlyFirstResult = true, limitClause = ""): Promise<any[]> => {

    if (queryFields.length === 0){
		logger.error(`dbMultiSelect - Error getting data from database, queryFields are empty`);
        return [];
    }

	const pool = await connect("dbMultiSelect: " + queryFields.join(',') + " | Fields: " + whereFields.join(", "));
    try {
        const [rows] = await pool.execute<RowDataPacket[]>(`SELECT ${queryFields.join(',')} FROM ${fromStatement} WHERE ${whereStatement} ${limitClause}`, whereFields);
        if (onlyFirstResult){
            if (rows.length > 0) {
                return [rows[0]];
            }
        } else {
			logger.debug(`dbMultiSelect - Retrieved ${queryFields.join(',')} from database`);
            return rows;
        }
        return [];

    } catch (error) {
		logger.error(`dbMultiSelect - Error getting ${queryFields.join(',')} from database with error: ${error}`);
        return [];
    }
}

/**
/* Executes a SELECT SQL query on a database and returns the result.
/* @param {string} table - The name of the table to select data from.
/* @param {string} query - The SQL query to be executed.
/* @param {string} extraCommand - Additional command to be sent to the database (e.g. "SET SESSION group_concat_max_len = 4194304;").
/* @returns {Promise<string>} A promise that resolves to the result of the query, or an empty string if an error occurs or if the result is empty.
 */
const dbSimpleSelect = async (table:string, query:string, extraCommand : string = ""): Promise<string> =>{

	const pool = await connect("dbSimpleSelect " + table);

	try{
		if (extraCommand != "") {
			await pool.execute(extraCommand);
		}
		const [dbResult] = await pool.execute(query);
		const rowstemp = JSON.parse(JSON.stringify(dbResult));
		if (rowstemp[0] == undefined || rowstemp[0] == "") {
			return "";
		}else{
			logger.debug(`dbSimpleSelect - Retrieved data from ${table}`);
			return rowstemp;
		}
	} catch (error) {
		logger.error(`dbSimpleSelect - Error getting data from ${table} with error: ${error}`);
		return "";
	} 
}

/**
 * Deletes records from a specified table in the database where the specified conditions are met.
 *
 * @param tableName - The name of the table from which records will be deleted.
 * @param whereFieldNames - An array of field names that will be used in the WHERE clause of the DELETE query.
 * @param whereFieldValues - An array of corresponding values for the field names in `whereFieldNames` that will be used in the WHERE clause of the DELETE query.
 * @returns A Promise that resolves to a boolean. The Promise will resolve to `true` if the deletion was successful, and `false` otherwise.
 */
const dbDelete = async (tableName :string, whereFieldNames :string[], whereFieldValues: string[]): Promise<boolean> =>{
	
	// Check if wherefieldValue is not empty
	if (whereFieldValues.length == 0){
		logger.error(`dbDelete - Error deleting data from ${tableName} table, whereFieldValue is empty`);
		return false;
	}

	const pool = await connect("dbDelete:" + tableName);

	try{
		const [dbFileDelete] = await pool.execute(
			"DELETE FROM " + tableName + " WHERE " + whereFieldNames.join(" = ? and ") + " = ?",
			[...whereFieldValues]
		);
		if (!dbFileDelete) {
			logger.error(`dbDelete - Error deleting data from ${tableName} table | Fields: ${whereFieldNames.join(", ")} | Values: ${whereFieldValues.join(", ")}`);
			return false;
		}
		return true;
	} catch (error) {
		logger.error(`dbDelete - Error deleting data from ${tableName} table with error: ${error}`);
		return false;
	}
}

/**
 * Inserts or updates a record in the specified table in the database.
 * @param {string} tableName - The name of the table to insert or update the record in.
 * @param {Record<string, string | number | boolean | null>} data - An object containing the data to be inserted or updated in the table.
 * @returns {Promise<number>} A promise that resolves to the ID of the inserted or updated record, or 0 if an error occurred.
 * @async
 */
const dbUpsert = async (tableName: string, data: Record<string, string | number | boolean | null>, uniqueKeys: string[]): Promise<number> => {

	const columns = Object.keys(data);
	if (columns.length === 0) {
		logger.error("Error in dbUpsert: no columns provided for table", tableName);
		return 0;
	}

	const placeholders = columns.map(() => "?").join(", ");

	const updateAssignmentsBase = columns
		.filter(col => !uniqueKeys.includes(col))
		.filter(col => col !== "id")
		.map(col => `${col} = VALUES(${col})`)
		.join(", ");

	const updateAssignments = `id = LAST_INSERT_ID(id)` + (updateAssignmentsBase ? `, ${updateAssignmentsBase}` : "");

    const sql = `
        INSERT INTO ${tableName} (${columns.join(", ")})
        VALUES (${placeholders})
        ON DUPLICATE KEY UPDATE ${updateAssignments}
    `;

	const values = columns.map(col => data[col]);
	const pool = await connect("dbUpsert:" + tableName);

	try {
		const [result] = await pool.execute(sql, values);

		const resObj = JSON.parse(JSON.stringify(result));
		logger.debug(`dbUpsert - Upserted record into ${tableName} with id:`, resObj.insertId);

		return resObj.insertId || 0;

	} catch (error) {
		logger.error(`dbUpsert - Error upserting record into ${tableName} with error:`, error);
		return 0;
	} 
}

/**
 * Inserts multiple records into the specified table in the database.
 * @param {string} table - The name of the table to insert the records into.
 * @param {string[]} columns - An array of column names in the table.
 * @param {any[][]} valuesArray - An array of arrays containing the values to insert into the table.
 * @returns {Promise<number>} A promise that resolves to the number of records inserted, or 0 if an error occurred.
 */
const dbBulkInsert = async (table: string, columns: string[], valuesArray: any[][]): Promise<number> => {

	if (valuesArray.length === 0) return 0;

  const pool = await connect("bulkInsert:" + table);
  const placeholdersPerRow = columns.length;
  const maxRowsPerChunk = Math.floor(1000 / Math.max(1, placeholdersPerRow));
  let totalInserted = 0;

  for (let i = 0; i < valuesArray.length; i += maxRowsPerChunk) {
    const chunk = valuesArray.slice(i, i + maxRowsPerChunk);

    const placeholders = chunk
      .map(() => "(" + Array(placeholdersPerRow).fill("?").join(", ") + ")")
      .join(", ");

    const sql = `INSERT IGNORE INTO ${table} (${columns.join(", ")}) VALUES ${placeholders}`;
    const values = chunk.flat();

    try {
      const [result]: any = await pool.execute(sql, values);
      totalInserted += result.affectedRows;
      logger.debug(`bulkInsert - Inserted ${result.affectedRows} records into ${table}`);
    } catch (error) {
      logger.error(`dbBulkInsert - Error inserting records into ${table} with error: ${error}`);
    }
  }

  return totalInserted;
};

export {
	connect, 
	dbSelect,
	dbUpdate,
	dbDelete,
	dbMultiSelect,
	dbSimpleSelect,
	dbInsert,
	dbUpsert,
	dbBulkInsert
};