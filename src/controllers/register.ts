import { Request, Response } from "express";
import validator from "validator";
import { logger } from "../lib/logger.js";
import { getAvailableDomains } from "../lib/domains.js";
import app from "../app.js";
import { getClientIp } from "../lib/utils.js";
import { isModuleEnabled } from "../lib/config.js";
import { addNewUsername, isPubkeyOnDomainAvailable, isUsernameAvailable } from "../lib/register.js";
import { generateCredentials, isAuthkeyValid, parseAuthHeader } from "../lib/authorization.js";
import { npubToHex, validatePubkey } from "../lib/nostr/NIP19.js";
import { registerFormResult } from "../interfaces/register.js";
import { dbUpdate } from "../lib/database.js";
import { validateInviteCode } from "../lib/invitations.js";
import { checkTransaction } from "../lib/payments/core.js";
import { transaction } from "../interfaces/payments.js";

const registerUsername = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("register", app)) {
		logger.warn(`Attempt to access a non-active module: register | IP: ${getClientIp(req)}`);
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}
	
	let activateUser = true;

    // Check if authorization header is valid, if not we will set the otc flag to true
	const eventHeader = await parseAuthHeader(req,"registerUsername", false);
	if (eventHeader.status != "success") {activateUser = false}

	logger.info(`POST /api/v2/register - ${getClientIp(req)}`);

	const pubkey = req.body.pubkey || "";
	if (pubkey == null || pubkey == "" || pubkey == undefined) {
		logger.info("RES -> 400 Bad request - Public key not provided", "|", getClientIp(req));
		return res.status(400).send({status: "error", message: "Public key not provided"});
	}
	
	const validPubkey = await validatePubkey(pubkey);
	if (!validPubkey) {
		logger.info("RES -> 422 Bad request - Public key not valid", "|", getClientIp(req));
		return res.status(422).send({status: "error", message: "Invalid public key format"});
	}

	// Check if the pubkey is the same as the one in the authorization header, if not we will set the otc flag to true
	if (pubkey != eventHeader.pubkey && await npubToHex(pubkey) != eventHeader.pubkey) {activateUser = false};
	
	const username = req.body.username || "";
	if (username == null || username == "" || username == undefined) {
		logger.info("RES -> 400 Bad request - Username not provided", "|", getClientIp(req));
		return res.status(400).send({status: "error", message: "Username not provided"});
	}
	
	let validUsername = validator.default.isLength(username, { min: app.get("config.register")["minUsernameLength"], max: app.get("config.register")["maxUsernameLength"] }); 
	validUsername == true? validUsername = validator.default.matches(username, /^[a-zA-Z0-9-_]+$/) : validUsername = false;
	if (!validUsername) {
		logger.warn(`RES -> 422 Bad request - Username not valid`, "|", getClientIp(req));
		return res.status(401).send({status: "error", message: "Invalid username format"});
	}

	const domain = req.body.domain || "";
	if (domain == null || domain == "" || domain == undefined) {
		logger.info("RES -> 400 Bad request - Domain not provided", "|", getClientIp(req));
		return res.status(400).send({status: "error", message: "Domain not provided"});
	}
	let validDomain : boolean = false;
	let requireInvite : boolean = false;
	let requirepayment : boolean = false;
	let maxSatoshi : number = 0;
	const availableDomains = await getAvailableDomains();
	Object.keys(availableDomains).forEach((element: string) => {
		if (element === domain) {
			validDomain = true;
			requireInvite = availableDomains[element].requireinvite
			requirepayment = availableDomains[element].requirepayment
			maxSatoshi = availableDomains[element].maxsatoshi
		}
	});
	if (!validDomain) {
		logger.info("RES -> 406 Bad request - Domain not allowed", "|", getClientIp(req));
		return res.status(406).send({ status: "error", message: "Invalid domain" });
	}

	if (!await isUsernameAvailable(username, domain)) {
		logger.info("RES ->", username, "|", "Username already registered");
		return res.status(406).send({status: "error", message: "Username already registered"});
	}

	if (!await isPubkeyOnDomainAvailable(pubkey, domain)) {
		logger.info("RES -> 406 Bad request - Pubkey already registered", "|", getClientIp(req));
		return res.status(406).send({status: "error", message: "Pubkey already registered"});
	}
	
	let password = req.body.password || "";
	if (password != null && password != "" && password != undefined && password.length < app.get("config.register")["minPasswordLength"]) {
		logger.info("RES -> 422 Bad request - Password too short", "|", getClientIp(req));
		return res.status(422).send({status: "error", message: "Password too short"});
	}

	let inviteCode = req.body.inviteCode || "";
	if (requireInvite) {
		if ((inviteCode == null || inviteCode == "" || inviteCode == undefined) && requireInvite) {
			logger.info("RES -> 400 Bad request - Invitation key not provided", "|", getClientIp(req));
			return res.status(400).send({status: "error", message: "Invitation key not provided"});
		}

		if (await validateInviteCode(inviteCode) == false) {
			logger.info("RES -> 401 Unauthorized - Invalid invitation key", "|", getClientIp(req));
			return res.status(401).send({status: "error", message: "Invalid invitation key"});
		}
	}

	let comments = eventHeader.status == "success" ? "" : "Pending OTC verification";

	const addUsername = await addNewUsername(username, req.body.pubkey, password, domain, comments, activateUser, inviteCode);
	if (addUsername == 0) {
		logger.error("RES -> Failed to add new username" + " | " + getClientIp(req));
		return res.status(500).send({status: "error", message: "Failed to add new username to the database"});
	}

	// If the user is not activated, we will generate the credentials and send the OTC verification via nost DM.
	if (activateUser == false) {await generateCredentials("otc",pubkey,true,true)};

	// Check if payments module is active and if true generate paymentRequest
	let paymentRequest = "";
	if (requirepayment) {
		const transaction = await checkTransaction("0", addUsername.toString(), "registered", username.length, req.body.pubkey, maxSatoshi) as transaction;
		if (transaction.paymentHash != "" && transaction.isPaid == false && isModuleEnabled("payments", app)) {
			paymentRequest = transaction.paymentRequest;
		}
	}

	logger.info(`RES -> 200 OK - New user ${username} registered successfully - Active: ${activateUser} - Require payment : ${requirepayment}`, "|", getClientIp(req));

	let message : string = "User registered successfully";
	if (activateUser == false) {
		message = message + ", please verify your account with the OTC sent to your nostr pubkey via DM";
	}
	if (paymentRequest != "") {
		message = message + ", please pay the required amount to activate your account";
	}
	const result : registerFormResult = {
		status: "success",
		message: message,
		otc: activateUser == false ? true : false,
		payment_request: paymentRequest
	};

	return res.status(200).send(result);

};

