import cors from "cors";
import express from "express";
import helmet from "helmet";

const app = express();

app.set('trust proxy', 1); 
app.set("view engine", "ejs")
app.set('views','./src/pages/'); 

app.use(express.static('./src/pages/'));
app.use('/static/js/modules/nostr-tools/', express.static('./node_modules/nostr-tools'));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
    origin: "*",
    methods: "GET,PUT,POST,DELETE,OPTIONS",
    allowedHeaders: "Authorization,Content-Type,X-Cashu,X-Lightning, *",
    exposedHeaders: "Authorization,Content-Type,X-Cashu,X-Lightning, WWW-Authenticate, X-Reason, *",
    maxAge: 86400,
  }));

export default app;