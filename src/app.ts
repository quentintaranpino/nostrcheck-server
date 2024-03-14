import cors from "cors";
import express from "express";
import helmet from "helmet";
import { loadConfigOptions } from "./lib/config.js";

const app = express();

app.set("config.server", await loadConfigOptions("server"));
app.set("config.media", await loadConfigOptions("media"));
app.set("config.logger", await loadConfigOptions("logger"));
app.set("config.redis", await loadConfigOptions("redis"));
app.set("config.environment", process.env.NODE_ENV ?? await loadConfigOptions("environment"));

app.set("version", process.env.npm_package_version ?? "0.0");

app.set('trust proxy', 1); 
app.set("view engine", "ejs")
app.set('views','./src/pages/'); // TODO 0.6.0 Theming the frontend with this line

app.use(express.json({ limit: '25MB' }));
app.use(express.urlencoded({ limit: '25MB', extended: true }));
app.use(express.static('./src/pages/')); // TODO 0.6.0 Theming the frontend with this line
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

export default app;