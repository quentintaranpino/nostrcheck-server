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
            ["ox", string],
            ["size", string],
            ["dim",string],
            ["magnet", string],
            ["i", string],
            ["blurhash", string]
    ],
    content: string,
    sig : string,

  }

interface NIP96_event{

	  status: string, 
	  message: string,
    processing_url: string,
	  nip94_event : NIP94_event

  }


export { NIPKinds, NIP96file, NIP94_event, NIP96_event};