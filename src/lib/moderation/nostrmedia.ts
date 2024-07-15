import { logger } from "../logger.js";

const nostrmediaEngine = async (url : string, endpoint: string, apikey : string): Promise<{predicted_label: "safe" | "nude" | "sexy"}> => {

	if (!url || url == "" || !apikey || apikey == "" || !endpoint || endpoint == "") {
		logger.error("ERR -> Moderating file, empty url, apikey or endpoint");
		return {predicted_label: "nude"};
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
	 return {predicted_label: "nude"};
	}
    
	const result = await res.json();
	logger.debug(result);

	return result;

}

export { nostrmediaEngine }