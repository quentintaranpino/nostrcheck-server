import path from "path";
import app from "../app.js";
import { ResultMessagev2 } from "../interfaces/server.js";
import { dbInsert, dbMultiSelect, dbUpdate } from "./database.js";
import { logger } from "./logger.js";
import fs from "fs";

const banRecord = async (originId: number, originTable: string, reason: string): Promise<ResultMessagev2> => {

	if (originId == 0 || originId == null || originTable == "" || originTable == null || reason == "" || reason == null) {return {status: "error", message: "Invalid parameters"};}

	const whereFields = [];
    let keyField = "";
	if (originTable == "registered") {
        whereFields.push("hex");
        keyField = "hex";}
	if (originTable == "mediafiles") {
        whereFields.push("original_hash");
        keyField = "original_hash";}

	const result = await dbMultiSelect(whereFields, originTable, "id = ?", [originId], true) as any;
	if (originTable == "registered" && result.hex == app.get("config.server")["pubkey"]) {return {status: "error", message: "You can't ban the server pubkey"};}

    // We need to find all the records with the same original_hash and ban them as well
    const resultRecords = await dbMultiSelect(["id"], originTable, `${keyField} = ?`,[result[0][keyField]], false);
    if (resultRecords.length > 0) {
        for (const record of resultRecords) {

            const resultBanTable = await dbMultiSelect(["active"], "banned", "originid = ? and origintable = ?", [record.id, originTable], false);
            if (resultBanTable.length > 0 && resultBanTable[0].active == 1) {continue;}
            if (resultBanTable.length > 0 && resultBanTable[0].active == 0) {
                const updateResult = await dbUpdate("banned","active", "1", ["originid", "origintable"], [record.id, "mediafiles"]);
                if (updateResult == false) {return {status: "error", message: "Error setting active ban to record"};}
                continue;
            }

            const insertResult = await dbInsert("banned", ["originid", "origintable", "reason"], [record.id, originTable, reason]);
            if (insertResult == 0) {return {status: "error", message: "Error inserting record ban"};}
        }

        return {status: "success", message: `Records with ${keyField} : ${result[keyField]} from table ${originTable} banned successfully`};
    }

    return {status: "error", message: "No records found to ban"};



	// if (deleteMedia){
	// 	const resultMedia = await dbMultiSelect(["id"], "mediafiles", "pubkey = ?", [pubkey], false);
	// 	if (resultMedia.length > 0){
	// 		const deleteMediaResult = await dbDelete("mediafiles", ["pubkey"], [pubkey]);
	// 		if (deleteMediaResult == false) {return {status: "error", message: "Error deleting pubkey's media files"};}
	// 	message += "Pubkey's media files deleted. ";
	// 	}
	// }

	// if (deleteRegistered){
	// 	const resultRegistered = await dbMultiSelect(["id"], "registered", "hex = ?", [pubkey], false);
	// 	if (resultRegistered.length > 0) {
	// 		const deleteRegistered = await dbDelete("registered", ["hex"], [pubkey]);
	// 		if (deleteRegistered == false) {return {status: "error", message: message += "Error deleting pubkey's registered data"};}
	// 		message += "Pubkey's registered data deleted. ";
	// 	}
	// }

}

const isContentBanned = async (id: string, table: string): Promise<boolean> => {

    logger.debug("Checking if content is banned", "|", id, "|", table);

	if (id == "" || table == "") {return true;}
	const result = await dbMultiSelect(["id"], "banned", "originid = ? and origintable = ?", [id, table], false);
	if (result.length == 0) {return false};

    logger.info("Content is banned", "|", id, "|", table);
	return true;

}

const getBannedMediaFile = (): Promise<Buffer> => {
    return new Promise((resolve) => {
        const bannedFilePath = path.normalize(path.resolve(app.get("config.media")["bannedFilePath"]));
        fs.readFile(bannedFilePath, (err, data) => {
            if (err) {
                logger.error(err);
                resolve(Buffer.from(""));
            } else {
                resolve(data);
            }
        });
    });
}

export { banRecord, isContentBanned, getBannedMediaFile };