const validateRegisterOTC = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("register", app)) {
		logger.warn(`Attempt to access a non-active module: register | IP: ${getClientIp(req)}`);
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`POST /api/v2/register/validate - ${getClientIp(req)}`);

	if (req.body.otc == undefined || req.body.otc == "" || req.body.otc == null ||  req.body.domain == undefined || req.body.domain == "" || req.body.domain == null) {
		logger.info("RES -> 400 Bad request - OTC or domain not provided", "|", getClientIp(req));
		return res.status(400).send({status: "error", message: "OTC or domain not provided"});
	}

	let validDomain = false;
	const availableDomains = await getAvailableDomains();
	if (availableDomains.hasOwnProperty(req.body.domain)) {
		validDomain = true;
	}
	if (!validDomain) {
		logger.info("RES -> 406 Bad request - Domain not allowed", "|", getClientIp(req));
		return res.status(406).send({ status: "error", message: "Invalid domain" });
	}

	const validOTC = await isAuthkeyValid(req.body.otc, false);
	if(validOTC.status != 'success'){
		logger.info("RES -> 401 Unauthorized - Invalid OTC", "|", getClientIp(req));
		return res.status(401).send({status: "error", message: "Invalid OTC"});
	}

	const activateUser = await dbUpdate("registered", "active", 1, ["hex", "domain"], [validOTC.pubkey, req.body.domain]);
	if (activateUser == false) {
		logger.error("RES -> Failed to activate user" + " | " + getClientIp(req));
		return res.status(500).send({status: "error", message: "Failed to activate user"});
	}

	return res.status(200).send({status: "success", message: "User activated successfully"});

}

export { registerUsername, validateRegisterOTC };

