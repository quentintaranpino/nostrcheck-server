import { emptyModerationCategory, moderationCategories, ModerationCategory } from "../../interfaces/moderation.js";
import { logger } from "../logger.js";
import { isPublicUrl } from "../security/urls.js";

const REQUEST_TIMEOUT = 30000;

/**
 * Builds the authorization headers for the remote inspector.
 *
 * @param authMode - nb | bearer | basic | none
 * @param accessKey - Access key or user.
 * @param secretKey - Secret key or password.
 * @returns An object with the headers to send.
 */
const buildAuthHeaders = (authMode: string, accessKey: string, secretKey: string): Record<string, string> => {

	if (authMode == "bearer") return {'Authorization': `Bearer ${secretKey != "" ? secretKey : accessKey}`};
	if (authMode == "basic") return {'Authorization': `Basic ${Buffer.from(`${accessKey}:${secretKey}`).toString('base64')}`};
	if (authMode == "none") return {};

	// nostr.build style, the only mode this used to support.
	return {'NB-Access-Key-ID': `${accessKey}`, 'NB-Secret-Key': `${secretKey}`};
}

/**
 * Reads the label out of the provider response.
 * Two known shapes, so a provider that answers otherwise fails loud instead of throwing.
 *
 * @param payload - The parsed response body.
 * @returns The winning label, or empty string if the shape is unknown.
 */
const readLabel = (payload: any): string => {

	if (payload == null || typeof payload != "object") return "";

	if (Array.isArray(payload.predicted_labels) && payload.predicted_labels.length > 0) {
		const best = payload.predicted_labels.reduce((max : any, label: any) => (label?.score || 0) > (max?.score || 0) ? label : max);
		return best?.label ? best.label.toString() : "";
	}

	if (payload.label) return payload.label.toString();

	return "";
}

const remoteEngineClassify = async (url : string, endpoint: string, accessKey : string, secretKey : string, authMode : string = "nb"): Promise<ModerationCategory> => {

	if (!url || url == "" || !endpoint || endpoint == "") {
		logger.error(`remoteEngineClassify - Missing parameters`);
		return emptyModerationCategory;
	}

	if (authMode != "none" && (!accessKey || accessKey == "")) {
		logger.error(`remoteEngineClassify - Missing credentials for authMode: ${authMode}`);
		return emptyModerationCategory;
	}

	// The endpoint comes from the admin panel, so it can point anywhere.
	if (await isPublicUrl(endpoint) == false) {
		logger.error(`remoteEngineClassify - Endpoint is not a public URL: ${endpoint}`);
		return emptyModerationCategory;
	}

	const body: { media_url: string} = {media_url: url};

	const headers = {
		'Content-Type': 'application/json',
		...buildAuthHeaders(authMode, accessKey, secretKey)
	};

	logger.debug(`remoteEngineClassify - Evaluating image/video: ${url}`);

	let payload : any = null;

	try {
		const res = await fetch(endpoint, {
			method: 'POST',
			headers: headers,
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT)
		});

		if (!res.ok) {
			logger.error(`remoteEngineClassify - Remote inspector answered ${res.status} for file ${url}`);
			return emptyModerationCategory;
		}

		payload = await res.json();

	} catch (error) {
		logger.error(`remoteEngineClassify - Error evaluating image/video: ${url} | ${error}`);
		return emptyModerationCategory;
	}

	const resultLabel = readLabel(payload);
	if (resultLabel == "") {
		logger.error(`remoteEngineClassify - Unexpected response shape from remote inspector for file ${url}`);
		return emptyModerationCategory;
	}

	const result = moderationCategories.find(category => category.description.toLowerCase().includes(resultLabel.toLowerCase()));
	if (result == undefined) {
		logger.error(`remoteEngineClassify - Unknown label "${resultLabel}" for file ${url}`);
		return emptyModerationCategory;
	}

	logger.info(`remoteEngineClassify - File moderation result: ${result.description} for file ${url}`);
	return result;

}

export { remoteEngineClassify }
