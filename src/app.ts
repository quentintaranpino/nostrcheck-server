import cors from "cors";
import express from "express";
import helmet from "helmet";

import { cleanTempDir } from "./lib/transform";
import { LoadAPIv1 } from "./routes/routes.v1";

const app = express();
app.set("port", process.env.PORT ?? 3000);
app.set("version", process.env.npm_package_version ?? "0.0");
app.set(
	"pubkey",
	process.env.PUBKEY ?? "134743ca8ad0203b3657c20a6869e64f160ce48ae6388dc1f5ca67f346019ee7"
);
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

app.use(helmet());
app.use(cors());

//Load Routes V1
LoadAPIv1(app);

//Clean temp dir
cleanTempDir();

export default app;
