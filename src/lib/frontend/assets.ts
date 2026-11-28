import fs from "fs";
import path from "path";

// Where scripts/build-client.mjs writes the browser bundle and where Express
// serves it from. Kept free of project imports: app.ts loads this before the
// config and the logger exist.
const assetsDir = path.resolve("./dist/client");
const assetsRoute = "/assets";
const manifestPath = path.join(assetsDir, "manifest.json");

interface AssetManifest {
	files: { [name: string]: string };
	islands: { [name: string]: string[] };
}

let manifest: AssetManifest | null = null;
let manifestMtime = 0;
let lastCheck = 0;

const readManifest = (): AssetManifest => {
	const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	if (parsed == null || typeof parsed.files != "object" || typeof parsed.islands != "object") {
		throw new Error("unexpected format");
	}
	return parsed;
};

/**
 * Loads dist/client/manifest.json. Called once at startup: without it no page
 * on the v8 layout can find its stylesheet or script, so a missing or broken
 * manifest stops the server instead of serving unstyled pages.
 * @throws Error with what to run when the client build is missing.
 */
const loadAssetManifest = (): void => {
	try {
		manifest = readManifest();
		manifestMtime = fs.statSync(manifestPath).mtimeMs;
		lastCheck = Date.now();
	} catch (e) {
		throw new Error(
			`loadAssetManifest - Cannot read ${manifestPath} (${e instanceof Error ? e.message : e}). ` +
			`The frontend bundle is not built. Run "npm run build" and start the server again.`
		);
	}
};

// A rebuild changes the hashed names. Pick the new manifest up without a
// restart, looking at the file at most once a second.
const currentManifest = (): AssetManifest => {
	if (manifest == null) loadAssetManifest();
	const now = Date.now();
	if (now - lastCheck > 1000) {
		lastCheck = now;
		try {
			const mtime = fs.statSync(manifestPath).mtimeMs;
			if (mtime != manifestMtime) {
				manifest = readManifest();
				manifestMtime = mtime;
			}
		} catch {
			// Mid-rebuild or removed: keep serving the last good one.
		}
	}
	return manifest as AssetManifest;
};

/**
 * Resolves a client asset to its hashed public URL. Exposed to every EJS
 * template as `asset()`.
 * @param name - The entry name, e.g. "base.js", "site.css", "icons.svg".
 * @returns The URL under /assets.
 * @throws Error when the name is not in the manifest, so a typo fails the render instead of emitting a 404.
 */
const asset = (name: string): string => {
	const url = currentManifest().files[name];
	if (url == undefined) throw new Error(`asset - "${name}" is not in the client manifest`);
	return url;
};

/**
 * Lists the chunks an island needs, for `<link rel="modulepreload">`.
 * @param name - The island name, as in `data-island`.
 * @returns The chunk URLs, or an empty array for an unknown island.
 */
const islandAssets = (name: string): string[] => {
	return currentManifest().islands[name] || [];
};

export { loadAssetManifest, asset, islandAssets, assetsDir, assetsRoute };
