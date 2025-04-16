import { accounts, emptyInvoice, emptyTransaction, Invoice, tableCalculateMode, Transaction } from "../../interfaces/payments.js";
import { dbDelete, dbInsert, dbMultiSelect, dbSelect, dbUpdate } from "../database.js"
import { logger } from "../logger.js";
import { sendMessage } from "../nostr/NIP04.js";
import { getNewDate } from "../utils.js";
import { generateNwcInvoice, isInvoicePaidNwc } from "../nostr/NIP47.js";
import { generateLNBitsInvoice, isInvoicePaidLNbits } from "./lnbits.js";
import { getConfig, getTenants, isModuleEnabled } from "../config/core.js";

const checkTransaction = async (tenant: string, transactionid : string, originId: string, originTable : string, size: number, minSize: number, maxSize: number, maxSatoshi: number,  pubkey : string): Promise<Transaction> => {

    if (!isModuleEnabled("payments", tenant)) {
        return emptyTransaction;
    }

    const calculateMode = tableCalculateMode[originTable];

    // Get the transaction
    let transaction = await _getTransaction(transactionid);
    const balance = await _getBalance(transaction.accountid);
    const satoshi = _calculateSatoshi(calculateMode, size,minSize, maxSize, maxSatoshi);
    transaction.satoshi = satoshi;

    if (satoshi == 0) {
        return emptyTransaction;
    }

    const expiryDate = new Date(transaction.expiryDate).toISOString().slice(0, 19).replace('T', ' ');
    if (transaction.paymentHash != "" && expiryDate > getNewDate()){

        // If the transaction is already paid or if the balance is not enough we return the transaction
        if (transaction.isPaid || balance <= satoshi) {return transaction}
        
        // If the balance is enough we pay the transaction and return the updated transaction
        if (balance >= satoshi) {
            const inv = await _getInvoice(transaction.paymentHash);
            inv.paidDate = getNewDate();
            if (await _collectInvoice(inv)){
                logger.info(`checkTransaction - Paid invoice with user balance: ${balance} satoshi: ${satoshi} transactionid: ${inv.transactionid} Accountid: ${inv.accountid}`);
                return await _getTransaction(inv.transactionid.toString())
            }
        }
    }

    // If transaction not exist or is expired we generate a new invoice and fill the transaction with the invoice data
    if (transaction.paymentHash == "" || expiryDate < getNewDate()){

        const accountid = formatAccountNumber(Number(await dbSelect("SELECT id FROM registered WHERE hex = ?", "id", [pubkey])));
        const invoice = await generateInvoice(accountid, satoshi, originTable, originId, expiryDate < getNewDate() && transaction.transactionid != 0 ? true : false, transaction.transactionid);
        if (invoice.paymentRequest == "") {return emptyTransaction}
        
        if (getConfig(null, ["payments", "sendMessageToPubkey"]) == true) {
            await sendMessage(`Hi, here’s your invoice from ${getConfig(null, ["server", "host"])} service (${invoice.satoshi} satoshi). We appreciate your payment, thanks!`, pubkey, tenant)
            await sendMessage(invoice.paymentRequest, pubkey, tenant)
        }
	
        // Fill the transaction with the invoice data
        transaction = await _getTransaction(invoice.transactionid.toString());

        // If the balance is enough we pay the new transaction and return the updated transaction
        if (balance >= satoshi) {
            const invoice = await _getInvoice(transaction.paymentHash);
            invoice.paidDate = getNewDate();
            if (await _collectInvoice(invoice)){
                logger.info(`checkTransaction - Paid invoice with user balance: ${balance} satoshi: ${satoshi} transactionid: ${invoice.transactionid} Accountid: ${invoice.accountid}`);
                return await _getTransaction(invoice.transactionid.toString())
            }
        }
    }
    
    logger.debug(`checkTransaction - New invoice generated for account: ${transaction.accountid} satoshi: ${satoshi} transactionid: ${transaction.transactionid}`);
    return transaction;

}

