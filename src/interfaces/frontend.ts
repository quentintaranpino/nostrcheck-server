interface registeredTableResponse {
	usernames: [JSON];
}

interface userMetadata {
	about : string;
	banner : string;
	display_name : string;
	followers : number;
	following : number;
	lud16 : string;
	mediaFiles : string[];
	name : string;
	nip05 : string;
	picture : string;
	username : string;
	website : string;
	pubkey : string;
}

export { registeredTableResponse, userMetadata };