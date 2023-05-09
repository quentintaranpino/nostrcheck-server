import { Application, Request, Response } from "express";
import { LoadAvailableDomains } from "./domains";
import { LoadNostraddressEndpoint } from "./nostraddress";
import { LoadRegisterEndpoint } from "./register";
import { LoadVerifyEndpoint } from "./verify";

export const loadApiEndpoints = (app: Application): void => {

	//Root endpoint
	app.get("/api/v1", (req: Request, res: Response): Response => {

		//TODO :ADD METHOD TO SHOW ALL ENDPOINTS AUTOMATICALLY WITH A LOOP

		return res
			.status(200)
			.send(
				`<h1>Nostrcheck.me REST API</h1>` +
					`Nostrcheck API ${app.get("version")} is running at ${req.hostname}:${app.get(
						"port"
					)} in ${app.get("env")} mode` +
					`<br>` +
					`<h2>Endpoints</h2>` +
					`<a href='/api/v1/nostraddress'>/api/v1/nostraddress</a>` +
					`<br>` +
					`<a href='/api/v1/register'>/api/v1/register</a>` +
					`<br>` + 
					`<a href='/api/v1/domains'>/api/v1/domains</a>` +
					`<br>` + 
					`<a href='/api/v1/verify'>/api/v1/verify</a>`
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

};
