import { ResultMessage } from './server.js';

interface VerifyResultMessage extends ResultMessage {
	pubkey: string;
}

export { VerifyResultMessage };