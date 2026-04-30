import axios from "axios";
import { logger } from "./logger.js";
import { getConfig } from "./config/core.js";

interface LatestRelease {
	version: string | null;
	url: string;
}

let cached: LatestRelease | null = null;
let lastFetchTime: number | null = null;
const cacheDuration = 60 * 60 * 1000;

/**
 * Compare two N-segment numeric versions ("0.7.1.0019" vs "0.7.0").
 * Returns 1 if a > b, -1 if a < b, 0 if equal. Missing trailing
 * segments are treated as 0 so "0.7.1" < "0.7.1.0001".
 */
const compareVersions = (a: string, b: string): number => {
	const pa = a.replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
	const pb = b.replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i++) {
		const da = pa[i] ?? 0;
		const db = pb[i] ?? 0;
		if (da !== db) return da < db ? -1 : 1;
	}
	return 0;
};

const getLatestRelease = async (): Promise<LatestRelease> => {
	if (cached && lastFetchTime && (Date.now() - lastFetchTime) < cacheDuration) {
		return cached;
	}
	const source = getConfig(null, ["server", "updateSource"]);
	try {
		const response = await axios.get(source, { timeout: 10000 });
		const tag = (response.data?.tag_name || "").toString();
		const url = (response.data?.html_url || "").toString();
		if (!tag) {
			logger.warn(`getLatestRelease - Empty tag_name in response from ${source}`);
			return { version: null, url: "" };
		}
		cached = { version: tag.replace(/^v/, ""), url };
		lastFetchTime = Date.now();
		return cached;
	} catch (error) {
		logger.error(`getLatestRelease - Cannot fetch latest release from ${source} - ${error}`);
		return { version: null, url: "" };
	}
};

export { getLatestRelease, compareVersions };
