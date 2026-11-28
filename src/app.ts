import cors from "cors";
import express from "express";
import helmet from "helmet";
import { asset, assetsDir, assetsRoute, islandAssets, loadAssetManifest } from "./lib/frontend/assets.js";

// The v8 pages can't render without the client bundle. Stop here, with the
// reason, rather than start and serve them broken.
try {
	loadAssetManifest();
} catch (e) {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
}

const app = express();

app.set('trust proxy', 1); 
app.set("view engine", "ejs")
app.set('views','./src/pages/');
app.set("view cache", false);
app.locals.cache = false;   
app.locals.asset = asset;
app.locals.islandAssets = islandAssets;

// Client bundle: every file name carries a content hash, so it can be cached
// forever. A miss ends here instead of walking the whole router.
app.use(assetsRoute, express.static(assetsDir, { immutable: true, maxAge: "1y", index: false }));
app.use(assetsRoute, (_req, res) => { res.status(404).end(); });
app.use(express.static('./src/pages/'));
app.use('/static/js/modules/nostr-tools/', express.static('./node_modules/nostr-tools'));
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: "*",
  methods: "GET,HEAD,PUT,POST,DELETE,OPTIONS",
  allowedHeaders: "Authorization,Content-Type,X-Lightning,X-Lightning-Amount,X-Content-Length,X-Content-Type,X-Sha-256,X-Content-Transform,*",
  exposedHeaders: "Authorization,Content-Type,X-Lightning,X-Lightning-Amount,WWW-Authenticate,X-Reason,*",
  maxAge: 86400,
}));

app.options('*', cors({
  origin: "*",
  methods: "GET,HEAD,PUT,POST,DELETE,OPTIONS",
  allowedHeaders: "Authorization,Content-Type,X-Lightning,X-Lightning-Amount,X-Content-Length,X-Content-Type,X-Sha-256,X-Content-Transform,*",
  exposedHeaders: "Authorization,Content-Type,X-Lightning,X-Lightning-Amount,WWW-Authenticate,X-Reason,*",
  maxAge: 86400,
}));

export default app;