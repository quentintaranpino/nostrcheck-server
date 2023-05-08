import { Application, Request, Response } from "express";

import { LoadNostraddressEndpoint } from "./nostraddress";
import { LoadRegisterEndpoint } from "./register";

export const loadApiEndpoints = (app: Application): void => {
	//Root endpoint
	app.get("/api/", (req: Request, res: Response): Response => {

		//TODO :AÑADIR METODO PARA MOSTRAR TODOS LOS ENDPOINTS AUTOMATICAMENTE CON UN BUCLE
		
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
					`<br>`
			);
	});

	//Nostr address usernames endpoint
	LoadNostraddressEndpoint(app);

	//Register endpoint
	LoadRegisterEndpoint(app);
};
