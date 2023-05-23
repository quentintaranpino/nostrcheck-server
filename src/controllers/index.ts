import { Request, Response } from "express";

import app from "../app";
import { logger } from "../lib/logger";

const APIIndex = async (req: Request, res: Response): Promise<Response> => {
	logger.info("REQ -> API Index ", "|", req.socket.remoteAddress);

	return res.status(200).send(
		`<head><title>Nostrcheck.me REST API</title></head>` +
			`<style>body{font-family:Arial,Helvetica,sans-serif;}</style>` +
			`<h1>Nostrcheck.me REST API</h1>` +
			`Nostrcheck API ${app.get("version")} is running at ${req.hostname}:${app.get(
				"port"
			)` in `}${app.get("env")} mode` +
			`<br>` +
			`<p>More information about the this API can be found at <a href='https://github.com/quentintaranpino/nostrcheck-api-ts/'>
				https://github.com/quentintaranpino/nostrcheck-api-ts/</a></p>` +
			`<h2>Endpoints</h2>` +
			`<ul>` +
			`<li><a href='/api/v1/nostraddress'>/api/v1/nostraddress</a></li>` +
			`<li><a href='/api/v1/register'>/api/v1/register</a></li>` +
			`<li><a href='/api/v1/domains'>/api/v1/domains</a></li>` +
			`<li><a href='/api/v1/verify'>/api/v1/verify</a></li>` +
			`<li><a href='/api/v1/media'>/api/v1/media</a></li>`
	);
};

export { APIIndex };
