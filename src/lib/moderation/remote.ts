import { emptyModerationCategory, moderationCategories, moderationCategory } from "../../interfaces/moderation.js";
import { logger } from "../logger.js";

const remoteEngineClassify = async (url : string, endpoint: string, accessKey : string, secretKey : string): Promise<moderationCategory> => {

	if (!url || url == "" || !accessKey || accessKey == "" || !endpoint || endpoint == "" || !secretKey || secretKey == "") {
		logger.error(`remoteEngineClassify - Missing parameters`);
		return emptyModerationCategory;
	}

	let body: { media_url: string} = {media_url: url};

	const headers = {
	 'Content-Type': 'application/json',
	 'NB-Access-Key-ID': `${accessKey}`,
	 'NB-Secret-Key': `${secretKey}`
	};
   
	logger.debug(`remoteEngineClassify - Evaluating image/video: ${url}`);

	const res = await fetch(endpoint, {
	 method: 'POST',
	 headers: headers,
	 body: JSON.stringify(body)
	});

	if (!res.ok) {
	 logger.error(`remoteEngineClassify - Error evaluating image/video: ${url}`);
	 logger.debug(`remoteEngineClassify - ${await res.json()}`);
	 return emptyModerationCategory;
	}
    
	let result = await res.json();
	const resultLabel = result.predicted_labels.reduce((max : any, label: any) => label.score > max.score ? label : max).label;
	result = moderationCategories.find(category => category.description.toLowerCase().includes(resultLabel.toLowerCase()))

	logger.info(`remoteEngineClassify - File moderation result: ${result?.description} for file ${url}`);
	return result == undefined ? emptyModerationCategory : result;

}

export { remoteEngineClassify }