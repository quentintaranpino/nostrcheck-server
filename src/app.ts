import cors from "cors";
import express from "express";
import helmet from "helmet";

const app = express();

app.set('trust proxy', 1); 
app.set("view engine", "ejs")
app.set('views','./src/pages/');
app.set("view cache", false);
app.locals.cache = false;   

app.use(express.static('./src/pages/'));
app.use('/static/js/modules/nostr-tools/', express.static('./node_modules/nostr-tools'));
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: "*",
  methods: "GET,PUT,POST,DELETE,OPTIONS",
  allowedHeaders: "Authorization,Content-Type,X-Cashu,X-Lightning,X-Lightning-Amount,X-Content-Length,X-Content-Type,X-Sha-256,X-Content-Transform,*",
  exposedHeaders: "Authorization,Content-Type,X-Cashu,X-Lightning,X-Lightning-Amount,WWW-Authenticate,X-Reason,*",
  maxAge: 86400,
}));

app.options('*', cors({
  origin: "*",
  methods: "GET,PUT,POST,DELETE,OPTIONS",
  allowedHeaders: "Authorization,Content-Type,X-Cashu,X-Lightning,X-Lightning-Amount,X-Content-Length,X-Content-Type,X-Sha-256,X-Content-Transform,*",
  exposedHeaders: "Authorization,Content-Type,X-Cashu,X-Lightning,X-Lightning-Amount,WWW-Authenticate,X-Reason,*",
  maxAge: 86400,
}));

export default app;