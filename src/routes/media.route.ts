import { Application } from "express";
import express from "express";
import { uploadBlossom, uploadNip96, getMedia, deleteMedia, updateMediaVisibility, headMedia, headUpload, getMediaList, reportBlob } from "../controllers/media.js";
import { NIP96Data } from "../controllers/nostr.js";
import { limiter } from "../lib/security/core.js";
import { getConfig, getModuleInfo } from "../lib/config/core.js";
import { multipartUploadMiddleware, rawUploadMiddleware } from "../lib/middleware/upload.js";
import { loadCdnPage } from "../controllers/frontend.js";

export const loadMediaEndpoint = async (app: Application, version:string): Promise<void> => {

	const base = `/api/${version}${getModuleInfo("media", "")?.path}`;
	// Root-level routes (/upload, /mirror, /media, ...) are exclusive to v2.
	// Otherwise v1 (loaded first) wins the match in Express and the modern
	// Blossom flow never gets to run.
	const isV2 = version === "v2";
	const withRoot = (paths: string[]) => isV2 ? paths : paths.filter(p => p.startsWith(`${base}`));

	// PUT (mirror)
	app.put(
		withRoot([`${base}/mirror`, `/mirror`]),
		express.json(),
		limiter(getConfig(null, ["security", "media", "maxUploadsMinute"])),
		async (req, res) => { uploadBlossom(req, res, version) }
	);

	// POST (NIP96 upload)
	app.post(
		`${base}`,
		limiter(getConfig(null, ["security", "media", "maxUploadsMinute"])),
		multipartUploadMiddleware(),
		async (req, res) => { uploadNip96(req, res, version) }
	);

	// PUT (Blossom upload)
	app.put(
		withRoot([`${base}/upload`, `/upload`]),
		limiter(getConfig(null, ["security", "media", "maxUploadsMinute"])),
		rawUploadMiddleware(),
		async (req, res) => { uploadBlossom(req, res, version) }
	);

	// PUT (Blossom BUD-05 media upload). Auth event must carry t=media.
	app.put(
		withRoot([`${base}`, `/media`]),
		limiter(getConfig(null, ["security", "media", "maxUploadsMinute"])),
		rawUploadMiddleware(),
		async (req, res) => { uploadBlossom(req, res, version) }
	);

	// HEAD upload (Blossom)
	app.head(
		withRoot([`${base}/upload`, `/upload`]),
		limiter(),
		async (req, res) => { headUpload(req,res) }
	);

	// HEAD media (Blossom BUD-05 pre-flight). Same validation as HEAD /upload.
	app.head(
		withRoot([`${base}`, `/media`]),
		limiter(),
		async (req, res) => { headUpload(req,res) }
	);

	// PUT report (Blossom BUD-09)
	app.put(
		withRoot([`${base}/report`, `/report`]),
		express.json(),
		limiter(),
		async (req, res) => { reportBlob(req, res) }
	);

	// DELETE (NIP96 & Blossom)
	app.delete(
		withRoot([`${base}/:id([a-fA-F0-9]{64})(\\.[a-zA-Z0-9._-]{1,15})?`,`/:id([a-fA-F0-9]{64})(\\.[a-zA-Z0-9._-]{1,15})?`]),
		limiter(),
		(req, res) => { deleteMedia(req, res, version); }
	);

	// HEAD file (Blossom)
	app.head(
		withRoot([ `${base}/:sha([a-fA-F0-9]{64})(\\.[a-zA-Z0-9._-]{1,15})?`, `/:sha([a-fA-F0-9]{64})(\\.[a-zA-Z0-9._-]{1,15})?`]),
		limiter(1000),
		headMedia
	);

	// Blossom media list
	app.get(
		withRoot([`${base}/list/:pubkey([a-fA-F0-9]{64})`, `/list/:pubkey([a-fA-F0-9]{64})`, `${base}/listpublic`, `${base}/vanity/:pubkey([a-fA-F0-9]{64})`]),
		limiter(1000),
		(req, res) => { getMediaList(req, res) }
	);

	// NIP-96 media list
	app.get(
		withRoot([`${base}`, `/`]),
		limiter(1000),
		(req, res, next) => {
			const { page, count, before } = req.query;
			if (page !== undefined || count !== undefined || before !== undefined) {
				return getMediaList(req, res);
			}
			return next();
		}
	);

	// GET file
	app.get(withRoot([`${base}/:param1?/:param2?`, `/media/:param1?/:param2?`, `/:param1([a-fA-F0-9]{64})(.[a-zA-Z0-9._-]{1,15})?(/:param2([a-fA-F0-9]{64})(.[a-zA-Z0-9._-]{1,15})?)?`]),
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