const generateInvoice = async (accountid: number, satoshi: number, originTable : string, originId : string, overwrite = false, transactionId = 0) : Promise<Invoice> => {

    if (getConfig(null, ["payments", "LNAddress"]) == "") {
        logger.error(`generateInvoice - LNAddress not set in config file. Cannot generate invoice.`);
        return emptyInvoice;
    }

    if (satoshi == 0) return emptyInvoice;

    const lnurl = `https://${getConfig(null, ["payments", "LNAddress"]).split("@")[1]}/.well-known/lnurlp/${getConfig(null, ["payments", "LNAddress"]).split("@")[0]}`
    const generatedInvoice = getConfig(null, ["payments", "paymentProvider"]) == 'lnbits' ? await generateLNBitsInvoice(satoshi, "") : await generateNwcInvoice(lnurl, satoshi);
    if (generatedInvoice.paymentRequest == "") {return emptyInvoice}
    
    generatedInvoice.description = "Invoice for: " + originTable + ":" + originId;

    if (overwrite == true) {
        logger.info(`generateInvoice - Updating invoice for account: ${accountid} transactionid: ${transactionId}`);
        const updatePayreq = await dbUpdate("transactions", {"paymentrequest" : generatedInvoice.paymentRequest}, ["id"], [transactionId]);
        const updatePayhash = await dbUpdate("transactions", {"paymenthash" : generatedInvoice.paymentHash}, ["id"], [transactionId]);
        const updateCreated = await dbUpdate("transactions", {"createddate" : generatedInvoice.createdDate}, ["id"], [transactionId]);
        const updateExpiry = await dbUpdate("transactions", {"expirydate" : generatedInvoice.expiryDate}, ["id"], [transactionId]);
        const updateSatoshi = await dbUpdate("transactions", {"satoshi" : generatedInvoice.satoshi}, ["id"], [transactionId]);
        const updateAccountid = await dbUpdate("transactions", {"accountid" : accountid.toString()}, ["id"], [transactionId]);
        if (!updatePayreq || !updatePayhash || !updateCreated || !updateExpiry || !updateSatoshi || !updateAccountid) {
            logger.error(`generateInvoice - Error updating transaction with new invoice data for account: ${accountid} transactionid: ${transactionId}`);
            return emptyInvoice;
        }
        generatedInvoice.transactionid = Number(await dbSelect("SELECT id FROM transactions WHERE accountid = ? AND paymentrequest = ?", "id", [accountid.toString(), generatedInvoice.paymentRequest]));
        return generatedInvoice;

    }else{

        const transId = await addTransacion("invoice", accountid, generatedInvoice, satoshi)
        if (transId) {
            await dbUpdate(originTable, {"transactionid" : transId.toString()} , ["id"], [originId])
            logger.info(`generateInvoice - New invoice generated for account: ${accountid} satoshi: ${satoshi} transactionid: ${transId}, origin: ${originTable}:${originId}`);
            generatedInvoice.transactionid = transId;
        }

        const debit = await addJournalEntry(accountid, transId, satoshi, 0, "invoice for " + originTable + ":" + originId);
        const credit = await addJournalEntry(accounts[2].accountid, transId, 0, satoshi, "Accounts Receivable for " + originTable + ":" + originId);
        if (credit && debit) {
            logger.debug(`generateInvoice - Journal entries added for invoice transaction: ${transId}, account: ${accountid} and origin: ${originTable}:${originId}`);
        }

        if (transId && credit && debit) {
            return generatedInvoice;
        }
            
    }

    return emptyInvoice;
}

const addTransacion = async ( type: string, accountid: number, invoice: Invoice, satoshi: number) : Promise<number> => {

    return await dbInsert(  "transactions",   
                            ["type",
                            "accountid", 
                            "paymentrequest", 
                            "paymenthash", 
                            "satoshi", 
                            "paid", 
                            "preimage",
                            "createddate", 
                            "expirydate",
                            "paiddate",
                            "comments"], 
                            [type, 
                            accountid,
                            invoice.paymentRequest? invoice.paymentRequest : "", 
                            invoice.paymentHash? invoice.paymentHash : "", 
                            satoshi, 
                            (invoice.isPaid? 1 : 0).toString(), 
                            invoice.preimage? invoice.preimage : "",
                            invoice.createdDate ? invoice.createdDate : getNewDate(), 
                            invoice.expiryDate? invoice.expiryDate : null,
                            invoice.paidDate? invoice.paidDate : null,
                            invoice.description]
                        );
}

