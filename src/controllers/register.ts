import { Request, Response } from "express";
import validator from "validator";
import { logger } from "../lib/logger.js";
import { getAvailableDomains } from "../lib/domains.js";
import app from "../app.js";
import { addNewUsername, isPubkeyOnDomainAvailable, isUsernameAvailable } from "../lib/register.js";
import { generateOTC, verifyOTC, parseAuthHeader } from "../lib/authorization.js";
import { npubToHex, validatePubkey } from "../lib/nostr/NIP19.js";
import { registerFormResult } from "../interfaces/register.js";
import { dbDelete, dbUpdate } from "../lib/database.js";
import { validateInviteCode } from "../lib/invitations.js";
import { calculateSatoshi, checkTransaction } from "../lib/payments/core.js";
import { amountReturnMessage, Transaction } from "../interfaces/payments.js";
import { setAuthCookie } from "../lib/frontend.js";
import { isIpAllowed } from "../lib/security/ips.js";
import { getPublicTenantConfig } from "../lib/config/tenant.js";
import { ResultMessagev2 } from "../interfaces/server.js";
import { getConfig, isModuleEnabled } from "../lib/config/core.js";

const registerUsername = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`registerUsername - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("register")) {
		logger.warn(`registerUsername - Attempt to access a non-active module: register | IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}
	
	let activateUser = true;

    // Check if authorization header is valid, if not we will set the otc flag to true, we don't want to check jwt cookie here.
	const eventHeader = await parseAuthHeader(req,"registerUsername", false, false, false);
	if (eventHeader.status != "success") {activateUser = false}
	setAuthCookie(res, eventHeader.authkey);

	logger.info(`registerUsername - Request from:`, reqInfo.ip);

	const pubkey = req.body.pubkey || "";
	if (pubkey == null || pubkey == "" || pubkey == undefined) {
		logger.info(`registerUsername - 400 Bad request - Public key not provided`, "|", reqInfo.ip);
		return res.status(400).send({status: "error", message: "Public key not provided"});
	}
	
	const validPubkey = await validatePubkey(pubkey);
	if (!validPubkey) {
		logger.info(`registerUsername - 422 Bad request - Invalid public key format`, "|", reqInfo.ip);
		return res.status(422).send({status: "error", message: "Invalid public key format"});
	}

	// Check if the pubkey is the same as the one in the authorization header, if not we will set the otc flag to true
	if (pubkey != eventHeader.pubkey && await npubToHex(pubkey) != eventHeader.pubkey) {activateUser = false}
	
	const username = req.body.username || "";
	if (username == null || username == "" || username == undefined) {
		logger.info(`registerUsername - 400 Bad request - Username not provided`, "|", reqInfo.ip);
		return res.status(400).send({status: "error", message: "Username not provided"});
	}
	
	let validUsername = validator.default.isLength(username, { min: getConfig(req.hostname, ["register","minUsernameLength"]), max: getConfig(req.hostname, ["register","maxUsernameLength"]) }); 
	validUsername == true? validUsername = validator.default.matches(username, /^[a-zA-Z0-9-_]+$/) : validUsername = false;
	if (!validUsername) {
		logger.warn(`registerUsername - 401 Unauthorized - Invalid username format`, "|", reqInfo.ip);
		return res.status(401).send({status: "error", message: "Invalid username format"});
	}

	const domain = req.body.domain || "";
	if (domain == null || domain == "" || domain == undefined) {
		logger.info(`registerUsername - 400 Bad request - Domain not provided`, "|", reqInfo.ip);
		return res.status(400).send({status: "error", message: "Domain not provided"});
	}

	if (!await isUsernameAvailable(username, domain)) {
		logger.info(`registerUsername - 406 Not Acceptable - Username already registered`, "|", reqInfo.ip);
		return res.status(406).send({status: "error", message: "Username already registered"});
	}

	if (!await isPubkeyOnDomainAvailable(pubkey, domain)) {
		logger.info(`registerUsername - 406 Not Acceptable - Pubkey already registered`, "|", reqInfo.ip);
		return res.status(406).send({status: "error", message: "Pubkey already registered"});
	}
	
	const password = req.body.password || "";
	if (password != null && password != "" && password != undefined && password.length < getConfig(req.hostname, ["register","minPasswordLength"])) {
		logger.info(`registerUsername - 422 Unprocessable Entity - Password too short`, "|", reqInfo.ip);
		return res.status(422).send({status: "error", message: "Password too short"});
	}

	const inviteCode = req.body.inviteCode || "";
	if (getConfig(domain, ["register", "requireinvite"]) == true) {
		if ((inviteCode == null || inviteCode == "" || inviteCode == undefined)) {
			logger.info(`registerUsername - 400 Bad request - Invitation key not provided`, "|", reqInfo.ip);
			return res.status(400).send({status: "error", message: "Invitation key not provided"});
		}

		if (await validateInviteCode(inviteCode) == false) {
			logger.info(`registerUsername - 401 Unauthorized - Invalid invitation key`, "|", reqInfo.ip);
			return res.status(401).send({status: "error", message: "Invalid invitation key"});
		}
	}

	const comments = eventHeader.status == "success" ? "" : "Pending OTC verification";

	const addUsername = await addNewUsername(username, req.body.pubkey, password, domain, comments, activateUser, inviteCode);
	if (addUsername == 0) {
		logger.error(`registerUsername - Failed to add new username to the database`, "|", reqInfo.ip);
		return res.status(500).send({status: "error", message: "Failed to add new username to the database"});
	}

	// If the user is not activated, we will generate the credentials and send the OTC verification via nost DM.
	if (activateUser == false) {
		const OTC = await generateOTC(pubkey)
		if (OTC == false){
			logger.error(`registerUsername - Failed to generate OTC`, "|", reqInfo.ip);
			return res.status(500).send({status: "error", message: "Failed to generate OTC"});
		}
	} 

	// Check if payments module is active and if true generate paymentRequest
	let paymentRequest = "";
	let satoshi = 0;
	const requirePayment = getConfig(domain, ["payments", "satoshi", "registerMaxSatoshi"]) > 0;
	if (requirePayment && isModuleEnabled("payments")) {
		
		const transaction : Transaction = await checkTransaction(
			"0",
			addUsername.toString(),
			"registered",
			username.length,
			getConfig(domain, ["register", "minUsernameLength"]),
			getConfig(domain, ["register", "maxUsernameLength"]),
			getConfig(domain, ["payments", "satoshi", "registerMaxSatoshi"]),
			req.body.pubkey
		);

		
		if (transaction.paymentHash != "" && transaction.isPaid == false && isModuleEnabled("payments")) {
			paymentRequest = transaction.paymentRequest;
			satoshi = transaction.satoshi;
		}else if (transaction.satoshi == 0 && isModuleEnabled("payments")) {
			logger.debug(`registerUsername - 0 satoshi invoice generated`, "|", reqInfo.ip);
		}else{
			// If the payment request is not generated, we will delete the user from the database
			logger.error(`registerUsername - Failed to generate payment request`, "|", reqInfo.ip);
			const deleteResut = await dbDelete("registered", ["id"], [addUsername.toString()]);
			if (deleteResut == false) { logger.error("Failed to delete unpaid user" + " | " + reqInfo.ip); }
			return res.status(500).send({status: "error", message: "Failed to generate payment request"});
		}
	}

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
		payment_request: paymentRequest,
		satoshi: satoshi
	};

	logger.info(`registerUsername - New user ${username} registered successfully - Active: ${activateUser} - Require payment : ${requirePayment}`, "|", reqInfo.ip);
	return res.status(200).send(result);

};


