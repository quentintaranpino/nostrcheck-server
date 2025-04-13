import { ResultMessage, ResultMessagev2 } from "./server.js";
import { Request } from "express";

interface LegacyMediaReturnMessage extends ResultMessage {
	status: string;
	id: string;
	pubkey: string;
	url: string;
	hash: string;
	magnet: string;
	tags: Array<string>;
}

interface MediaInfoReturnMessage extends ResultMessagev2 {
	satoshi: number;
}

const UploadTypes = ["avatar", "banner", "media"];
const UploadStatus = ["pending", "processing", "completed", "failed"];
const MediaStatus = ["success", "error", "processing"];

interface MediaTypeInfo {
    originalMime: string;
    extension: string;
    convertedMime: string;
	convertedExtension?: string;
}

const fileTypes: MediaTypeInfo[] = [

    { originalMime: "image/png", extension: "png", convertedMime: "image/webp", convertedExtension: "webp" },
    { originalMime: "image/jpg", extension: "jpg", convertedMime: "image/webp" , convertedExtension: "webp" },
    { originalMime: "image/jpeg", extension: "jpeg", convertedMime: "image/webp" , convertedExtension: "webp" },
    { originalMime: "image/gif", extension: "gif", convertedMime: "image/webp" , convertedExtension: "webp" },
    { originalMime: "image/webp", extension: "webp", convertedMime: "image/webp" , convertedExtension: "webp" },
    { originalMime: "image/svg+xml", extension: "svg", convertedMime: "image/svg+xml" },

    { originalMime: "video/mp4", extension: "mp4", convertedMime: "video/mp4" , convertedExtension: "mp4" },
    { originalMime: "video/quicktime", extension: "mov", convertedMime: "video/mp4" , convertedExtension: "mp4" },
    { originalMime: "video/mpeg", extension: "mpeg", convertedMime: "video/mp4" , convertedExtension: "mp4" },
    { originalMime: "video/webm", extension: "webm", convertedMime: "video/mp4" , convertedExtension: "mp4" },

    { originalMime: "audio/mpeg", extension: "mp3", convertedMime: "audio/mpeg",  convertedExtension: "mp3" },
    { originalMime: "audio/mpg", extension: "mp3", convertedMime: "audio/mpeg" , convertedExtension: "mp3" },
    { originalMime: "audio/mpeg3", extension: "mp3", convertedMime: "audio/mpeg", convertedExtension: "mp3" },
    { originalMime: "audio/mp3", extension: "mp3", convertedMime: "audio/mpeg" , convertedExtension: "mp3" },

    { originalMime: "application/pdf", extension: "pdf", convertedMime: "application/pdf", convertedExtension: "pdf" },
	{ originalMime: "application/javascript", extension: "js", convertedMime: "application/javascript", convertedExtension: "js" },
    { originalMime: "application/json", extension: "json", convertedMime: "application/json", convertedExtension: "json" },
    { originalMime: "application/vnd.ms-fontobject", extension: "eot", convertedMime: "application/vnd.ms-fontobject" , convertedExtension: "eot" },
    { originalMime: "application/yaml", extension: "yaml", convertedMime: "application/yaml" , convertedExtension: "yaml" },
	{ originalMime: "application/xml", extension: "xml", convertedMime: "application/xml" , convertedExtension: "xml" },

    { originalMime: "font/otf", extension: "otf", convertedMime: "font/otf" , convertedExtension: "otf" },
    { originalMime: "font/ttf", extension: "ttf", convertedMime: "font/ttf" , convertedExtension: "ttf" },
    { originalMime: "font/woff", extension: "woff", convertedMime: "font/woff" , convertedExtension: "woff" },
    { originalMime: "font/woff2", extension: "woff2", convertedMime: "font/woff2" , convertedExtension: "woff2" },

	{ originalMime: "text/html", extension: "map", convertedMime: "text/html" , convertedExtension: "map" },
    { originalMime: "text/markdown", extension: "md", convertedMime: "text/markdown" , convertedExtension: "md" },
    { originalMime: "text/css", extension: "css", convertedMime: "text/css" , convertedExtension: "css" },
    { originalMime: "text/x-handlebars-template", extension: "hbs", convertedMime: "text/x-handlebars-template" , convertedExtension: "hbs" },
    { originalMime: "text/plain", extension: "txt", convertedMime: "text/plain" , convertedExtension: "txt" },
	{ originalMime: "text/yaml", extension: "yaml", convertedMime: "text/yaml" , convertedExtension: "yaml" },

	{ originalMime: "model/stl", extension: "stl", convertedMime: "model/stl" , convertedExtension: "stl" },
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
	date: number;
	no_transform: boolean;
	media_type: typeof UploadTypes[number];
	originalmime: string;
	outputoptions: string;
	status: string;
	description: string;
	processing_url: string;
	conversionInputPath: string;
	conversionOutputPath: string;
	newFileDimensions: string;
	transaction_id: string;
	payment_request: string;
	visibility: number;
	tenant: string;
}

interface MediaJob {
	req: Request;
	filedata: FileData;
}

interface VideoHeaderRange {
	Start: number;
	End: number;
}

export {
	MediaJob,
	FileData,
	LegacyMediaReturnMessage,
	MediaInfoReturnMessage,
	fileTypes,
	ResultMessage,
	UploadTypes,
	UploadStatus,
	MediaStatus,
	VideoHeaderRange,
};