import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import express, { Application, Request, Response, NextFunction } from "express";

import { logger } from "../logger.js";

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
			handler(req, res, next, { host: req.hostname });
		});
		logger.info("mountAstroFrontend - Astro frontend mounted");
		return true;
	} catch (e) {
		logger.error("mountAstroFrontend - Failed to load Astro handler", e);
		return false;
	}
};

export default mountAstroFrontend;