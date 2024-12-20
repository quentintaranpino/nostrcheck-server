interface registeredTableResponse {
	usernames: [JSON];
}

interface localUserMetadata {
	hostedFiles : number;
	usernames : JSON[];
	pubkey : string;
	npub: string;
	lud16: string;
}

export { registeredTableResponse, localUserMetadata };