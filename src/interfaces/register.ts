import { ResultMessagev2 } from './server.js';

interface RegisterResultMessage extends ResultMessagev2 {
	username: string;
	pubkey: string;
	domain: string;
}

interface RegisteredUsernameResult {
	username: string;
	hex: string;
}

export {RegisterResultMessage, RegisteredUsernameResult};
