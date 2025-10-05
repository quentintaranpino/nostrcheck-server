import axios from "axios";
import { logger } from "./logger.js";
import { getConfig } from "./config/core.js";

let cachedLatest: string | null = null;
let lastFetchTime: number | null = null;
const cacheDuration = 60 * 60 * 1000; 

const getLatestVersion = async () : Promise<string> => {
	try {
		if (cachedLatest && lastFetchTime && (Date.now() - lastFetchTime) < cacheDuration) {
			return cachedLatest;
		}
		const response = await axios.get(getConfig(null, ["server", "updateSource"]));
		const packageJson = response.data;
		cachedLatest = packageJson.version;
		lastFetchTime = Date.now();
		return cachedLatest || "";

		} catch (error) {
		logger.error(`getLatestVersion - Cannot get latest version from source: ${getConfig(null, ["server", "updateSource"])} - ${error}`);
		return process.env.npm_package_version || "";
		}
};

export { getLatestVersion };