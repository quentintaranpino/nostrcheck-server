import { ResultMessage } from "./server.js";
import { Request } from "express";

interface legacyMediaReturnMessage extends ResultMessage {
	status: string;
	id: string;
	pubkey: string;
	url: string;
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

interface MediaTypeInfo {
    originalMime: string;
    extension: string;
    convertedMime: string;
}

const mediaTypes: MediaTypeInfo[] = [

    { originalMime: "image/png", extension: "webp", convertedMime: "image/webp" },
    { originalMime: "image/jpg", extension: "webp", convertedMime: "image/webp" },
    { originalMime: "image/jpeg", extension: "webp", convertedMime: "image/webp" },
    { originalMime: "image/gif", extension: "webp", convertedMime: "image/webp" },
    { originalMime: "image/webp", extension: "webp", convertedMime: "image/webp" },
    { originalMime: "image/svg+xml", extension: "svg", convertedMime: "image/svg+xml" },


    { originalMime: "video/mp4", extension: "mp4", convertedMime: "video/mp4" },
    { originalMime: "video/quicktime", extension: "mp4", convertedMime: "video/mp4" },
    { originalMime: "video/mpeg", extension: "mp4", convertedMime: "video/mp4" },
    { originalMime: "video/webm", extension: "mp4", convertedMime: "video/mp4" },

    { originalMime: "audio/mpeg", extension: "mp3", convertedMime: "audio/mpeg" },
    { originalMime: "audio/mpg", extension: "mp3", convertedMime: "audio/mpeg" },
    { originalMime: "audio/mpeg3", extension: "mp3", convertedMime: "audio/mpeg" },
    { originalMime: "audio/mp3", extension: "mp3", convertedMime: "audio/mpeg" },

    { originalMime: "application/pdf", extension: "pdf", convertedMime: "application/pdf" },
	{ originalMime: "application/javascript", extension: "js", convertedMime: "application/javascript" },
    { originalMime: "application/json", extension: "json", convertedMime: "application/json" },
    { originalMime: "application/vnd.ms-fontobject", extension: "eot", convertedMime: "application/vnd.ms-fontobject" },
    { originalMime: "application/yaml", extension: "yaml", convertedMime: "application/yaml" },
	{ originalMime: "application/xml", extension: "xml", convertedMime: "application/xml" },

    { originalMime: "font/otf", extension: "otf", convertedMime: "font/otf" },
    { originalMime: "font/ttf", extension: "ttf", convertedMime: "font/ttf" },
    { originalMime: "font/woff", extension: "woff", convertedMime: "font/woff" },
    { originalMime: "font/woff2", extension: "woff2", convertedMime: "font/woff2" },

	{ originalMime: "text/html", extension: "map", convertedMime: "text/html" },
    { originalMime: "text/markdown", extension: "md", convertedMime: "text/markdown" },
    { originalMime: "text/css", extension: "css", convertedMime: "text/css" },
    { originalMime: "text/x-handlebars-template", extension: "hbs", convertedMime: "text/x-handlebars-template" },
    { originalMime: "text/plain", extension: "txt", convertedMime: "text/plain" },
	{ originalMime: "text/yaml", extension: "yaml", convertedMime: "text/yaml" },
];


interface FileData{
	filename: string;
	width: number;
	height: number;
	fileid: string;
	filesize: number;
	pubkey: string;
	originalhash: string;
	hash: string;
	blurhash: string;
	url: string;
	magnet: string;
	torrent_infohash: string;
	date: number;
	servername: string;
	no_transform: boolean;
}

interface ProcessingFileData extends FileData{

	media_type: typeof UploadTypes[number];
	originalmime: string;
	outputoptions: string;
	status: string;
	description: string;
	processing_url: string;
	conversionInputPath: string;
	conversionOutputPath: string;
	newFileDimensions: string;

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
	asyncTask,
	FileData,
	ProcessingFileData,
	legacyMediaReturnMessage,
	MediaVisibilityResultMessage,
	mediaTypes,
	ResultMessage,
	UploadTypes,
	UploadStatus,
	MediaStatus,
	videoHeaderRange
};