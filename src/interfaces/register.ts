import { ResultMessage } from './server.js';

interface RegisterResultMessage extends ResultMessage {
	username: string;
	pubkey: string;
	domain: string;
}

interface RegisteredUsernameResult {
	username: string;
	hex: string;
}

export {RegisterResultMessage, RegisteredUsernameResult};
