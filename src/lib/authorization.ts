import { connect } from "../lib/database.js";
import { logger } from "./logger.js";
import config from "config";
import crypto from "crypto";
import bcrypt from "bcrypt";

const isPubkeyAllowed = async (pubkey:string): Promise<boolean> => {

	logger.info("Checking if pubkey is allowed ->", pubkey)

    const conn = await connect("IsAuthorizedPubkey");
    try{
		const [isAllowedPubkey] = await conn.query("SELECT hex FROM registered WHERE hex = ? and allowed = 1", [pubkey]);
		const isAllowedPubkeyrowstemp = JSON.parse(JSON.stringify(isAllowedPubkey));

		if (isAllowedPubkeyrowstemp[0] == undefined) {
			conn.end();
			return false;
		}

		conn.end();
		return true;
	}catch (error) {
		return false;
	}

}

const IsAdminAuthorized = async (authkey:any) : Promise<boolean> =>{

	logger.info("New admin authorization request")

    //Check if request has authorization header
	if (!authkey) {
		logger.warn("Unauthorized request, no authorization header");
		return false
	}


	// Check if authkey is the legacy server.admin.legacyPassword from config file
	if (authkey == config.get("server.adminPanel.legacyPassword")) {
		logger.info("Admin request authorized using legacy password ->", authkey)
		return true;
	}

	// Query database if authkey is present
	const conn = await connect("IsAdminAuthorized");
	try {
		const [isAuthorized] = await conn.query("SELECT authkey FROM registered WHERE authkey = ? and allowed = 1", [
			authkey,
		]);
		const isAuthorizedrowstemp = JSON.parse(JSON.stringify(isAuthorized));

		if (isAuthorizedrowstemp[0] == undefined) {
			logger.warn(
				`RES -> 401 unauthorized  - ${authkey} is not authorized`,
			);
			conn.end();
			return false;
		}

		logger.info("Admin request authorized ->", authkey)
		conn.end();
		return true;
	} catch (error) {
		logger.error(error);
		return false;
	}
}


const generateAuthKey = async (pubkey :string): Promise<string> => {

    const authkey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const conn = await connect("generateAuthKey");
    try {
        await conn.query("UPDATE registered SET authkey = ? WHERE hex = ?", [
            authkey,
            pubkey,
        ]);
        conn.end();
        return authkey;

    } catch (error) {
        logger.error(error);
        conn.end();
        return "";
    }
}

const generateNewPassword = async (): Promise<string> => {
	
	try{
		const saltRounds = 10;
		let newPass = await bcrypt.genSalt(saltRounds).then(salt => {return bcrypt.hash(crypto.randomBytes(20).toString('hex'), salt).catch(err => {logger.error(err)})});
		if (newPass == undefined) {
			return "";
		}
		return newPass;
	}catch (error) {
		logger.error(error);
		return "";
	}
    
}

export { isPubkeyAllowed, IsAdminAuthorized, generateAuthKey, generateNewPassword };