import { Application } from "express";
import express from "express";
import { uploadMedia, getMedia, deleteMedia, updateMediaVisibility, headMedia, headUpload } from "../controllers/media.js";
import { NIP96Data } from "../controllers/nostr.js";
import { limiter } from "../lib/security/core.js";
import { getConfig, getModuleInfo } from "../lib/config/core.js";
import { multipartUploadMiddleware, rawUploadMiddleware } from "../lib/middleware/upload.js";

export const loadMediaEndpoint = async (app: Application, version:string): Promise<void> => {

	const base = `/api/${version}${getModuleInfo("media", "")?.path}`;

	// PUT (mirror)
	app.put(
		`${base}/mirror`,
		express.json(),
		limiter(getConfig(null, ["security", "media", "maxUploadsMinute"])),
		async (req, res) => { uploadMedia(req,res, version) }
	  );
	
	// POST (NIP96 upload)
	app.post(
		`${base}`,
		limiter(getConfig(null, ["security", "media", "maxUploadsMinute"])),
		multipartUploadMiddleware(),
		async (req, res) => { uploadMedia(req,res, version) }
	)
	
	// PUT (Blossom upload)
	app.put(
		`${base}/:param1`,
		limiter(getConfig(null, ["security", "media", "maxUploadsMinute"])),
		rawUploadMiddleware(),
		async (req, res) => { uploadMedia(req,res, version) }
	)

	// PUT (Blossom CDN upload)
	app.put(
		`/upload`,
		limiter(getConfig(null, ["security", "media", "maxUploadsMinute"])),
		rawUploadMiddleware(),
		async (req, res) => { uploadMedia(req,res, version) }
	)

	// HEAD upload (Blossom)
	app.head(`${base}/upload`, limiter(), async (req, res) => { headUpload(req,res) } );

	// HEAD upload (Blossom CDN)
	app.head("/upload", limiter(), headUpload); 

	// DELETE
	app.delete(`${base}/:id`, limiter(), (req, res) => { deleteMedia(req,res,version) } );

	// HEAD file (Blossom)
	app.head(`${base}/:param1`, limiter(1000), headMedia);

	// HEAD file (Blossom CDN)
	app.head("/:param1", limiter(1000), headMedia)

	// GET
	app.get(`${base}/:param1?/:param2?`, limiter(1000),	(req, res) => {	getMedia(req, res, version) } );

	// GET root (media)
	app.get("/:param1([a-fA-F0-9]{64}(?:\\.[a-zA-Z0-9._-]{1,15})?)(?:/:param2([a-fA-F0-9]{64}(?:\\.[a-zA-Z0-9._-]{1,15})?))?",
	limiter(1000),
	(req, res) => getMedia(req, res, version)
	);

	// PUT (visibility)
	app.put(`${base}/:fileId/visibility/:visibility`, limiter(), (req, res) => { updateMediaVisibility(req, res, version) } );

	// NIP96 json file
	app.get("/api/v2/nip96", limiter(),NIP96Data);

};