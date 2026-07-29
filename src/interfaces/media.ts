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

type UploadMode = "blossom" | "nip96";

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

    { originalMime: "video/mp4", extension: "mp4", convertedMime: "video/mp4" , convertedExtension: "mp4" },
    { originalMime: "video/quicktime", extension: "mov", convertedMime: "video/mp4" , convertedExtension: "mp4" },
    { originalMime: "video/mpeg", extension: "mpeg", convertedMime: "video/mp4" , convertedExtension: "mp4" },
    { originalMime: "video/webm", extension: "webm", convertedMime: "video/mp4" , convertedExtension: "mp4" },

    { originalMime: "audio/mpeg", extension: "mp3", convertedMime: "audio/mpeg",  convertedExtension: "mp3" },
    { originalMime: "audio/mpg", extension: "mp3", convertedMime: "audio/mpeg" , convertedExtension: "mp3" },
    { originalMime: "audio/mpeg3", extension: "mp3", convertedMime: "audio/mpeg", convertedExtension: "mp3" },
    { originalMime: "audio/mp3", extension: "mp3", convertedMime: "audio/mpeg" , convertedExtension: "mp3" },

    // Only media is accepted by default. svg, html, js, css, fonts, pdf, xml/yaml, json,
    // plain text and stl are deliberately absent: they turn a media server into hosting for
    // a working website — phishing pages and inline scripts on your own origin — and no
    // image classifier can review them. Re-enable any of them from the admin filetypes
    // table if your deployment really needs it.




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
	mimetype: string;
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
	// Reviewed, legal, but kept out of every public listing. Independent from
	// visibility, which stays the uploader's own switch.
	nsfw: number;
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

const faviconPaths: readonly string[] = [
	"/favicon.ico",
	"/favicon-32x32.png",
	"/favicon-16x16.png",
	"/apple-touch-icon.png",
	"/android-chrome-192x192.png",
	"/android-chrome-512x512.png",
	"/site.webmanifest",
	"/favicon.svg",
];

export {
	MediaJob,
	FileData,
	LegacyMediaReturnMessage,
	MediaInfoReturnMessage,
	fileTypes,
	ResultMessage,
	UploadTypes,
	UploadStatus,
	UploadMode,
	MediaStatus,
	VideoHeaderRange,
	faviconPaths
};