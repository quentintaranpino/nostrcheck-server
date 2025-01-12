interface ResultMessage {
	result: boolean;
	description: string;
}

interface ResultMessagev2 {
	status: string, 
	message: any,
}

interface ServerStatusMessage extends ResultMessagev2 {
	version?: string;
	uptime?: string;
	latestVersion?: string;
}

export { ResultMessage, ResultMessagev2, ServerStatusMessage };