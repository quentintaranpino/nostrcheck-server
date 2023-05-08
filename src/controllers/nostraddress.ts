import { Application, Request, Response } from "express";

import { redisClient } from "../app";
import { connect } from "../database";
import { logger } from "../logger";

interface RegisteredResults {
	username: string;
	hex: string;
}

export const LoadNostraddressEndpoint = (app: Application): void => {
	//Nostr address usernames endpoint
	app.get("/api/nostraddress", async (req: Request, res: Response): Promise<Response> => {
		const name = req.query.name as string;
		const servername = req.hostname;
		let isCached = false;

		//If name is null return 400
		if (!name) {
			logger.warn(
				"REQ ->",
				servername,
				"|",
				" ",
				"|",
				req.headers["x-forwarded-for"] || req.socket.remoteAddress
			);
			logger.warn(
				"RES -> 400 Bad request - name parameter not specified",
				"|",
				req.headers["x-forwarded-for"] || req.socket.remoteAddress
			);

			return res
				.status(400)
				.send(
					"<b>Bad request</b> You have to specify the 'name' parameter <br><br>" +
						"Example: <a href='/api/nostraddress?name=quentin'>https://nostrcheck.me/api/nostraddress?name=quentin</a> <br><br>" +
						"Visit <a href='/api'>nostrcheck.me/api</a> for more info"
				);
		}

		//If name is too long (<50) return 400
		if (name.length > 50) {
			logger.warn(
				"REQ ->",
				servername,
				"|",
				`${name.substring(0, 50)}...`,
				"|",
				req.headers["x-forwarded-for"] || req.socket.remoteAddress
			);
			logger.warn(
				"RES -> 400 Bad request - name too long",
				"|",
				req.headers["x-forwarded-for"] || req.socket.remoteAddress
			);

			return res
				.status(400)
				.send(
					"<b>Bad request</b> The 'name' parameter is too long <br><br>" +
						"Example: <a href='/api/nostraddress?name=quentin'>https://nostrcheck.me/api/nostraddress?name=quentin</a> <br><br>" +
						"Visit <a href='/api'>nostrcheck.me/api</a> for more info"
				);
		}

		//Debug

		logger.info(
			"REQ ->",
			servername,
			"|",
			name,
			"|",
			req.headers["x-forwarded-for"] || req.socket.remoteAddress
		);

		// Root _ hexkey
		const rootkey = "134743ca8ad0203b3657c20a6869e64f160ce48ae6388dc1f5ca67f346019ee7"; //Especify the root domain hexkey
		if (req.query.name === "_") {
			return res.status(200).send(JSON.stringify({ names: { _: rootkey } }));
		}

		const results: RegisteredResults = { username: "", hex: "" };

		try {
			//Check if the name is cached
			const cached = await getJsonDataFromRedis(name);
			if (cached.username != "" && cached.hex != "") {
				isCached = true;

				//Debug
				logger.info("RES ->", cached.hex, "|", "cached:", isCached);

				return res.status(200).send(JSON.stringify({ names: { [cached.username]: cached.hex } }));
			}

			//If not cached, query the database
			const conn = await connect();
			const [rows] = await conn.execute(
				"SELECT username , hex  FROM registered WHERE username = ? and domain = ?",
				[name, servername]
			);
			const rowstemp = JSON.parse(JSON.stringify(rows));
			conn.end();

			if (rowstemp[0] == undefined) {
				logger.warn("RES ->", name, "|", "Username not registered");

				return res
					.status(404)
					.send(
						`${name} is not registered on ${servername} <br><br> visit <a href='https://nostrcheck.me/register'>nostrcheck.me</a> for more info`
					);
			}

			if (rowstemp != null) {
				results.username = rowstemp[0].username;
				results.hex = rowstemp[0].hex;
			}
		} catch (error) {
			logger.error(error);

			return res.status(500).send("Internal server error - Please try again later :(");
		}

		await redisClient.set(results.username, JSON.stringify(results), {
			EX: 300, // 5 minutes
			NX: true, // Only set the key if it does not already exist
		});

		//Debug
		logger.info("RES ->", results.hex, "|", "cached:", isCached);

		return res.status(200).send(JSON.stringify({ names: { [results.username]: results.hex } }));
	});
};

async function getJsonDataFromRedis(key: string): Promise<RegisteredResults> {
	const data = await redisClient.get(key);

	if (!data) {
		return { username: "", hex: "" };
	}

	return JSON.parse(data.toString());
}
