import { Application, Request, Response } from "express";

import { LoadAvailableDomains } from "./domains";
import { LoadMediaEndpoint } from "./media";
import { LoadNostraddressEndpoint } from "./nostraddress";
import { LoadRegisterEndpoint } from "./register";
import { LoadVerifyEndpoint } from "./verify";

export const loadApiEndpoints = (app: Application): void => {
	//Root endpoint
	app.get("/api", (_req: Request, res: Response): void => {
		res.redirect("/api/v1");
	});

	//v1
	app.get("/api/v1", (req: Request, res: Response): Response => {
		//TODO :ADD METHOD TO SHOW ALL ENDPOINTS AUTOMATICALLY WITH A LOOP

		return res.status(200).send(
			`<head><title>Nostrcheck.me REST API</title></head>` +
				`<style>body{font-family:Arial,Helvetica,sans-serif;}</style>` +
				`<h1>Nostrcheck.me REST API</h1>` +
				`Nostrcheck API ${app.get("version")} is running at ${req.hostname}:${app.get(
					"port"
				)} in ${app.get("env")} mode` +
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
	});

	//Available domains endpoint
	LoadAvailableDomains(app);

	//Nostr address usernames endpoint
	LoadNostraddressEndpoint(app);

	//Register endpoint
	LoadRegisterEndpoint(app);

	//Verify endpoint
	LoadVerifyEndpoint(app);

	//Verify endpoint
	LoadMediaEndpoint(app);
};
