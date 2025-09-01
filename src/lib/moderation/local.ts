import { PythonShell } from 'python-shell';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { logger } from '../logger.js';
import { emptyModerationCategory, moderationCategories, moderationCategory } from '../../interfaces/moderation.js';
import app from '../../app.js';

let localModel: any = null;

/**
 * Start the local AI moderation server using a Python virtual environment
 * @returns {Promise<boolean>}
 */ 
const localEngineStart = async (): Promise<boolean> => {
    return new Promise(async (resolve, reject) => {
        if (localModel) {
            logger.info('Local AI moderation server is already running.');
            resolve(true);
            return;
        }

        const localModelPath = './scripts/moderation/localEngine.py';
        const venvPythonPath = './.venv/bin/python'; 

        logger.info('Starting Local AI moderation server...');

        localModel = await new PythonShell(localModelPath, {
            pythonPath: venvPythonPath,  
            pythonOptions: ['-u'],
        });

        localModel.on('message', (message: any) => {
            logger.info(message);
            logger.info('Local AI moderation server started.');
            resolve(true); 
        });

        localModel.on('error', (err: any) => {
            logger.error('Failed to start Local AI moderation server:', err);
            localModel = null;
            reject(false); 
        });

        localModel.on('close', () => {
            logger.info('Local AI moderation server stopped.');
            localModel = null;
			resolve(false);
        });
    });
};


/* 
* Stop the local AI moderation server
* @returns {void}
*/
const localEngineStop = () => {
    if (!localModel) {
        logger.info('Local AI moderation server is not running.');
        return;
    }

    localModel.terminate();
    localModel = null;
    logger.info('Local AI moderation server stopped.');
}

/**
 * Send a request to the local AI moderation server
 * @param {string} modelName - The name of the model
 * @param {string} endpoint - The endpoint to send the request to
 * @param {string} filePath - The path to the file to be moderated
 * @returns {Promise<string>} The response from the server
 */
const sendRequest = async (modelName: string, endpoint: string,  filePath: string = ""): Promise<string> => {

	!localModel ? await localEngineStart() : null;

    const form = new FormData();
    filePath != "" ? form.append('file', fs.createReadStream(filePath)) : null;

    try {
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
        logger.error(`There was an error running the model script: ${error.code}`);
		const result = endpoint === "classify" ? "99:Unknown" : "No classes found";
		return result;
    }
}

/**
 * Classify a file using the local AI moderation server
 * @param {string} filePath - The path to the file to be moderated
 * @returns {Promise<moderationCategory>} The category of the file
 */
const localEngineClassify = async (filePath: string): Promise<moderationCategory> => {

	if (!filePath || filePath === "") {
		logger.error("ERR -> Moderating file, empty file path");
		return emptyModerationCategory;
	}

    const modelName = app.get("config.media")["mediainspector"]["local"]["modelName"];   
	
	const result = await sendRequest(modelName, "classify", filePath);

    const splitResult = result.split(" ");
    for (let i = 0; i < splitResult.length; i++) {
        const word = splitResult[i];
        for (let j = 0; j < moderationCategories.length; j++) {
            const category = moderationCategories[j];
            if (category.description.includes(word)) {
                return category;
            }
        }
    }
    
    return emptyModerationCategory;
}

export { localEngineClassify, localEngineStart, localEngineStop }
