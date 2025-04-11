import fastq, { queueAsPromised } from "fastq";
import app from "../../app.js";
import { remoteEngineClassify } from "./remote.js";
import { localEngineClassify } from "./local.js";
import { getFilePath } from "../storage/core.js";
import { emptyModerationCategory, ModerationCategory, ModerationJob } from "../../interfaces/moderation.js";
import { logger } from "../logger.js";
import { dbMultiSelect, dbUpdate } from "../database.js";
import { getFileUrl } from "../media.js";

// Create the fastq queue for moderation tasks
const moderationQueue: queueAsPromised<ModerationJob> = fastq.promise(moderationWorker, 1);

/**
 * Worker function that processes the moderation task.
 * @param task - An object containing the task details.
 * @returns A Promise resolving to a moderationCategory result.
 */
async function moderationWorker(task: ModerationJob): Promise<ModerationCategory> {
  let result: ModerationCategory = emptyModerationCategory;

    const taskData = await dbMultiSelect(["id", task.originTable == "mediafiles" ? "filename" : "content"], task.originTable, "id = ?", [task.originId], true);

    if (app.get("config.media")["mediainspector"]["type"] === "local") {
        const filePath: string = await getFilePath(taskData[0].filename);
        result = await localEngineClassify(filePath);
    } else if (app.get("config.media")["mediainspector"]["type"] === "remote") {
        result = await remoteEngineClassify(
            getFileUrl(taskData[0].filename, undefined, ""),
            app.get("config.media")["mediainspector"]["remote"]["endpoint"],
            app.get("config.media")["mediainspector"]["remote"]["apikey"],
            app.get("config.media")["mediainspector"]["remote"]["secretkey"]
        );
    }

  logger.info(`moderateFile - File moderation result: ${result.description} for file ${taskData[0].filename}`);

  // Update the final status in the database:
  // If result.code === '0', set status to '1' (approved); otherwise, set to '0' (rejected).
  const updateChecked: boolean = await dbUpdate(task.originTable, { checked: result.code === "0" ? "1" : "0" }, ["id"], [task.originId]);
  if (!updateChecked) logger.error(`moderateFile - Failed to update record | ${task.originId}`);

  return result;
}

/**
 * Enqueues a moderation task.
 * Immediately updates the record status to '2' (processing) and enqueues the job.
 *
 * @param url - URL of the file.
 * @param originTable - The database table where the record is stored.
 * @param originId - The ID of the record in the database.
 * @param originDomain - The domain of the file.
 * @returns A Promise resolving to a boolean indicating the moderation task was successfully enqueued.
 */
const moderateFile = async (originTable: string, originId: string): Promise<boolean> => {

    if (app.get("config.media")["mediainspector"]["enabled"] === false) return false;

    // Update the record status to "2" to indicate moderation is in progress
    const updateModerating: boolean = await dbUpdate(originTable, { checked: "2" }, ["id"], [originId]);
    if (!updateModerating) {
        logger.error(`moderateFile - Failed to update record | ${originId}`);
        return false;
    }

    try {
         moderationQueue.push({
            originTable,
            originId,
        });
        logger.info(`moderateFile - ${getModerationQueueLength() + 1} items in moderation queue`);
        return true;
    } catch (error) {
        logger.error("moderateFile - Error processing task in moderation queue", error);
        return false;
    }
};

const getModerationQueueLength = (): number => {
    return moderationQueue.length();
}

export { moderateFile, getModerationQueueLength };