const deleteTransaction = async (transactionid: number) : Promise<boolean> => {
    
    const deleteTransaction = await dbDelete("transactions", ["id"], [transactionid.toString()]);
    const deleteLedger = await dbDelete("ledger", ["transactionid"], [transactionid.toString()]);
    const mediafiles = await dbMultiSelect(["id"], "mediafiles", "transactionid = ?", [transactionid.toString()], false);
    let deleteMedia = true;
    if (mediafiles.length > 0) {
        const result = await dbUpdate("mediafiles", {"transactionid" : null}, ["transactionid"], [transactionid.toString()]);
        deleteMedia = result;
    }
    if (deleteTransaction && deleteLedger && deleteMedia) {
        logger.debug(`deleteTransaction - Transaction deleted: ${transactionid}`);
        return true;
    }

    logger.error(`deleteTransaction - Error deleting transaction: ${transactionid}`);
    return false;
}

const addJournalEntry = async (accountid: number, transactionid: number, debit: number, credit: number, comments: string) : Promise<number> => {
    
    const insert = await dbInsert(  "ledger", 
                            ["accountid", 
                            "transactionid", 
                            "debit", 
                            "credit", 
                            "createddate", 
                            "comments"], 
                            [accountid, 
                            transactionid, 
                            debit, 
                            credit, 
                            getNewDate(), 
                            comments]
                        );

    if (insert != 0) {return insert;}

    logger.error(`addJournalEntry - Error adding journal entry for account: ${accountid} transaction: ${transactionid}, debit: ${debit}, credit: ${credit}, comments: ${comments}`);
    return 0;

}

const _getBalance = async (accountid: number) : Promise<number> => {
    
    if (!accountid)  return 0;
    
    const result = Number(await dbSelect("SELECT SUM(credit) - SUM(debit) as 'balance' FROM ledger WHERE ledger.accountid = ?", "balance", [accountid.toString()])) || 0;
    logger.debug(`getBalance - Balance for account: ${accountid} : ${result}`);
    if (accountid.toString().length > 4 && accountid != 1100000000){
        const updateBalance = await dbUpdate("registered", {"balance" : result.toString()}, ["id"], [formatRegisteredId(accountid)]);
        if (updateBalance) return result;
        logger.error(`getBalance - Error updating balance for account: ${accountid}`);
    }
    return result;
}

const getBalance = async (tenant: string, accountid: number) : Promise<number> => {
    if (!isModuleEnabled("payments", tenant)) return 0;
    return await _getBalance(accountid);
}

const _addBalance = async (tenant: string, accountid: number, amount: number) : Promise<boolean> => {

     const transaction = await addTransacion("credit",   
                                            accountid, 
                                            {   accountid: accountid,
                                                paymentRequest: "", 
                                                paymentHash: "", 
                                                createdDate: getNewDate(),
                                                expiryDate: getNewDate(),
                                                paidDate: getNewDate(),
                                                description: "", 
                                                isPaid: true, 
                                                preimage: "",
                                                transactionid: 0, 
                                                satoshi: amount
                                            },
                                            amount);
    if (transaction) {
        const debit = await addJournalEntry(accounts[4].accountid, transaction, amount, 0, "Expense for adding credit to account: " + accountid);
        const credit = await addJournalEntry(accountid, transaction, 0, amount, "Credit added to account: " + accountid);
        if (credit && debit) {
            logger.debug(`addBalance - Balance added to account: ${accountid} amount: ${amount}, transaction: ${transaction}`);
            
            // Update the balance for the account
            await getBalance(tenant, accountid);
            return true;
        }
    }
    return false;
}

