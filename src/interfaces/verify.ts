import { ResultMessage } from './server.js';

interface VerifyResultMessage extends ResultMessage {
	pubkey: string;
}

enum eventVerifyTypes {
	valid = 0,
	hashError = -1,
	signatureError = -2,
	malformed = -3,
}

export { VerifyResultMessage, eventVerifyTypes };