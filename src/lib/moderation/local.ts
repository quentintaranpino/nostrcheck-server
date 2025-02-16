import { PythonShell } from 'python-shell';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { logger } from '../logger.js';
import { emptyModerationCategory, moderationCategories, moderationCategory } from '../../interfaces/moderation.js';
import app from '../../app.js';
import { extractVideoFrames } from '../media.js';

let localModel: any = null;

/**
 * Start the local AI moderation server using a Python virtual environment
 * @returns {Promise<boolean>}
 */ 
const localEngineStart = async (): Promise<boolean> => {
    return new Promise(async (resolve, reject) => {

        const localModelPath = './scripts/moderation/localEngine.py';
        const venvPythonPath = process.platform === "win32" ? ".\\.venv\\Scripts\\python.exe" : "./.venv/bin/python";

        if (localModel) {
            logger.info(`localEngineStart - Local AI moderation server is already running.`);
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

        logger.info(`localEngineStart - Starting local AI moderation server using Python virtual environment: ${venvPythonPath}`);

        try{
            localModel = await new PythonShell(localModelPath, {
                pythonPath: venvPythonPath,  
                pythonOptions: ['-u'],
            });
        } catch (error: any) {
            logger.error(`localEngineStart - Failed to start local AI moderation server: ${error.code}`);
            reject(false);
            return;
        }


        localModel.on('message', (message: any) => {
            logger.info(`localEngineStart - ${message}`);
            logger.info(`localEngineStart - Local AI moderation server started successfully.`);
            resolve(true); 
            return;
        });

        localModel.on('error', (err: any) => {
            logger.error(`localEngineStart - Local AI moderation server failed to start with error: ${err}`);
            localModel = null;
            reject(false); 
            return;
        });

        localModel.on('close', () => {
            logger.info('localEngineStart - Local AI moderation server stopped.');
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
        logger.info(`localEngineStop - Local AI moderation server stopped.`);
        return;
    }

    localModel.terminate();
    localModel = null;
    logger.info(`localEngineStop - Local AI moderation server stopped.`);
}

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
			const response = await axios.post(`http://localhost:3001/${endpoint}?model_name=${modelName}`, form, {
				headers: {
					...form.getHeaders(),
				},
			});
			return response.data.label.toString();
		}
		if (endpoint === "classes"){
			const response = await axios.get(`http://localhost:3001/${endpoint}?model_name=${modelName}`);
			return response.data ? JSON.stringify(response.data) : "No classes found";
		}

		return "99:Unknown";

    } catch (error: any) {
        logger.error(`sendRequest - There was an error running the model script: ${error.code}`);
		const result = endpoint === "classify" ? "99:Unknown" : "No classes found";
		return result;
    }
}

const parseResult = (result: string): moderationCategory => {
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
const localEngineClassify = async (filePath: string): Promise<moderationCategory> => {

	if (!filePath || filePath === "") {
		logger.error(`localEngineClassify - File path is empty`);
		return emptyModerationCategory;
	}

    const modelName = app.get("config.media")["mediainspector"]["local"]["modelName"];   
    let moderationResult : string = "";

    const fileExtension = filePath.split('.').pop();

    // Video files need to be split into frames and each frame needs to be moderated
    if (fileExtension == 'mp4' || fileExtension == 'webm' || fileExtension == 'mov') {
        const frames = await extractVideoFrames(filePath, app.get("config.storage")["local"]["tempPath"], 1);
        if (frames.length == 0) return emptyModerationCategory;
        let unsafeFrames = 0;
        for (const f of frames) {
            const reqResult = await sendRequest(modelName, "classify", f);
            const frameResult = parseResult(reqResult);
            if (frameResult.code != '0') unsafeFrames++;
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

    return parseResult(moderationResult);
}




export { localEngineClassify, localEngineStart, localEngineStop }
