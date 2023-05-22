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
	visibility: string;
	id: string;
}

const UploadTypes = ["avatar", "banner", "media"];
const UploadVisibility = ["public", "private"];

const allowedMimeTypes = [
	"image/png",
	"image/jpg",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"video/mp4",
	"video/quicktime",
	"video/mpeg",
	"video/webm",
	"audio/mpeg",
	"audio/mpg",
	"audio/mpeg3",
	"audio/mp3",
];

const mime_transform : {[key: string]: string} = {
	'image/png'       : 'webp',
	'image/jpg'       : 'webp',
	'image/jpeg'      : 'webp',
	'image/gif'       : 'gif', 
	'image/webp'      : 'webp',
	'video/mp4'       : 'mp4', 
	'video/quicktime' : 'mp4', 
	'video/mpeg'      : 'mp4',
	'video/webm'      : 'mp4', 
	'audio/mpeg'      : 'mp3', 
	'audio/mpg'       : 'mp3', 
	'audio/mpeg3'     : 'mp3',
	'audio/mp3'       : 'mp3'
};

declare enum NIP98Kind {
	Authorization = 27235,
}

export {
	allowedMimeTypes,
	MediaResultMessage,
	NIP98Kind,
	RegisterResultMessage,
	ResultMessage,
	UploadTypes,
	UploadVisibility,
	VerifyResultMessage,
	mime_transform
};
