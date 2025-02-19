import fastq, { queueAsPromised } from "fastq";
import { logger } from "../logger.js";
import { RelayJob } from "../../interfaces/relay.js";
import app from "../../app.js";

const relayWorker = async (task: RelayJob): Promise<unknown> => {
  try {
    logger.info(`RelayWorker - Processing task: ${task.fn.name}`);
    const result = await task.fn(...(task.args || []));
    return result;
  } catch (error) {
    logger.error("genericWorker - Error processing task", error);
    return error;}
}

const enqueueRelayTask = async (task: RelayJob): Promise<boolean> => {
    try {
        const queueLength = getRelayQueueLength();
        if (queueLength > app.get("config.relay")["maxQueueLength"]) {
            logger.debug(`enqueueRelayTask - Relay queue limit reached: ${queueLength}`);
            return false;
        }
        relayQueue.push(task);
        logger.debug(`enqueueRelayTask - Task added to relay queue: ${task.fn.name}, queue length: ${queueLength}`);
        return true;
    }catch (error) {
        logger.error("enqueueRelayTask - Error processing task in relay queue", error);
        return false;
    }
}

const getRelayQueueLength = () : number => {
    return relayQueue.length();
}

const relayWorkers = app.get("config.relay")["workers"]
const relayQueue: queueAsPromised<RelayJob> = fastq.promise(relayWorker, relayWorkers);

export { getRelayQueueLength, enqueueRelayTask, relayWorkers };