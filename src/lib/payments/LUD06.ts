import axios from 'axios';
import * as bolt11 from 'bolt11';
import { emptyInvoice, Invoice } from '../../interfaces/payments.js';
import { logger } from '../logger.js';
import { getNewDate } from '../utils.js';

async function generateLUD06Invoice(lnurl: string, amount: number): Promise<Invoice> {

  if (lnurl === '' || amount === 0) {return emptyInvoice;}

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
        preimage: '',
        createdDate: decoded.timestampString? new Date(decoded.timestampString) : getNewDate(),
        expiryDate: decoded.timeExpireDateString? new Date(decoded.timeExpireDateString) : getNewDate(),
        paidDate:  null,
        description: '',
        transactionid: 0,
        accountid: 0
    }

  } catch (e: any) {
    logger.error(`generateLUD06Invoice - Error generating LUD06 invoice with error ${e}`);
    return  emptyInvoice;
  }
}

export { generateLUD06Invoice };