const validateRegisterOTC = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`validateRegisterOTC - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("register")) {
		logger.warn(`validateRegisterOTC - Attempt to access a non-active module: register | IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	logger.info(`validateRegisterOTC - Request from:`, reqInfo.ip);

	if (req.body.otc == undefined || req.body.otc == "" || req.body.otc == null ||  req.body.domain == undefined || req.body.domain == "" || req.body.domain == null) {
		logger.warn(`validateRegisterOTC - 400 Bad request - OTC or domain not provided`, "|", reqInfo.ip);
		return res.status(400).send({status: "error", message: "OTC or domain not provided"});
	}

	let validDomain = false;
	const availableDomains = await getAvailableDomains();
	if (Object.prototype.hasOwnProperty.call(availableDomains, req.body.domain)) {
		validDomain = true;
	}
	if (!validDomain) {
		logger.warn(`validateRegisterOTC - 406 Not Acceptable - Invalid domain`, "|", reqInfo.ip);
		return res.status(406).send({ status: "error", message: "Invalid domain" });
	}

	const validOTC = await verifyOTC(req.body.otc);
	if(validOTC == "") {
		logger.warn(`validateRegisterOTC - 401 Unauthorized - Invalid OTC`, "|", reqInfo.ip);
		return res.status(401).send({status: "error", message: "Invalid OTC"});
	}

	const activateUser = await dbUpdate("registered", {"active": 1, "pendingotc": 0}, ["hex", "domain"], [validOTC, req.body.domain]);
	if (activateUser == false) {
		logger.error(`validateRegisterOTC - Failed to activate user`, "|", reqInfo.ip);
		return res.status(500).send({status: "error", message: "Failed to activate user"});
	}

	logger.info(`validateRegisterOTC - OTC verified successfully`, "|", reqInfo.ip);
	return res.status(200).send({status: "success", message: "User activated successfully"});

}


