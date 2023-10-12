import { ResultMessage } from './server.js';

interface ServerStatusMessage extends ResultMessage {
	uptime: string;
	version: string;
}

export { ServerStatusMessage };
