import { connect } from "../lib/database.js";
import { logger } from "../lib/logger.js";
import config from "config";

const IsAuthorizedPubkey = async (pubkey:string): Promise<boolean> => {

    const conn = await connect();
    
    logger.info("Checking if pubkey is authorized ->", pubkey)

    //We check if the pubkey is allowed in database
	const [isAllowedPubkey] = await conn.query("SELECT hex FROM registered WHERE hex = ? and allowed = 1", [
		pubkey,
	]);
	const isAllowedPubkeyrowstemp = JSON.parse(JSON.stringify(isAllowedPubkey));

	if (config.get("environment") === 'development') {
		logger.warn("DEVMODE: Authorizing all pubkeys");
            return true;
	}

	if (isAllowedPubkeyrowstemp[0] == undefined) {
		logger.warn(
			`RES -> 401 unauthorized  - ${pubkey} is not authorized`,	
		);
        return false;
	}

    logger.info("Pubkey is authorized ->", pubkey)
    return true;

}

export { IsAuthorizedPubkey };