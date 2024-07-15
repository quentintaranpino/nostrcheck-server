import app from "../../app.js";
import { logger } from "../logger.js";
import { nostrmediaEngine } from "./nostrmedia.js";

const moderateFile = async (url: string): Promise<{ predicted_label: "safe" | "nude" | "sexy" }> => {

    if(app.get("config.media")["mediainspector"]["type"] == "local") {
        logger.warn(`Local moderation is not supported yet`);
        return { predicted_label: "nude" };
    }
    
    const result = await nostrmediaEngine(url, app.get("config.media")["mediainspector"]["remote"]["endpoint"], app.get("config.media")["mediainspector"]["remote"]["apikey"]);
    return result;
}

export { moderateFile }