const addBalance = async (tenant: string, accountid: number, amount: number) : Promise<boolean> => {
    if (!isModuleEnabled("payments", tenant)) return false;
    return await _addBalance(tenant, accountid, amount);
}

const getPendingInvoices = async () : Promise<Invoice[]> => {

    const result = await dbMultiSelect(["id", "accountid", "paymentrequest", "paymenthash",  "satoshi", "preimage", "createddate", "expirydate", "paiddate", "comments"],
                                                            "transactions",
                                                            "paid = ?", 
                                                            [0], false);
    const invoices : Invoice[] = [];
    result.forEach(async invoice => {
        const {id, accountid, paymentrequest, paymenthash, satoshi, preimage, createddate, expirydate, paiddate, comments} = invoice
        invoices.push({
            transactionid: Number(id),
            accountid: Number(accountid),
            paymentRequest: paymentrequest,
            paymentHash: paymenthash,
            satoshi: Number(satoshi),
            isPaid: false,
            preimage: preimage,
            createdDate: new Date(createddate),
            expiryDate: new Date(expirydate),
            paidDate: new Date(paiddate),
            description: comments
        });
    })
    return invoices;
}

const _getInvoice = async ( payment_hash: string) : Promise<Invoice> => {

    if (!payment_hash || payment_hash == "0")  return emptyInvoice;

    const result = await dbMultiSelect(["id", "accountid", "paymentrequest", "paymenthash", "satoshi", "paid", "preimage", "createddate", "expirydate", "paiddate", "comments"],
                                                    "transactions",
                                                    "paymenthash = ?", 
                                                    [payment_hash], true);
    if (result.length == 0) {return emptyInvoice}
    const {id, accountid, paymentrequest, paymenthash, satoshi, paid, preimage, createddate, expirydate, paiddate, comments} = result[0];

    // Update the balance for the invoice's account
    await _getBalance(Number(accountid));

    return {
        paymentRequest: paymentrequest,
        paymentHash: paymenthash,
        satoshi: Number(satoshi),
        isPaid: Boolean(paid),
        preimage: preimage,
        createdDate: new Date(createddate),
        expiryDate: new Date(expirydate),
        paidDate: new Date(paiddate),
        description: comments,
        transactionid: Number(id),
        accountid: Number(accountid)
    }
}

const getInvoice = async (tenant: string, payment_hash: string) : Promise<Invoice> => {
    if (!isModuleEnabled("payments", tenant)) {
        return emptyInvoice;
    }
    return _getInvoice(payment_hash);
}

