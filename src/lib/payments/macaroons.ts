import crypto from 'crypto';
import { macaroon } from '../../interfaces/payments.js';
import app from '../../app.js';

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

    if (!macaroon) return false;

    const decoded = Buffer.from(macaroon, 'base64').toString('utf-8');
    const recievedMacaroon : macaroon = JSON.parse(decoded);

    if (recievedMacaroon.ID.length !== 64) return false;

    const hmac = crypto.createHmac('sha256', app.get('config.server')['secretKey']);
    hmac.update(recievedMacaroon.ID);

    recievedMacaroon.caveats.forEach(caveat => {
        hmac.update(caveat);
    });

    const receivedID = hmac.digest('hex');
    if (receivedID !== recievedMacaroon.ID) return false;

    return true;
};

export { createMacaroon, verifyMacaroon };