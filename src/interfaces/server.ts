interface ResultMessage {
	result: boolean;
	description: string;
}

interface ResultMessagev2 {
	status: string, 
	message: string,
}

interface ServerStatusMessage extends ResultMessagev2 {
	uptime: string;
	version: string;
}

export { ResultMessage, ResultMessagev2, ServerStatusMessage };