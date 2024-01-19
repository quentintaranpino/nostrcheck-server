import cors from "cors";
import express from "express";
import helmet from "helmet";
import config from "config";
import iniSession from "./lib/session.js";


import { LoadAPI } from "./routes/routes.js";
import { Express } from "express-serve-static-core";



const app = express();

app.set("host", process.env.HOSTNAME ?? config.get('server.host'));
app.set("port", process.env.PORT ?? config.get('server.port'));
app.set("version", process.env.npm_package_version ?? "0.0");
app.set(
	"pubkey",
	process.env.PUBKEY ?? config.get('server.pubkey')
);
app.set('trust proxy',true); 
app.set("view engine", "ejs")
app.set('views','./src/pages/');
app.use(express.json({ limit: '25MB' }));
app.use(express.urlencoded({ limit: '25MB', extended: true }));
app.use(express.static('./src/pages/'));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

//Initialise session cookies
iniSession(app);

//Load Routes V1
LoadAPI(app, "v1");

//Load Routes V2
LoadAPI(app, "v2");

export default app;