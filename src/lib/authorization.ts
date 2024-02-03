import { connect } from "../lib/database.js";
import config from "config";
import { logger } from "./logger.js";

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

const IsAdminAuthorized = async (req: any) : Promise<boolean> =>{

	logger.info("New admin authorization request")

    //Check if request has authorization header
	if (req.headers.authorization === undefined) {
		logger.warn("Unauthorized request, no authorization header");
		return false
	}

	// Query database if authkey is present
	const conn = await connect("IsAdminAuthorized");
	try {
		const [isAuthorized] = await conn.query("SELECT authkey FROM registered WHERE authkey = ? and allowed = 1", [
			req.headers.authorization.toString(),
		]);
		const isAuthorizedrowstemp = JSON.parse(JSON.stringify(isAuthorized));

		if (isAuthorizedrowstemp[0] == undefined) {
			logger.warn(
				`RES -> 401 unauthorized  - ${req.headers.authorization} is not authorized`,
			);
			conn.end();
			return false;
		}

		logger.info("Admin request authorized ->", req.headers.authorization)
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


export { isPubkeyAllowed, IsAdminAuthorized, generateAuthKey };