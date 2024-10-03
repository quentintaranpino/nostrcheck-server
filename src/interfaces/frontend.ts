interface registeredTableResponse {
	usernames: [JSON];
}

interface localUserMetadata {
	hostedFiles : number;
	usernames : JSON[];
	pubkey : string;
	npub: string;
}

export { registeredTableResponse, localUserMetadata };