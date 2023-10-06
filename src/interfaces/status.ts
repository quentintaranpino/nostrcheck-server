import { ResultMessage } from './server.js';

interface StatusResultMessage extends ResultMessage {
	uptime: string;
	version: string;
}

export { StatusResultMessage };
