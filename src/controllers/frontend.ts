import { Request, Response } from "express";

import app from "../app.js";
import { logger } from "../lib/logger.js";
import { getClientIp } from "../lib/server.js";
import path from "path";
import config from "config";
import fs from "fs";

const APIIndex = async (req: Request, res: Response): Promise<Response> => {
	logger.info("REQ -> API Index v2 ", "|", getClientIp(req));

	// Load server logo from resources folder
	const Serverlogopath = path.normalize(path.resolve('./resources/logo-nostrcheck-server.webp'));
	const Serverlogofile = fs.readFileSync(Serverlogopath);
	const ServerlogofileBase64 = Buffer.from(Serverlogofile).toString("base64");
	

	return res.status(200).send(
		`<head><title>Nostrcheck server</title></head>` +
			`<style>body{font-family:Arial,Helvetica,sans-serif; padding:15px;}</style>` +
			`<img src='data:image/webp;base64,` + ServerlogofileBase64 + `' alt='Nostrcheck server logo' width='350' height='143' style='padding-bottom:15px'> <br>` +
			`Nostrcheck server ${app.get("version")} is running at ${req.hostname} in ${app.get("env")} mode.` +
			`<br>` +
			`<p>More information, installation instructions and documentation about the this software can be found at <a href='https://github.com/quentintaranpino/nostrcheck-api-ts/'>
				https://github.com/quentintaranpino/nostrcheck-api-ts/</a></p>` +
			`<h2>Active endpoints</h2>` +
			`<ul>` +
			`<h3>v1</h3>` +
			`<li><a href='/api/v1/nostraddress'>/api/v1/nostraddress</a></li>` +
			`<li><a href='/api/v1/register'>/api/v1/register</a></li>` +
			`<li><a href='/api/v1/domains'>/api/v1/domains</a></li>` +
			`<li><a href='/api/v1/verify'>/api/v1/verify</a></li>` +
			`<li><a href='/api/v1/media'>/api/v1/media</a></li>` +
			`<li><a href='/api/v1/lightningaddress'>/api/v1/lightningaddress</a></li>` +
			`<h3>v2</h3>` +
			`<li><a href='/api/v2/status'>/api/v2/status</a></li>` +
			`<li><a href='/api/v2/media'>/api/v2/media</a></li>` +
			`<li><a href='/api/v2/nip96'>/api/v2/nip96</a></li>` +
			`</ul>`
	);
};

export { APIIndex };
