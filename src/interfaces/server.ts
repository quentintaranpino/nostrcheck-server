interface ResultMessage {
	result: boolean;
	description: string;
}

interface ResultMessagev2 {
	status: string, 
	message: any,
}

interface ServerStatusMessage extends ResultMessagev2 {
	uptime: string;
	version: string;
	ramUsage: number;
	cpuUsage: number;
	moderationQueue? : number;
}

interface ServerUpdateMessage extends ResultMessagev2 {
	currentVersion: string;
	latestVersion: string | null;
	updateAvailable: boolean;
	releaseUrl: string;
	checkFailed: boolean;
}

export { ResultMessage, ResultMessagev2, ServerStatusMessage, ServerUpdateMessage };