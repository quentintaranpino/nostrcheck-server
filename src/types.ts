interface ResultMessage {
	result: boolean;
	description: string;
}

interface RegisterResultMessage extends ResultMessage {
    username: string;
	pubkey: string;
	domain: string;
}

interface VerifyResultMessage extends ResultMessage {
	pubkey: string;
}

interface MediaResultMessage extends ResultMessage {
    url: string;
}

const UploadTypes = [
	"avatar",
	"banner",
	"media",
]

const allowedMimeTypes = [
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/mpeg',
    'video/webm',
    'audio/mpeg',
    'audio/mpg',
    'audio/mpeg3',
    'audio/mp3',
];

declare enum NIP98Kind {
	Authorization = 27235,
}

export { ResultMessage,
	     RegisterResultMessage, 
		 VerifyResultMessage, 
		 MediaResultMessage, 
		 UploadTypes,
		 allowedMimeTypes,
		 NIP98Kind};
