import { ResultMessagev2 } from "./server";

enum BUDKinds {
	BUD11_auth = 24242,
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
}



export { BUDKinds, BUD11_authEvent, BlobDescriptor };