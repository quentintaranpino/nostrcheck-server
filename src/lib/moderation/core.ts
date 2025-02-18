import app from "../../app.js";
import { remoteEngineClassify } from "./remote.js";
import { localEngineClassify } from "./local.js";
import { getFilePath } from "../storage/core.js";
import { emptyModerationCategory, moderationCategory } from "../../interfaces/moderation.js";
import { logger } from "../logger.js";
import { dbUpdate } from "../database.js";

const moderateFile = async (url: string, originTable: string, originId: string): Promise<moderationCategory> => {

    if (app.get("config.media")["mediainspector"]["enabled"] == false) return emptyModerationCategory;

    let result = emptyModerationCategory;
    let fileName = url.split("/").pop();

    if (!url || url == "" || !fileName || fileName == "") {return result;}

    // Set checked == 2 (Moderating status)
    const updateModerating = await dbUpdate(originTable,{'checked':'2'},['id'], [originId]);
    if(!updateModerating) {
        logger.error(`moderateFile - Failed to update record`, "|", originId);
        return emptyModerationCategory;
    }

    if(app.get("config.media")["mediainspector"]["type"] == "local") {
        let filePath = await getFilePath(fileName);
        result = await localEngineClassify(filePath);
    }

    if(app.get("config.media")["mediainspector"]["type"] == "remote") {
        result = await remoteEngineClassify(    url, 
                                                app.get("config.media")["mediainspector"]["remote"]["endpoint"], 
                                                app.get("config.media")["mediainspector"]["remote"]["apikey"], 
                                                app.get("config.media")["mediainspector"]["remote"]["secretkey"]);
    }
    
    logger.info(`moderateFile - File moderation result: ${result.description} for file ${fileName}`);
    // TODO: Save moderation result to database (maybe tags folder)

    // Update checked status in database
    const updateChecked = await dbUpdate(originTable,{'checked':result.code == '0' ? '1' : '0'},['id'], [originId]);
    if (!updateChecked) {
        logger.error(`moderateFile - Failed to update record`, "|", originId);
        return emptyModerationCategory;
    }

    return result;
}

export { moderateFile }