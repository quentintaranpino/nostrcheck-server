import fastq, { queueAsPromised } from "fastq";
import { remoteEngineClassify } from "./remote.js";
import { localEngineClassify } from "./local.js";
import { getFilePath } from "../storage/core.js";
import { emptyModerationCategory, ModerationCategory, ModerationJob } from "../../interfaces/moderation.js";
import { logger } from "../logger.js";
import { dbMultiSelect, dbUpdate } from "../database/core.js";
import { getFileUrl } from "../media.js";
import { getConfig } from "../config/core.js";
import { logAuditEvent } from "../audit/core.js";

// Create the fastq queue for moderation tasks
const moderationQueue: queueAsPromised<ModerationJob> = fastq.promise(moderationWorker, 1);

/**
 * Worker function that processes the moderation task.
 * @param task - An object containing the task details.
 * @returns A Promise resolving to a moderationCategory result.
 */
async function moderationWorker(task: ModerationJob): Promise<ModerationCategory> {
  let result: ModerationCategory = emptyModerationCategory;

  try {
    const taskData = await dbMultiSelect(["id", task.originTable == "mediafiles" ? "filename" : "content"], task.originTable, "id = ?", [task.originId], true);

    if (!taskData || taskData.length === 0) {
        logger.warn(`moderateFile - Record not found | ${task.originTable}#${task.originId}`);
        return result;
    }

    if (getConfig(task.tenant, ["media", "mediainspector", "type"]) === "local") {
        const filePath: string = await getFilePath(taskData[0].filename);
        result = await localEngineClassify(filePath, task.tenant);
    } else {
        result = await remoteEngineClassify(
            getFileUrl(taskData[0].filename, undefined, ""),
            getConfig(task.tenant, ["media", "mediainspector", "remote", "endpoint"]),
            getConfig(task.tenant, ["media", "mediainspector", "remote", "apikey"]),
            getConfig(task.tenant, ["media", "mediainspector", "remote", "secretkey"]),
        );
    }

    logger.info(`moderateFile - File moderation result: ${result.description} for file ${taskData[0].filename}`);

    // Update the final status in the database:
    // If result.code === '0', set status to '1' (approved); otherwise, set to '0' (rejected).
    const checkedValue = result.code === "0" ? "1" : "0";
    const updateChecked: boolean = await dbUpdate(task.originTable, { checked: checkedValue }, ["id"], [task.originId]);
    if (!updateChecked) logger.error(`moderateFile - Failed to update record | ${task.originId}`);

    // The verdict of a machine on somebody's file. Auditing it is what makes an
    // automatic rejection arguable later: which engine, what it answered, and
    // what it did to the record. "2" is the in-progress value moderateFile wrote
    // before enqueueing this task.
    if (updateChecked) {
        await logAuditEvent({
            eventtype: "classified",
            origintable: task.originTable,
            originid: task.originId,
            actor: "classifier",
            source: "classifier",
            tenant: task.tenant,
            previous_value: "2",
            new_value: checkedValue,
            action: checkedValue === "1" ? "record approved" : "record left unchecked",
            reason: result.description || "",
            details: {code: result.code, description: result.description, engine: getConfig(task.tenant, ["media", "mediainspector", "type"]) || ""},
        });
    }

    return result;
  } catch (error) {
    // Never let the worker reject — fastq with concurrency=1 would stall the
    // entire moderation queue on the first thrown error in production.
    logger.error(`moderateFile - Worker exception on ${task.originTable}#${task.originId}: ${error}`);
    return result;
  }
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
const moderateFile = async (originTable: string, originId: string, tenant: string): Promise<boolean> => {

    if (getConfig(tenant, ["media", "mediainspector", "enabled"]) === false) return false;

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
            tenant
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

/**
 * Returns records left at checked = 2 to pending.
 * The queue lives in memory, so a restart strands whatever was in it.
 *
 * @returns A Promise resolving to the number of records released.
 */
const cleanStuckModeration = async (): Promise<number> => {

    const stuck = await dbMultiSelect(["id"], "mediafiles", "checked = 2", [], false);
    if (stuck.length == 0) return 0;

    let released = 0;
    for (const record of stuck) {
        const update = await dbUpdate("mediafiles", { checked: "0" }, ["id"], [record.id]);
        if (!update) {
            logger.error(`cleanStuckModeration - Failed to release record | ${record.id}`);
            continue;
        }
        released++;
    }

    logger.info(`cleanStuckModeration - Released ${released} record(s) stuck in moderation`);
    return released;
}

export { moderateFile, getModerationQueueLength, cleanStuckModeration };