import fastq, { queueAsPromised } from "fastq";
import { logger } from "../logger.js";
import { RelayJob, RelayJobAction } from "../../interfaces/relay.js";

const relayWorker = async (task: RelayJob): Promise<number> => {

    logger.info(`relayWorker - Processing ${task.events.length} events`);
    logger.info(`relayWorker - Action: ${task.action}`);

    switch (task.action) {
        case RelayJobAction.STORE:
          break;
        case RelayJobAction.UPDATE:
          break;
        case RelayJobAction.DELETE:
          break;
        default:
          logger.warn("relayWorker - Unknown action");
      }
    
      return 1 //  TODO
   
}

const enqueueRelayTask = async (task: RelayJob): Promise<boolean> => {
    try {
        relayQueue.push(task);
        return true;
    }catch (error) {
        logger.error("enqueueRelayTask - Error processing task in relay queue", error);
        return false;
    }
}

const getRelayQueueLength = () : number => {
    return relayQueue.length();
}

const WORKER_COUNT = 2;
const relayQueue: queueAsPromised<RelayJob> = fastq.promise(relayWorker, WORKER_COUNT);

export { getRelayQueueLength, enqueueRelayTask };