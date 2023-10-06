import { ResultMessage } from "./server.js";
import { Request } from "express";

interface MediaResultMessage extends ResultMessage {
	status: typeof UploadStatus;
	id: string;
	pubkey: string;
	url: string;
}

interface MediaExtraDataResultMessage extends MediaResultMessage {
	hash: string;
	magnet: string;
	tags: Array<string>;
}

interface MediaVisibilityResultMessage extends ResultMessage {
	id: string;
	visibility: string;
}

const UploadTypes = ["avatar", "banner", "media"];
const UploadStatus = ["pending", "processing", "completed", "failed"];

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

const mime_transform: { [key: string]: string } = {
	"image/png"			: "webp",
	"image/jpg"			: "webp",
	"image/jpeg"		: "webp",
	"image/gif"			: "webp",
	"image/webp"		: "webp",
	"video/mp4"			: "mp4",
	"video/quicktime"	: "mp4",
	"video/mpeg"		: "mp4",
	"video/webm"		: "mp4",
	"audio/mpeg"		: "mp3",
	"audio/mpg"			: "mp3",
	"audio/mpeg3"		: "mp3",
	"audio/mp3"			: "mp3",
};

const mediaTypes: { [key: string]: string } = {
	'webp': 'image/webp',
	'mp4': "video/mp4",
  }

  interface ConvertFilesOpions {
	id: string;
	username: string;
	width: number;
	height: number;
	uploadtype: typeof UploadTypes;
	originalmime: string;
	outputmime: string;
	outputname: string;
	outputoptions: string;
}

interface asyncTask {
	req: Request;
	fileoptions: ConvertFilesOpions;
}


export {
	allowedMimeTypes,
	asyncTask,
	ConvertFilesOpions,
	MediaResultMessage,
	MediaExtraDataResultMessage,
	MediaVisibilityResultMessage,
	mime_transform,
	mediaTypes,
	ResultMessage,
	UploadTypes,
	UploadStatus,
};