import { PythonShell } from 'python-shell';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { logger } from '../logger.js';
import { emptyModerationCategory, moderationCategories, moderationCategory } from '../../interfaces/moderation.js';
import app from '../../app.js';

let localModel: any = null;

/**
 * Start the local AI moderation server
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

        logger.info('Starting Local AI moderation server...');

        localModel = await new PythonShell(localModelPath, {
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
const localEngineStop = () =>{
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

	!localModel? await localEngineStart(): null;

    const form = new FormData();
    filePath != "" ? form.append('file', fs.createReadStream(filePath)): null;

    try {
		if (endpoint == "classify"){
        const response = await axios.post(`http://localhost:5000/${endpoint}?model_name=${modelName}`, form, {
            headers: {
                ...form.getHeaders(),
            },
        });
		return response.data.label.toString();
		}
		if (endpoint == "classes"){
			const response = await axios.get(`htt p://localhost:5000/${endpoint}?model_name=${modelName}`);
			response.data != undefined ? response.data : "No classes found";
			return JSON.stringify(response.data);
		}

		return "99:Unknown";

    } catch (error: any) {
        logger.error(`There was an error running the model script: ${error.code}`);
		const result = endpoint == "classify" ? "99:Unknown" : "No classes found";
		return result;
    }
}

/**
 * Classify a file using the local AI moderation server
 * @param {string} filePath - The path to the file to be moderated
 * @returns {Promise<moderationCategory>} The category of the file
 */
const localEngineClassify = async (filePath: string): Promise<moderationCategory> => {

	if (!filePath || filePath == "") {
		logger.error("ERR -> Moderating file, empty file path");
		return emptyModerationCategory;
	}

	// const classes = await localModel(model, "classes");
	// logger.info(`Classes for ${model}:}`);
	// classes.split(',').forEach(cls => logger.info(cls));

    const modelName = app.get("config.media")["mediainspector"]["local"]["modelName"];   
	
	const result = await sendRequest(modelName, "classify", filePath);

    const category = moderationCategories.find(category => 
        category.description.toLowerCase().includes(result.trim().toLowerCase())
    );
	
	return category ? category : emptyModerationCategory;
}

export { localEngineClassify, localEngineStart, localEngineStop }