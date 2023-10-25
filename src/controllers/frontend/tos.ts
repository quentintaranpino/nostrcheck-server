import { Request, Response } from "express";
import { logger } from "../../lib/logger.js";
import { getClientIp, getServerLogo } from "../../lib/server.js";


const getFrontendTOS = async (req: Request, res: Response): Promise<Response> => {
	logger.info("REQ -> Server TOS v2 ", "|", getClientIp(req));

	return res.status(200).send(
		`<head><title>` + req.hostname + ` server TOS</title></head>` +
			`<style>body{font-family:Arial,Helvetica,sans-serif; padding:15px;}</style>` +
            `<body>` +
			`<img src='data:image/webp;base64,` + getServerLogo() + `' alt='` + req.hostname + ` server logo' width='350' height='143' style='padding-bottom:15px'> <br>` +
            `<h2>Terms of Service</h2>` +
			`We know that freedom is something very important to you, but the responsibility we have in offering a service to third parties where foreign content can be hosted is very great. Therefore it is necessary that you agree to these points, we believe it is reasonable to agree to this before proceeding. By using our website you are agreed with this: ` +
			`<ul>` +
			`<li>Stay humble, stay free.</li>` +
			`<li>By registering an account with ` + req.hostname + `, or uploading files you agree to be bound by these Terms of Service.</li>` +
			`<li>You agree to not use this service for impersonating other people.</li>` +
			`<li>You agree to not use offensive, racist or vulgar user names.</li>` +
			`<li>` + req.hostname + ` reserves the right to revoke a registration at any time, without prior notice.</li>` +
			`<li>Obtaining a ` + req.hostname + ` account does not imply that the opinions expressed by the user are the same as those of the development team.</li>` +
            `<li>You agree to not upload any illegal content in ` + req.hostname + ` jurisdiction's.</li>` +
            `<li>We reserve the right to modify or terminate these Terms of Service for any reason, without notice at any time.</li>` +
            `<li>You are responsible for regularly reviewing these Terms of Service. Your continued use of ` + req.hostname + ` after any such change constitutes your acceptance of the new Terms of Service.</li>` +
            `<li>You agree to not use ` + req.hostname + ` for any illegal activities or activities that violate any applicable laws or regulations.</li>` +
            `<li>You agree to not violate the intellectual property rights of any third party.</li>` +
            `<li>` + req.hostname + ` will remove any content that we deem to be inappropriate or in violation of these Terms of Service.</li>` +
			`</ul>` +
			`<p>More information, installation instructions and documentation about the this software can be found at <a href='https://github.com/quentintaranpino/nostrcheck-api-ts/'>
				https://github.com/quentintaranpino/nostrcheck-api-ts/</a></p>` +
            `</body>`
	);
};

export { getFrontendTOS };