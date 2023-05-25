import cors from "cors";
import express from "express";
import helmet from "helmet";

import { PrepareMediaFolders } from "./lib/transform";
import { LoadAPIv1 } from "./routes/routes.v1";

const app = express();
app.set("port", process.env.PORT ?? 3000);
app.set("version", process.env.npm_package_version ?? "0.0");
app.set(
	"pubkey",
	process.env.PUBKEY ?? "89836015acd0c3e0227718fbe64b6251a8425cda33f27c3e4bbf794effbc7450"
);
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

app.use(helmet());
app.use(cors());

//Load Routes V1
LoadAPIv1(app);

//Clean temp dir
PrepareMediaFolders();

export default app;
