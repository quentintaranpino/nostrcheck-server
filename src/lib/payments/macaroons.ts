import crypto from 'crypto';
import { checkMacaroonResult, macaroon } from '../../interfaces/payments.js';
import app from '../../app.js';
import { logger } from '../logger.js';
import { dbMultiSelect } from '../database.js';
import { checkTransaction } from './core.js';

const createMacaroon = (transactionId: number, paymentHash: string, location: string, caveats: string[]): string => {

    if (!transactionId || !paymentHash || !location || !caveats) return '';

    const secretKey = app.get('config.server')['secretKey'];

    const identifier = Buffer.concat([
        Buffer.from([0x00, 0]),
        Buffer.from(paymentHash, 'hex'),
        transactionId.toString().length < 32 ? Buffer.concat([Buffer.alloc(32 - transactionId.toString().length), Buffer.from(transactionId.toString(), 'hex')]) : Buffer.from(transactionId.toString(), 'hex'),
    ]);

    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(identifier);

    caveats.forEach(caveat => {
        hmac.update(caveat);
    });

    const signature = hmac.digest('hex');

    const macaroon: macaroon = {
        ID: signature,
        version: '0',
        payment_hash: paymentHash,
        token_id: transactionId.toString(),
        location: location,
        caveats: caveats,
    }

    return Buffer.from(JSON.stringify(macaroon)).toString('base64');
};

const verifyMacaroon = (macaroon: string): boolean => {

    if (!macaroon || macaroon == "" || macaroon == null || macaroon == undefined) return false;

    const decoded = Buffer.from(macaroon, 'base64').toString('utf-8');
    
    try{
        const receivedMacaroon: macaroon = JSON.parse(decoded);

        if (receivedMacaroon.ID.length !== 64) return false;
    
        const secretKey = app.get('config.server')['secretKey'];
    
        const identifier = Buffer.concat([
            Buffer.from([0x00, 0]),
            Buffer.from(receivedMacaroon.payment_hash, 'hex'),
            receivedMacaroon.token_id.length < 32 ? Buffer.concat([Buffer.alloc(32 - receivedMacaroon.token_id.length), Buffer.from(receivedMacaroon.token_id, 'hex')]) : Buffer.from(receivedMacaroon.token_id, 'hex'),
        ]);
    
        const hmac = crypto.createHmac('sha256', secretKey);
        hmac.update(identifier);
    
        receivedMacaroon.caveats.forEach(caveat => {
            hmac.update(caveat);
        });
    
        const expectedID = hmac.digest('hex');
        if (expectedID !== receivedMacaroon.ID) return false;
    
        return true;

    }catch(e){
        logger.error(`Error verifying macaroon: ${e}`);
        return false;
    }
};

const decodeMacaroon = (macaroon: string): macaroon | null => {
    
    if (!macaroon || macaroon == "" || macaroon == null || macaroon == undefined) return null;

    const decoded = Buffer.from(macaroon, 'base64').toString('utf-8');
    
    try{
        const receivedMacaroon: macaroon = JSON.parse(decoded);
        return receivedMacaroon;

    }catch(e){
        logger.error(`Error decoding macaroon: ${e}`);
        return null;
    }
};

const checkMacaroon = async (hash : string, size : number, transform: boolean, url : string): Promise<checkMacaroonResult> => {

    if (!hash || !url ) {
        return { status: "error", message: "Missing parameters" };
    }

    const transactionId = (await dbMultiSelect(["transactionid"], "mediafiles", transform == true ? "original_hash = ?" : "hash = ?", [hash], true))[0]?.transactionid || "" ;
	const transaction = await checkTransaction(transactionId,"","mediafiles", transform == true ? size/3 : Number(size),"");
	if (transaction.transactionid != 0 && transaction.isPaid == false && app.get("config.payments")["satoshi"]["mediaMaxSatoshi"] > 0) {
		const macaroon = await createMacaroon(transaction.transactionid,transaction.paymentHash,url,["hash="+hash]);
		if (macaroon == "") {
			logger.error(`Error creating macaroon for transaction ${transaction.transactionid}`);
            return { status: "error", message: "Error creating macaroon" };
		}
        return { status: "success", message: "Macaroon and invoice created", macaroon: macaroon, Invoice: transaction.paymentRequest, satoshi: transaction.satoshi };
	}
    return { status: "success", message: transaction.isPaid ? "Transaction already paid" : "Transaction not found" };
}



export { createMacaroon, verifyMacaroon, decodeMacaroon, checkMacaroon };
