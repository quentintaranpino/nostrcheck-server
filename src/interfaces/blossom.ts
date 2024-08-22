import { ResultMessagev2 } from "./server";

enum BUDKinds {
	BUD01_auth = 24242,
}

interface BUD01_authEvent {
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

interface blobDescriptor extends ResultMessagev2{
    url: string; 
    sha256: string; 
    size: number;
    type?: string; 
    uploaded: number; 
    blurhash: string;
    dim: string;
    payment_request?: string;
}



export { BUDKinds, BUD01_authEvent, blobDescriptor };