import app from "../../app.js";
import { remoteEngineClassify } from "./nostrmedia.js";
import { localEngineClassify } from "./local.js";
import { getFilePath } from "../storage/core.js";
import { emptyModerationCategory, moderationCategory } from "../../interfaces/moderation.js";
import { logger } from "../logger.js";

const moderateFile = async (url: string): Promise<moderationCategory> => {

    let result = emptyModerationCategory;
    let fileName = url.split("/").pop();

    if (!url || url == "" || !fileName || fileName == "") {return result;}

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
    
    logger.info(`File moderation result: ${result.description} for file ${fileName}`);
    // TODO: Save moderation result to database (maybe tags folder)

    return result;
}

export { moderateFile }