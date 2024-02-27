import { ResultMessage } from "./server.js";
import { Request } from "express";

interface MediaResultMessage extends ResultMessage {
	status: string;
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
const MediaStatus = ["success", "error", "processing"];

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
	'png': 'image/png',
	'jpg': 'image/jpeg',
	'jpeg': 'image/jpeg',
	'gif': 'image/gif',
	'mov': 'video/quicktime',
	'mp4': "video/mp4",
  }


interface FileData{
	filename: string;
	width: number;
	height: number;
	fileid: string;
	filesize: number;
	pubkey: string;
	username: string;
	originalhash: string;
	hash: string;
	blurhash: string;
	url: string;
	magnet: string;
	torrent_infohash: string;
}

interface ProcessingFileData extends FileData{

	media_type: typeof UploadTypes[number];
	originalmime: string;
	outputoptions: string;
	status: string;
	description: string;
	servername: string;
	processing_url: string;

}

interface asyncTask {
	req: Request;
	filedata: ProcessingFileData;
}

interface videoHeaderRange {
	Start: number;
	End: number;
}


export {
	allowedMimeTypes,
	asyncTask,
	FileData,
	ProcessingFileData,
	MediaResultMessage,
	MediaExtraDataResultMessage,
	MediaVisibilityResultMessage,
	mime_transform,
	mediaTypes,
	ResultMessage,
	UploadTypes,
	UploadStatus,
	MediaStatus,
	videoHeaderRange
};