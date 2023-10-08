
enum NIPKinds {
	NIP98 = 27235,
	NIP94 = 1063,
	NIP96 = 10096,
}

interface NIP96file {
    api_url: string,
    download_url: string,
    supported_nips: string[],
    tos_url: string,
    content_types: string[],
    plans: {
        free: {
            name: string,
            is_nip98_required: boolean,
            url: string,
            max_byte_size: number,
            file_expiration: number[],
            image_transformations: string[]
        }
    }
}

interface NIP94_event {
    id : string,
    pubkey: string,
    created_at: string,
    kind: NIPKinds.NIP94,
    tags: [
            ["url", string],
            ["m", string],
            ["x", string],
            ["size", string],
            ["dim",string],
            ["magnet", string],
            ["i", string],
            ["blurhash", string]
    ],
    content: string,
    sig : string,

  }

// interface NIP96_event extends ResultMessage{

// 	nip96: {
// 	  code: typeof UploadResponseCode;
// 	  message: string, //Old description
// 	  // This uses the NIP-94 event format but DO NOT need
// 	  // to fill some fields like "id", "pubkey", "created_at" and "sig"
// 	  //
// 	  // This holds the download url ("url"),
// 	  // the ORIGINAL file hash before server transformations ("ox")
// 	  // and, optionally, all file metadata the server wants to make available
// 	  //
// 	  // nip94_event field is absent if unsuccessful upload
// 	  nip94_event: {
// 		tags: [
// 		  ["url", string],
// 		  [
// 			"ox",
// 			string,
// 			// Server hostname where one can find the
// 			// /.well-known/nostr/nip96.json config resource.
// 			//
// 			// This value is an important hint that clients can use
// 			// to find new NIP-96 compatible file storage servers.
// 			string,
// 		  ],
// 		  // Optional. SHA-256 hash of the saved file after any server transformations.
// 		  // The server can but does not need to store this value.
// 		  ["x", string],
// 		  // Optional
// 		  ["m", string], //MimeType
// 		  MediaExtraDataResultMessage
// 		],
// 		content: ""
// 	  }
// 	}
//   }


export { NIPKinds, NIP96file, NIP94_event };