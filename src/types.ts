interface ResultMessage {
	result: boolean;
	description: string;
}

interface RegisterResultMessage extends ResultMessage {
    username: string;
	pubkey: string;
	domain: string;
}

interface VerifyResultMessage extends ResultMessage {
	pubkey: string;
}


export { ResultMessage, RegisterResultMessage, VerifyResultMessage};
