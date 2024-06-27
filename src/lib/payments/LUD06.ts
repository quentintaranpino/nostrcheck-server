import axios from 'axios';
import * as bolt11 from 'bolt11';
import { emptyInvoice, invoice } from '../../interfaces/payments.js';
import { logger } from '../logger.js';

async function generateInvoice(lnurl: string, amount: number): Promise<invoice> {
  try {

    const response = await axios.get(lnurl);
    if (response.data.status !== 'OK') {return emptyInvoice;}
    const { callback, minSendable, maxSendable } = response.data;

    if (amount * 1000 > maxSendable || amount * 1000 < minSendable) {return emptyInvoice;}

    const invoiceResponse = await axios.get(`${callback}?amount=${amount * 1000}`);
    if (invoiceResponse.data.status !== 'OK') {return emptyInvoice;}

    const decoded = bolt11.decode(invoiceResponse.data.pr);
    if(!decoded) {return emptyInvoice;}

    return {
        paymentRequest: invoiceResponse.data.pr,
        paymentHash: decoded.tags.find(tag => tag.tagName === 'payment_hash')?.data.toString() || '',
        satoshi: decoded.satoshis? decoded.satoshis : 0,
        isPaid: false,
        createdDate: decoded.timestampString? new Date(decoded.timestampString) : new Date(),
        expiryDate: decoded.timeExpireDateString? new Date(decoded.timeExpireDateString) : new Date(),
        paidDate:  null,
        description: '',
        transactionid: 0,
        accountid: 0
    }

  } catch (e: any) {
    logger.error('Error generating LNURL invoice', e.message);
    return  emptyInvoice;
  }
}

export { generateInvoice };