const _getTransaction = async (transactionid: string) : Promise<Transaction> => {

    if (!transactionid || transactionid == "0")   return emptyTransaction;

    const result = await dbMultiSelect(["id", "type", "accountid", "paymentrequest", "paymenthash", "satoshi", "paid", "preimage", "createddate", "expirydate", "paiddate", "comments"],
                                                            "transactions",
                                                            "id = ?",
                                                            [transactionid], true);

    if (result.length == 0) {return emptyTransaction}
    const {id, type, accountid, paymentrequest, paymenthash, satoshi, paid, preimage, createddate, expirydate, paiddate, comments} = result[0];
    const transaction: Transaction = {
        transactionid: Number(id),
        type: type,
        accountid: Number(accountid),
        paymentRequest: paymentrequest,
        paymentHash: paymenthash,
        satoshi: Number(satoshi),
        isPaid: Boolean(paid),
        preimage: preimage,
        createdDate: createddate,
        expiryDate: expirydate,
        paidDate: paiddate,
        comments: comments
    }

    // If transaction expirydate is passed we generate a new LN invoice
    if (transaction.type == "invoice" && transaction.expiryDate < getNewDate()) {

        const lnurl = `https://${getConfig(null, ["payments", "LNAddress"]).split("@")[1]}/.well-known/lnurlp/${getConfig(null, ["payments", "LNAddress"]).split("@")[0]}`
        const inv = getConfig(null, ["payments", "paymentProvider"]) == 'lnbits' ? await generateLNBitsInvoice(transaction.satoshi, "") : await generateNwcInvoice(lnurl, transaction.satoshi);

        transaction.paymentRequest = inv.paymentRequest;
        transaction.paymentHash = inv.paymentHash;
        transaction.createdDate = inv.createdDate;
        transaction.expiryDate = inv.expiryDate;
        const updatePayreq = await dbUpdate("transactions", {"paymentrequest" : inv.paymentRequest}, ["id"], [transactionid]);
        const updatePayhash = await dbUpdate("transactions", {"paymenthash" : inv.paymentHash}, ["id"], [transactionid]);
        const updateCreated = await dbUpdate("transactions", {"createddate" : inv.createdDate}, ["id"], [transactionid]);
        const updateExpyry = await dbUpdate("transactions", {"expirydate" : inv.expiryDate}, ["id"], [transactionid]);
        if (!updatePayreq || !updatePayhash || !updateCreated || !updateExpyry) {
            logger.error(`generateInvoice - Error updating transaction with new invoice data for account: ${accountid} transactionid: ${transactionid}`);
            return emptyTransaction;
        }
        logger.info(`getTransaction - New invoice generated for account: ${accountid} satoshi: ${transaction.satoshi} transactionid: ${transactionid}`);

    }
 
    // Update the balance for the transaction account
    await _getBalance(transaction.accountid);

    return transaction;
}

const getTransaction = async (tenant: string, transactionid: string) : Promise<Transaction> => {
    if (!isModuleEnabled("payments", tenant)) {
        return emptyTransaction;
    }
    return _getTransaction(transactionid);
}

const formatAccountNumber = (registeredid: number): number => {
    let numStr = registeredid.toString();
    while (numStr.length < 6) {
        numStr = '0' + numStr;
    }
    const prefix = accounts[1].accountid.toString();
    return Number(prefix + numStr);
}

const formatRegisteredId = (accountid: number): number => {
    const numStr = accountid.toString();
    const prefixLength = accounts[1].accountid.toString().length;
    const originalIdStr = numStr.slice(prefixLength);
    return Number(originalIdStr);
}

const _collectInvoice = async (invoice: Invoice, collectFromExpenses = false, collectFromPayment = false) : Promise<boolean> => {

    if (invoice.isPaid) {
        logger.debug(`collectInvoice - Invoice already paid: ${invoice.transactionid}`);
        return true;
    }

    const paidDateObject = new Date(Number(invoice.paidDate) * 1000);
    const isValidPaidDate = !isNaN(paidDateObject.getTime());
    
    const paidDateFormatted = isValidPaidDate
      ? paidDateObject.toISOString().slice(0, 19).replace('T', ' ')
      : getNewDate();
    
    const paid = await dbUpdate("transactions", { paid: "1" }, ["id"], [invoice.transactionid.toString()]);
    const paiddate = await dbUpdate("transactions", { paiddate: paidDateFormatted }, ["id"], [invoice.transactionid.toString()]);
    const preimage = await dbUpdate("transactions", { preimage: invoice.preimage }, ["id"], [invoice.transactionid.toString()]);
    if (paid && paiddate && preimage) {
        logger.info(`collectInvoice - Invoice paid: ${invoice.transactionid}`);
    }else{
        logger.error(`collectInvoice - Error updating transaction: ${invoice.transactionid}, paid: ${paid}, paiddate: ${paiddate}, preimage: ${preimage}`);
        return false;
    }

    // If we are collecting from expenses we don't need to debit the main wallet and we need to debit the expenses account.
    if (collectFromExpenses) {
        // Debit expenses account
        await addJournalEntry(accounts[4].accountid, invoice.transactionid, invoice.satoshi, 0, "Expense for adding credit to account: " + invoice.accountid);
    }else{
        // Debit main wallet
        await addJournalEntry(accounts[0].accountid, invoice.transactionid, invoice.satoshi, 0 , "Receipt of invoice payment " + invoice.transactionid);
    }

    if (collectFromPayment) {
        // Credit user wallet
        await addJournalEntry(invoice.accountid, invoice.transactionid, 0, invoice.satoshi, "Payment received for invoice: " + invoice.transactionid);
    }
    
    // Debit Accounts Receivable
    await addJournalEntry(accounts[2].accountid, invoice.transactionid, invoice.satoshi, 0, "Clear Accounts Receivable for invoice payment " + invoice.transactionid);
    
    // Credit Revenue
    await addJournalEntry(accounts[3].accountid, invoice.transactionid, 0, invoice.satoshi, "Revenue from invoice payment " + invoice.transactionid);

    logger.debug(`collectInvoice - Invoice collected: ${invoice.transactionid}, account: ${invoice.accountid}, satoshi: ${invoice.satoshi}`);
        
    // Update the balance for the invoice's account
    await getBalance("",invoice.accountid);
    return true;

}