const calculateRegisterCost = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`calculateRegisterCost - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if payments module is enabled
    if (!isModuleEnabled("payments")) {
        logger.info(`calculateRegisterCost - Attempt to access a non-active module: payments | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }
	// Check if current module is enabled
	if (!isModuleEnabled("register")) {
        logger.info(`calculateRegisterCost - Attempt to access a non-active module: register | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`calculateRegisterCost - Request from:`, req.hostname, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');

    // Check if the request has the required parameters
    if (req.body.size === undefined || req.body.size === null) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error(`calculateRegisterCost - Invalid parameters | ${reqInfo.ip}`);
        return res.status(400).send(result);
    }

    const size = req.body.size;
    const domain = req.body.domain || "";

	if (size == null || size == "" || size == undefined || size < 1) {
		logger.info(`calculateRegisterCost - 400 Bad request - Size not provided`, "|", reqInfo.ip);
		return res.status(400).send({status: "error", message: "Size not provided"});
	}

	if (domain == null || domain == "" || domain == undefined) {
		logger.info(`calculateRegisterCost - 400 Bad request - Domain not provided`, "|", reqInfo.ip);
		return res.status(400).send({status: "error", message: "Domain not provided"});
	}

    const tenanConfig = await getPublicTenantConfig(domain);
	if(!tenanConfig) {
		logger.info(`calculateRegisterCost - Invalid domain`, "|", reqInfo.ip);
		return res.status(406).send({ status: "error", message: "Invalid domain" });
	}

	const satoshi = await calculateSatoshi(
		"reversed",
		size,
		tenanConfig.minUsernameLength,
		tenanConfig.maxUsernameLength,
		tenanConfig.maxsatoshi
	)

    const result : amountReturnMessage = {
        status: "success",
        message: "Calculated satoshi successfully",
        amount: satoshi
        };

    logger.info(`calculateRegisterCost - Calculated satoshi successfully: ${satoshi}, size: ${size}, domain: ${domain} | ${reqInfo.ip}`);
    return res.status(200).send(result);
    
}


export { registerUsername, validateRegisterOTC, calculateRegisterCost };