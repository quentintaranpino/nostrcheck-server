import { emptyModerationCategory, moderationCategories, moderationCategory } from "../../interfaces/moderation.js";
import { logger } from "../logger.js";

const remoteEngineClassify = async (url : string, endpoint: string, apikey : string): Promise<moderationCategory> => {

	if (!url || url == "" || !apikey || apikey == "" || !endpoint || endpoint == "") {
		logger.error("ERR -> Moderating file, empty url, apikey or endpoint");
		return emptyModerationCategory;
	}

	let body: { image_url?: string, video_url?: string } = {};
	url.split(".").pop() == "mp4" ? body.video_url = url : body.image_url = url;

	const headers = {
	 'Content-Type': 'application/json',
	 'Authorization': `Bearer ${apikey}`
	};
   
	logger.debug(`Evaluating image/video: ${url}`);

	const res = await fetch(endpoint, {
	 method: 'POST',
	 headers: headers,
	 body: JSON.stringify(body)
	});

	if (!res.ok) {
	 logger.error(`Error evaluating image/video: ${url}`);
	 logger.debug(await res.json());
	 return emptyModerationCategory;
	}
    
	let result = await res.json();
	result = moderationCategories.find(category => category.description.toLowerCase().includes(result.predicted_label.toLowerCase()))
	return result == undefined ? emptyModerationCategory : result;

}

export { remoteEngineClassify }