const collectInvoice = async (tenant: string, invoice: Invoice, collectFromExpenses = false, collectFromPayment = false): Promise<boolean> => {
    if (!isModuleEnabled("payments", tenant)) {
        return false;
    }
    return _collectInvoice(invoice, collectFromExpenses, collectFromPayment)
}

const _calculateSatoshi = (mode: "normal" | "reversed", size: number, minSize : number, maxSize : number, maxSatoshi: number): number => {
    
    if (size == null || minSize == null || maxSize == null || maxSatoshi == null) return 0;

    if (mode === "normal") {
      if (size <= minSize) return 0;
      if (size >= maxSize) return maxSatoshi;
      const m = maxSatoshi / (maxSize - minSize);
      const b = -m * minSize;
      return Math.round(m * size + b);
    } 
    else if (mode === "reversed") {
      if (size <= minSize) return maxSatoshi;
      if (size >= maxSize) return 1;
      const m = (1 - maxSatoshi) / (maxSize - minSize);
      const b = maxSatoshi - m * minSize;
      const satoshi = Math.round(m * size + b);
      return satoshi < 1 ? 1 : satoshi ? satoshi : 0;
    }
  
    return 0;
};

const calculateSatoshi = (tenant: string, mode: "normal" | "reversed", size: number, minSize : number, maxSize : number, maxSatoshi: number): number => {
    if (!isModuleEnabled("payments", tenant)) {
        return 0;
    }
    return _calculateSatoshi(mode, size, minSize, maxSize, maxSatoshi);
}

const getUnpaidTransactionsBalance = async () : Promise<string> => {
    return await dbSelect("SELECT SUM(satoshi) as 'balance' FROM transactions WHERE paid = 0", "balance", []) as string || "0";
}

const _payInvoiceFromExpenses = async (transactionid: string) : Promise<boolean> => {

    if (!transactionid || transactionid == "0")  return false;

    const transaction = await _getTransaction(transactionid);
    const invoice = await _getInvoice(transaction.paymentHash);
    if (invoice.paymentHash == "") {
        logger.error(`payInvoiceFromExpenses - No payment hash found for transaction: ${transactionid}`);
        return false;
    }

    if (invoice.isPaid) {
        logger.info(`payInvoiceFromExpenses - Invoice already paid: ${transactionid}`);
        return true;
    }

    // We send the parameter to debit the expenses account instead of the main wallet.
    const collect = await _collectInvoice(invoice, true, true);
    if (collect) {
        logger.info(`payInvoiceFromExpenses - Invoice paid from expenses: ${transactionid}`);
        return true;
    }

    return false
}

const payInvoiceFromExpenses = async (tenant: string, transactionid: string) : Promise<boolean> => {
    if (!isModuleEnabled("payments", tenant)) {
        return false;
    }
    return _payInvoiceFromExpenses(transactionid);
}

