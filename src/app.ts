import cors from "cors";
import express from "express";
import helmet from "helmet";
import config from "config";

import { PrepareMediaFolders } from "./lib/transform";
import { LoadAPIv1 } from "./routes/routes.v1";

const app = express();
app.set("port", process.env.PORT ?? config.get('server.port'));
app.set("version", process.env.npm_package_version ?? "0.0");
app.set(
	"pubkey",
	process.env.PUBKEY ?? config.get('server.pubkey')
);
app.use(express.json({ limit: config.get('media.maxfilesize') }));
app.use(express.urlencoded({ limit: config.get('media.maxfilesize'), extended: true }));

app.use(helmet());
app.use(cors());

//Load Routes V1
LoadAPIv1(app);

//Clean temp dir
PrepareMediaFolders();

export default app;
