import { Event } from "nostr-tools";

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
	usernames : JSON[];
	website : string;
	pubkey : string;
	nostr_notes : Event[];
}

export { registeredTableResponse, userMetadata };