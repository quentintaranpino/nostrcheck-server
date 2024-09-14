import { Event } from "nostr-tools";
import { userMetadata } from "./nostr";

interface registeredTableResponse {
	usernames: [JSON];
}

interface localUserMetadata extends userMetadata{
	followers : number;
	following : number;
	hostedFiles : number;
	usernames : JSON[];
	pubkey : string;
	npub: string;
	nostr_notes : Event[];
}

export { registeredTableResponse, localUserMetadata };