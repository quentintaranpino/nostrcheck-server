import { PythonShell } from 'python-shell';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { logger } from '../logger.js';
import { emptyModerationCategory, moderationCategories, ModerationCategory } from '../../interfaces/moderation.js';
import { extractVideoFrames } from '../media.js';
import { deleteLocalFile } from '../storage/local.js';
import { getModerationQueueLength } from './core.js';
import { getConfig } from '../config/core.js';

let localModel: PythonShell | null = null;

/**
 * Start the local AI moderation server using a Python virtual environment
 * @returns {Promise<boolean>}
 */ 
const localEngineStart = async (): Promise<boolean> => {
    return new Promise( (resolve, reject) => {

        const localModelPath = './scripts/moderation/localEngine.py';
        const venvPythonPath = process.platform === "win32" ? ".\\.venv\\Scripts\\python.exe" : "./.venv/bin/python";

        if (localModel) {
            logger.debug(`localEngineStart - Local AI moderation server is already running.`);
            resolve(true);
            return;
        }

        if (!fs.existsSync(localModelPath)) {
            logger.error(`localEngineStart - Local AI moderation server script not found: ${localModelPath}`);
            reject(false);
            return;
        }
        if (!fs.existsSync(venvPythonPath)) {
            logger.error(`localEngineStart - Python virtual environment not found: ${venvPythonPath}`);
            reject(false);
            return;
        }

        logger.debug(`localEngineStart - Starting local AI moderation server using Python virtual environment: ${venvPythonPath}`);

        try{
            localModel =  new PythonShell(localModelPath, {
                pythonPath: venvPythonPath,  
                pythonOptions: ['-u'],
            });
        } catch (error) {
            logger.error(`localEngineStart - Failed to start local AI moderation server: ${error}`);
            reject(false);
            return;
        }


        localModel.on('message', (message) => {
            logger.debug(`localEngineStart - ${message}`);
            logger.debug(`localEngineStart - Local AI moderation server started successfully.`);
            resolve(true); 
            return;
        });

        localModel.on('error', (err) => {
            logger.error(`localEngineStart - Local AI moderation server failed to start with error: ${err}`);
            localModel = null;
            reject(false); 
            return;
        });

        localModel.on('close', () => {
            logger.debug('localEngineStart - Local AI moderation server stopped.');
            localModel = null;
			resolve(false);
            return;
        });
    });
};

/* 
* Stop the local AI moderation server
* @returns {void}
*/
const localEngineStop = () => {
    if (!localModel) {
        logger.debug(`localEngineStop - AI server already stopped.`);
        return;
    }
    try {
        localModel.terminate();
    } catch (e) {
        logger.error(`localEngineStop - Error terminating server: ${e}`);
    } finally {
        localModel = null;
        logger.debug(`localEngineStop - Local AI moderation server stopped.`);
    }
};

/**
 * Send a request to the local AI moderation server
 * @param {string} modelName - The name of the model
 * @param {string} endpoint - The endpoint to send the request to
 * @param {string} filePath - The path to the file to be moderated
 * @returns {Promise<string>} The response from the server
 */
const sendRequest = async (modelName: string, endpoint: string,  filePath: string = ""): Promise<string> => {

    try{
        
        if (!localModel) {
            const initLocalModel = await localEngineStart();
            if (!initLocalModel) {
                logger.error(`sendRequest - Local AI moderation server is not running.`);
                return "99:Unknown";
            }
        }

        const form = new FormData();

        filePath != "" ? form.append('file', fs.createReadStream(filePath)) : null;

        logger.debug(`sendRequest - Sending request to local AI moderation server: ${endpoint}`);

		if (endpoint === "classify"){
			const response = await axios.post(`http://localhost:3001/${endpoint}?model_name=${modelName}`, 
                form,
                {
                    headers: {...form.getHeaders()},
                    timeout: 60000 
                }
            );
			return response.data ? response.data.label.toString() : "99:Unknown";
		}
        if (endpoint === "classes") {
            const response = await axios.get(
                `http://localhost:3001/${endpoint}?model_name=${modelName}`,
                {
                    timeout: 60000,
                }
            );
            return response.data ? JSON.stringify(response.data) : "No classes found";
        }

		return "99:Unknown";

    } catch (error) {
        if (error instanceof AggregateError) {
            error.errors.forEach(err => logger.error(`sendRequest - Error: ${err}`));
        } else {
            logger.error(`sendRequest - There was an error running the model script: ${error}`);
        }
        // Stop the local model if it fails.
        localEngineStop();
        return endpoint === "classify" ? "99:Unknown" : "No classes found";
    }
}

const parseResult = (result: string): ModerationCategory => {
    const splitResult = result.split(" ");
    for (let i = 0; i < splitResult.length; i++) {
        const word = splitResult[i];
        for (let j = 0; j < moderationCategories.length; j++) {
            const category = moderationCategories[j];
            if (category.description.toLowerCase().includes(word.toString().toLowerCase())) {
                return category;
            }
        }
    }
    return emptyModerationCategory;
}

/**
 * Classify a file using the local AI moderation server
 * @param {string} filePath - The path to the file to be moderated
 * @returns {Promise<moderationCategory>} The category of the file
 */
const localEngineClassify = async (filePath: string, tenant: string): Promise<ModerationCategory> => {

	if (!filePath || filePath === "") {
		logger.error(`localEngineClassify - File path is empty`);
		return emptyModerationCategory;
	}

    const modelName = getConfig(tenant, ["media", "mediainspector", "local", "modelName"]);
    let moderationResult : string = "";

    const fileExtension = filePath.split('.').pop();

    // Video files need to be split into frames and each frame needs to be moderated
    if (fileExtension == 'mp4' || fileExtension == 'webm' || fileExtension == 'mov') {
        const frames = await extractVideoFrames(filePath, getConfig(tenant, ["storage", "local", "tempPath"]));
        if (frames.length == 0) return emptyModerationCategory;
        let unsafeFrames = 0;
        for (const f of frames) {
            const reqResult = await sendRequest(modelName, "classify", f);
            const frameResult = parseResult(reqResult);
            if (frameResult.code != '0') unsafeFrames++;
            const deleteFrame = await deleteLocalFile(f);
            if (!deleteFrame) logger.error(`localEngineClassify - Failed to delete video frame: ${f}`);
        }

        if (unsafeFrames > 0) {
            return { code: '2', description: 'UNSAFE' };
        } else {
            return { code: '0', description: 'SAFE' };
        }
    }
    
    // Image files can be moderated directly
    moderationResult = await sendRequest(modelName, "classify", filePath);

    logger.info(`localEngineClassify - File moderation result: ${moderationResult}`);

    // Stop the local model after 30 seconds of inactivity
    if (getModerationQueueLength() == 0) {
        setTimeout(async () => {
            if (getModerationQueueLength() === 0) {
                await localEngineStop();
            }
        }, 30000);
    }

    return parseResult(moderationResult);
}




export { localEngineClassify}
