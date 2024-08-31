import crypto from 'crypto';
import { macaroon } from '../../interfaces/payments.js';
import app from '../../app.js';
import { logger } from '../logger.js';

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
}

export { createMacaroon, verifyMacaroon, decodeMacaroon };
