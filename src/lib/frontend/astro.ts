import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import express, { Application, Request, Response, NextFunction } from "express";

import { logger } from "../logger.js";
import { getConfig, isModuleEnabled } from "../config/core.js";
import { renderMdPage, replaceTokens } from "../frontend.js";
import { getDocsData } from "./docs.js";

// Per-page SEO resolved from the tenant's config (editable in the admin),
// same source the EJS pages read via res.locals. Astro pages ask for it by
// page key so the operator's settings and multi-tenant overrides survive.
const buildSeoResolver = (host: string) => (page: string) => ({
	title: replaceTokens(host, getConfig(host, ["appearance", "pages", page, "title"]) || ""),
	description: replaceTokens(host, getConfig(host, ["appearance", "pages", page, "description"]) || ""),
	noindex: !!getConfig(host, ["appearance", "pages", page, "noindex"]),
	socialImage: getConfig(host, ["appearance", "pages", page, "socialImage"])
		|| getConfig(host, ["appearance", "socialImage"]) || "",
	siteName: getConfig(host, ["appearance", "siteName"])
		|| getConfig(host, ["server", "host"]) || host,
});

/**
 * Mounts the Astro frontend (middleware mode) if dist/frontend exists.
 * Astro serves the pages it owns and calls next() for everything else,
 * so EJS keeps working as fallback during the incremental migration.
 */
const mountAstroFrontend = async (app: Application): Promise<boolean> => {

	const entry = path.join(process.cwd(), "dist", "frontend", "server", "entry.mjs");
	if (!fs.existsSync(entry)) {
		logger.warn("mountAstroFrontend - dist/frontend not built. Astro pages disabled, EJS serves everything.");
		return false;
	}

	try {
		const { handler } = await import(pathToFileURL(entry).href);
		if (typeof handler !== "function") throw new Error("dist/frontend entry has no handler export");
		app.use(express.static(path.join(process.cwd(), "dist", "frontend", "client")));
		app.use((req: Request, res: Response, next: NextFunction) => {
			const host = req.hostname;
				// Same shared-navbar inputs the EJS partials read from res.locals /
				// req.session, so migrated pages keep module-gating and auth state.
				const session = (req as Request & { session?: { identifier?: string; allowed?: boolean } }).session;
				handler(req, res, next, {
					host,
					siteName: getConfig(host, ["appearance", "siteName"]) || getConfig(host, ["server", "host"]) || host,
					version: getConfig(host, ["version"]) || "",
					loggedIn: !!session?.identifier,
					isAdmin: session?.allowed === true,
					modules: {
						register: isModuleEnabled("register", host),
						media: isModuleEnabled("media", host),
						relay: isModuleEnabled("relay", host),
					},
					getSeo: buildSeoResolver(host),
					// tos/privacy/legal come from operator markdown; same
					// pipeline the EJS pages use, so both stay identical.
					getMdPage: (page: string) => renderMdPage(host, `${page}FilePath`),
					getDocsData: () => getDocsData(host),
				});
		});
		logger.info("mountAstroFrontend - Astro frontend mounted");
		return true;
	} catch (e) {
		logger.error("mountAstroFrontend - Failed to load Astro handler", e);
		return false;
	}
};

export default mountAstroFrontend;