const _isInvoicePaid = async (paymentHash: string) : Promise<{paiddate : string, preimage : string}> => {

    if (paymentHash == "") {
        logger.error(`isInvoicePaid - No payment hash provided`);
        return {paiddate: "", preimage: ""};
    }

    return getConfig(null, ["payments", "paymentProvider"]) == 'lnbits' ? await isInvoicePaidLNbits(paymentHash) : await isInvoicePaidNwc(paymentHash);

}

const isInvoicePaid = async (tenant: string, paymentHash: string) : Promise<{paiddate : string, preimage : string}> => {
    if (!isModuleEnabled("payments", tenant)) {
        return {paiddate: "", preimage: ""};
    }
    return _isInvoicePaid(paymentHash);
}

// Check periodically for pending invoices and update the balance
let isProcessing = false;
const processPendingInvoices = async () => {

    let process = false;
    for (const tenant of getTenants()) {
        if (isModuleEnabled("payments", tenant.domain)) {
            process = true;
            break;
        }
    }
    if (process) {
        if (isProcessing) return;
        isProcessing = true;
        const pendingInvoices = await getPendingInvoices();
        logger.debug(`processPendingInvoices - Processing pending invoices: ${pendingInvoices.length}`);
        for (const invoice of pendingInvoices) {
            await new Promise(resolve => setTimeout(resolve, 300));
            const paidInfo = await _isInvoicePaid(invoice.paymentHash);
            if (paidInfo.paiddate != "" && paidInfo.preimage != "") {
                invoice.paidDate = paidInfo.paiddate;
                invoice.preimage = paidInfo.preimage;
                await _collectInvoice(invoice, false, true);
            }
        }
        isProcessing = false;
    }
    setTimeout(processPendingInvoices, getConfig(null, ["payments", "invoicePaidInterval"]) * 1000);
};

processPendingInvoices();

const cleanTransactions = async () => {

    setTimeout(cleanTransactions, getConfig(null, ["payments", "invoicePaidInterval"]) * 1000);
    let process = false;
    for (const tenant of getTenants()) {
        if (isModuleEnabled("payments", tenant.domain)) {
            process = true;
            break;
        }
    }
    if (!process) return;

    const result = await dbMultiSelect(["id"], "transactions", "accountid = ? AND paid = 0 AND createddate < NOW() - INTERVAL 24 HOUR", ["1100000000"], false);
    for (const transaction of result) {
        await deleteTransaction(transaction.id);
    }
    if (result.length > 0){
        logger.info(`cleanTransactions - Cleaned ${result.length} unpaid transactions for account 110000000 (24 hours)`);
    }
}
cleanTransactions();

const _updateAccountId = async (pubkey : string, transaction_id : number) : Promise<boolean> => {

    if (!pubkey || pubkey == "" || !transaction_id || transaction_id == 0) return false;

    const registeredId = await dbMultiSelect(["id"], "registered", "hex = ?", [pubkey], true);
    if (!registeredId || registeredId.length === 0 || !registeredId[0].id) return false;

    const accountId = await formatAccountNumber(registeredId[0].id);
    if (accountId === 1100000000)  return false;

    const updateTransactions = await dbUpdate("transactions", {"accountid" : accountId}, ["id", "accountid"], [transaction_id, "1100000000"]);
    if (!updateTransactions) return false;

    const updateLedger = await dbUpdate("ledger", {"accountid" : accountId}, ["transactionid", "accountid"], [transaction_id, "1100000000"]);
    if (!updateLedger) return false;

    logger.debug(`updateAccountId - Updated transaction accountid: ${transaction_id} to: ${accountId}`);

    return true;
}

const updateAccountId = async (tenant: string, pubkey : string, transaction_id : number) : Promise<boolean> => {
    if (!isModuleEnabled("payments", tenant)) {
        return false;
    }
    return _updateAccountId(pubkey, transaction_id);
}

export {    checkTransaction, 
            addBalance, 
            getBalance, 
            payInvoiceFromExpenses,
            collectInvoice,
            formatAccountNumber, 
            getUnpaidTransactionsBalance, 
            getInvoice,
            getTransaction,
            isInvoicePaid,
            calculateSatoshi,
            updateAccountId
        }