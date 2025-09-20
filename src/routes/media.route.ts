import { Application } from "express";
import express from "express";
import { uploadMedia, getMedia, deleteMedia, updateMediaVisibility, headMedia, headUpload, getMediaList } from "../controllers/media.js";
import { NIP96Data } from "../controllers/nostr.js";
import { limiter } from "../lib/security/core.js";
import { getConfig, getModuleInfo } from "../lib/config/core.js";
import { multipartUploadMiddleware, rawUploadMiddleware } from "../lib/middleware/upload.js";
import { loadCdnPage } from "../controllers/frontend.js";

export const loadMediaEndpoint = async (app: Application, version:string): Promise<void> => {

	const base = `/api/${version}${getModuleInfo("media", "")?.path}`;

	// PUT (mirror)
	app.put(
		[`${base}/mirror`, `/mirror`],
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
	);
	
	// PUT (Blossom upload)
	app.put(
		[`${base}/upload`, `/upload`],
		limiter(getConfig(null, ["security", "media", "maxUploadsMinute"])),
		rawUploadMiddleware(),
		async (req, res) => { uploadMedia(req,res, version) }
	);

	// HEAD upload (Blossom)
	app.head(
		[`${base}/upload`, `/upload`],
		limiter(), 
		async (req, res) => { headUpload(req,res) } 
	);

	// DELETE (NIP96 & Blossom)
	app.delete(
		[`${base}/:id([a-fA-F0-9]{64})(\\.[a-zA-Z0-9._-]{1,15})?`,`/:id([a-fA-F0-9]{64})(\\.[a-zA-Z0-9._-]{1,15})?`],
		limiter(),
		(req, res) => { deleteMedia(req, res, version); }
	);

	// HEAD file (Blossom)
	app.head(
		[ `${base}/:sha([a-fA-F0-9]{64})(\\.[a-zA-Z0-9._-]{1,15})?`, `/:sha([a-fA-F0-9]{64})(\\.[a-zA-Z0-9._-]{1,15})?`], 
		limiter(1000), 
		headMedia
	);

	// Blossom media list
	app.get(
		[`${base}/list/:pubkey([a-fA-F0-9]{64})`, `/list/:pubkey([a-fA-F0-9]{64})`, `${base}/listpublic`, `${base}/vanity/:pubkey([a-fA-F0-9]{64})`],
		limiter(1000), 
		(req, res) => { getMediaList(req, res) }
	);

	// NIP-96 media list 
	app.get(
		[`${base}`, `/`],
		limiter(1000),
		(req, res, next) => {
			const { page, count } = req.query;
			if (page !== undefined && count !== undefined) 	return getMediaList(req, res);
			return next();
		}
	);

	// GET file
	app.get([`${base}/:param1?/:param2?`, `/media/:param1?/:param2?`, `/:param1([a-fA-F0-9]{64})(.[a-zA-Z0-9._-]{1,15})?(/:param2([a-fA-F0-9]{64})(.[a-zA-Z0-9._-]{1,15})?)?`], 
	limiter(1000),
	(req, res) => {

		// No parameters, load CDN frontend
		if (req.params.param1 == undefined && req.params.param2 == undefined) {

			// Redirect cdn subdomain requests for frontend.
			if (req.hostname.startsWith("cdn.")) {
				return res.redirect(301, `https://${req.hostname.replace(/^cdn\./, "")}/media`);
			}

			// CDN frontend
			loadCdnPage(req, res, version) 
			return;
		}

		// Get media by URL, get Media by ID.
		getMedia(req, res, version);
	});

	// PUT (visibility)
	app.put(`${base}/:fileId/visibility/:visibility`, limiter(), (req, res) => { updateMediaVisibility(req, res, version) } );

	// NIP96 json file
	app.get([`/.well-known/nostr/nip96.json`, `/api/v2/nip96`], limiter(), NIP96Data);

};