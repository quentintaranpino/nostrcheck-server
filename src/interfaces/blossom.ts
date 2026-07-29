import { ResultMessagev2 } from "./server";

enum BUDKinds {
	BUD11_auth = 24242,
	BUD09_report = 1984,
}

interface BUD11_authEvent {
    id: string;
    pubkey: string;
    kind: number;
    content: string;
    created_at: number;
    tags: [
      ["t", string],
      ["x", string],
      ["expiration", string]
    ];
    sig: string;
}

// NIP-56 report event used by BUD-09. Each `x` tag carries a blob sha256 and
// optionally a NIP-56 type ("nudity", "malware", "profanity", "illegal",
// "spam", "other"). The content field is a human-readable explanation.
interface BUD09_reportEvent {
	id: string;
	pubkey: string;
	kind: number;
	content: string;
	created_at: number;
	tags: string[][];
	sig: string;
}

// Allowed NIP-56 report types plus `csam` (treated as the most severe report
// class: covered blobs are auto-hidden until an admin reviews them).
// Anything outside this set is normalised to "other".
const BUD09_reportTypes = ["nudity", "malware", "profanity", "illegal", "spam", "csam", "other"];

interface BlobDescriptor extends ResultMessagev2{
    url: string;
    sha256: string;
    size: number;
    type?: string;
    uploaded: number;
    blurhash: string;
    dim: string;
    payment_request?: string;
    visibility?: number;
    // Extra field, same as visibility. Public listings never carry nsfw blobs, so
    // this only ever reads 1 on the owner's own listing, which is exactly who
    // needs to know.
    nsfw?: number;
}



export { BUDKinds, BUD11_authEvent, BUD09_reportEvent, BUD09_reportTypes, BlobDescriptor };