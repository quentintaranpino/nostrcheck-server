import app from "../../app.js";
import { accounts, emptyInvoice, emptyTransaction, invoice, transaction } from "../../interfaces/payments.js";
import { isModuleEnabled } from "../config.js";
import { dbDelete, dbInsert, dbMultiSelect, dbSelect, dbUpdate } from "../database.js"
import { hashString } from "../hash.js";
import { logger } from "../logger.js";
import { sendMessage } from "../nostr/NIP04.js";
import { getNewDate } from "../utils.js";
import { generateLUD06Invoice } from "./LUD06.js";
import { isInvoicePaidGetAlby } from "./getalby.js";
import { generateLNBitsInvoice, isInvoicePaidLNbits } from "./lnbits.js";

const checkTransaction = async (transactionid : string, originId: string, originTable : string, size: number, pubkey : string, maxSatoshi : number = 0): Promise<transaction> => {

    if (!isModuleEnabled("payments", app)) {
        return emptyTransaction;
    }

    // Get the transaction
    let transaction = await getTransaction(transactionid);
    const balance = await getBalance(transaction.accountid);
    const satoshi = await calculateSatoshi(originTable, size, maxSatoshi);

    if (satoshi == 0) {
        return emptyTransaction;
    }

    const expiryDate = new Date(transaction.expiryDate).toISOString().slice(0, 19).replace('T', ' ');
    if (transaction.paymentHash != "" && expiryDate > getNewDate()){

        // If the transaction is already paid or if the balance is not enough we return the transaction
        if (transaction.isPaid || balance <= satoshi) {return transaction};
        
        // If the balance is enough we pay the transaction and return the updated transaction
        if (balance >= satoshi) {
            let inv = await getInvoice(transaction.transactionid.toString());
            inv.paidDate = getNewDate();
            if (await collectInvoice(inv)){
                logger.info("Paying invoice with user balance:", balance, "satoshi:", satoshi, "transactionid:", inv.transactionid, "Accountid:", inv.accountid)
                return await getTransaction(inv.transactionid.toString())
            };
        }
    };

    // If transaction not exist or is expired we generate a new invoice and fill the transaction with the invoice data
    if (transaction.paymentHash == "" || expiryDate < getNewDate()){

        const accountid = formatAccountNumber(Number(await dbSelect("SELECT id FROM registered WHERE hex = ?", "id", [pubkey])));
        const invoice = await generateInvoice(accountid, satoshi, originTable, originId, expiryDate < getNewDate() && transaction.transactionid != 0 ? true : false, transaction.transactionid);
        if (invoice.paymentRequest == "") {return emptyTransaction};
        
        if (app.get("config.payments")["sendMessageToPubkey"] == true){
            await sendMessage(`Hi, here’s your invoice from ${app.get("config.server")["host"]} service (${invoice.satoshi} satoshi). We appreciate your payment, thanks!`, pubkey)
            await sendMessage(invoice.paymentRequest,pubkey)
        }
	
        // Fill the transaction with the invoice data
        transaction = await getTransaction(invoice.transactionid.toString());

        // If the balance is enough we pay the new transaction and return the updated transaction
        if (balance >= satoshi) {
            let invoice = await getInvoice(transaction.transactionid.toString());
            invoice.paidDate = getNewDate();
            if (await collectInvoice(invoice)){
                logger.info("Paying invoice with user balance:", balance, "satoshi:", satoshi, "transactionid:", invoice.transactionid, "Accountid:", invoice.accountid)
                return await getTransaction(invoice.transactionid.toString())
            };
        }
    }
    
    return transaction;

}

const generateInvoice = async (accountid: number, satoshi: number, originTable : string, originId : string, overwrite = false, transactionId = 0) : Promise<invoice> => {

    if (!isModuleEnabled("payments", app))return emptyInvoice;

    if (app.get("config.payments")["LNAddress"] == "") {
        logger.error("LNAddress not set in config file. Cannot generate invoice.")
        return emptyInvoice;
    }

    if (satoshi == 0) return emptyInvoice;

    const lnurl = `https://${app.get("config.payments")["LNAddress"].split("@")[1]}/.well-known/lnurlp/${app.get("config.payments")["LNAddress"].split("@")[0]}`
    const generatedInvoice = app.get("config.payments")["paymentProvider"] == 'lnbits' ? await generateLNBitsInvoice(satoshi, "") : await generateLUD06Invoice(lnurl, satoshi);
    if (generatedInvoice.paymentRequest == "") {return emptyInvoice}
    
    generatedInvoice.description = "Invoice for: " + originTable + ":" + originId;

    if (overwrite == true) {
        logger.info("Detected expired invoice, updating invoice for account:", accountid, "transactionid:", transactionId)
        const updatePayreq = await dbUpdate("transactions", "paymentrequest", generatedInvoice.paymentRequest, ["id"], [transactionId]);
        const updatePayhash = await dbUpdate("transactions", "paymenthash", generatedInvoice.paymentHash, ["id"], [transactionId]);
        const updateCreated = await dbUpdate("transactions", "createddate", generatedInvoice.createdDate, ["id"], [transactionId]);
        const updateExpiry = await dbUpdate("transactions", "expirydate", generatedInvoice.expiryDate, ["id"], [transactionId]);
        const updateSatoshi = await dbUpdate("transactions", "satoshi", generatedInvoice.satoshi, ["id"], [transactionId]);
        const updateAccountid = await dbUpdate("transactions", "accountid", accountid.toString(), ["id"], [transactionId]);
        if (!updatePayreq || !updatePayhash || !updateCreated || !updateExpiry || !updateSatoshi || !updateAccountid) {
            logger.error("Error updating transaction with new invoice data", transactionId)
            return emptyInvoice;
        }
        generatedInvoice.transactionid = Number(await dbSelect("SELECT id FROM transactions WHERE accountid = ? AND paymentrequest = ?", "id", [accountid.toString(), generatedInvoice.paymentRequest]));
        return generatedInvoice;

    }else{

        const transId = await addTransacion("invoice", accountid, generatedInvoice, satoshi)
        if (transId) {
            await dbUpdate(originTable, "transactionid", transId.toString() , ["id"], [originId])
            logger.info("Generated invoice for " + originTable + ":" + originId, " satoshi: ", satoshi, "transactionid: ", transId)
            generatedInvoice.transactionid = transId;
        }

        const debit = await addJournalEntry(accountid, transId, satoshi, 0, "invoice for " + originTable + ":" + originId);
        const credit = await addJournalEntry(accounts[2].accountid, transId, 0, satoshi, "Accounts Receivable for " + originTable + ":" + originId);
        if (credit && debit) {
            logger.debug("Journal entry added for debit transaction", transId, originId, originTable)
        }

        if (transId && credit && debit) {
            return generatedInvoice;
        }
            
    }

    return emptyInvoice;
}

const addTransacion = async (type: string, accountid: number, invoice: invoice, satoshi: number) : Promise<number> => {

    if (!isModuleEnabled("payments", app)) {
        return 0;
    }

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
    
        if (!isModuleEnabled("payments", app)) {
            return false;
        }
    
        const deleteTransaction = await dbDelete("transactions", ["id"], [transactionid.toString()]);
        const deleteLedger = await dbDelete("ledger", ["transactionid"], [transactionid.toString()]);
        const mediafiles = await dbMultiSelect(["id"], "mediafiles", "transactionid = ?", [transactionid.toString()], false);
        let deleteMedia = true;
        if (mediafiles.length > 0) {
            const result = await dbUpdate("mediafiles", "transactionid", null, ["transactionid"], [transactionid.toString()]);
            deleteMedia = result;
        }
        if (deleteTransaction && deleteLedger && deleteMedia) {
            return true;
        }

        logger.error("Error deleting transaction", transactionid)
        return false;
}

const addJournalEntry = async (accountid: number, transactionid: number, debit: number, credit: number, comments: string) : Promise<number> => {
    
    if (!isModuleEnabled("payments", app)) {
        return 0;
    }
    
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

    logger.error("Error adding journal entry for account:", accountid, "transaction:", transactionid)
    return 0;

}

const getBalance = async (accountid: number) : Promise<number> => {

    if (!isModuleEnabled("payments", app)) {
        return 0;
    }

    if (!accountid) {
        logger.warn("No accountid provided for balance check")
        return 0;
    }

    const result = Number(await dbSelect("SELECT SUM(credit) - SUM(debit) as 'balance' FROM ledger WHERE ledger.accountid = ?", "balance", [accountid.toString()]));
    logger.debug("Balance for account", accountid, ":", result)
    const balance = await dbUpdate("registered", "balance", result.toString(), ["id"], [formatRegisteredId(accountid)]);
    if (balance) {
        return result;
    }
    return 0;
}

const addBalance = async (accountid: number, amount: number) : Promise<boolean> => {
    
    if (!isModuleEnabled("payments", app)) {
        return false;
    }

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
            logger.debug("Journal entries added for adding balance to account:", accountid, "transaction:", transaction)
            
            // Update the balance for the account
            await getBalance(accountid);
            return true;
        }
    }
    return false;
}

const getPendingInvoices = async () : Promise<invoice[]> => {

    if (!isModuleEnabled("payments", app)) {
        return [];
    }

    const result = await dbMultiSelect(["id", "accountid", "paymentrequest", "paymenthash",  "satoshi", "preimage", "createddate", "expirydate", "paiddate", "comments"],
                                                            "transactions",
                                                            "paid = ?", 
                                                            [0], false);
    const invoices : invoice[] = [];
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

const getInvoice = async (transactionId: string) : Promise<invoice> => {

    if (!isModuleEnabled("payments", app)) {
        return emptyInvoice;
    }

    if (!transactionId || transactionId == "0") {
        return emptyInvoice;
    }

    const result = await dbMultiSelect(["id", "accountid", "paymentrequest", "paymenthash", "satoshi", "paid", "preimage", "createddate", "expirydate", "paiddate", "comments"],
                                                    "transactions",
                                                    "id = ?", 
                                                    [transactionId], true);
    if (result.length == 0) {return emptyInvoice};
    const {id, accountid, paymentrequest, paymenthash, satoshi, paid, preimage, createddate, expirydate, paiddate, comments} = result[0];

    // Update the balance for the invoice's account
    await getBalance(Number(accountid));

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

const getTransaction = async (transactionid: string) : Promise<transaction> => {

    if (!isModuleEnabled("payments", app)) {
        return emptyTransaction;
    }

    if (!transactionid || transactionid == "0") {
        return emptyTransaction;
    }

    const result = await dbMultiSelect(["id", "type", "accountid", "paymentrequest", "paymenthash", "satoshi", "paid", "preimage", "createddate", "expirydate", "paiddate", "comments"],
                                                            "transactions",
                                                            "id = ?",
                                                            [transactionid], true);

    if (result.length == 0) {return emptyTransaction};
    const {id, type, accountid, paymentrequest, paymenthash, satoshi, paid, preimage, createddate, expirydate, paiddate, comments} = result[0];
    const transaction: transaction = {
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
        const lnurl = `https://${app.get("config.payments")["LNAddress"].split("@")[1]}/.well-known/lnurlp/${app.get("config.payments")["LNAddress"].split("@")[0]}`
        const inv = app.get("config.payments")["paymentProvider"] == 'lnbits' ? await generateLNBitsInvoice(transaction.satoshi, "") : await generateLUD06Invoice(lnurl, transaction.satoshi);
        transaction.paymentRequest = inv.paymentRequest;
        transaction.paymentHash = inv.paymentHash;
        transaction.createdDate = inv.createdDate;
        transaction.expiryDate = inv.expiryDate;
        const updatePayreq = await dbUpdate("transactions", "paymentrequest", inv.paymentRequest, ["id"], [transactionid]);
        const updatePayhash = await dbUpdate("transactions", "paymenthash", inv.paymentHash, ["id"], [transactionid]);
        const updateCreated = await dbUpdate("transactions", "createddate", inv.createdDate, ["id"], [transactionid]);
        const updateExpyry = await dbUpdate("transactions", "expirydate", inv.expiryDate, ["id"], [transactionid]);
        if (!updatePayreq || !updatePayhash || !updateCreated || !updateExpyry) {
            logger.error("Error updating transaction with new invoice data", transactionid)
            return emptyTransaction;
        }
        logger.info("Invoice expired, new invoice generated for transaction:", transactionid)

    }
 
    // Update the balance for the transaction account
    await getBalance(transaction.accountid);

    return transaction;
}


const formatAccountNumber = (registeredid: number): number => {
    let numStr = registeredid.toString();
    while (numStr.length < 6) {
        numStr = '0' + numStr;
    }
    let prefix = accounts[1].accountid.toString();
    return Number(prefix + numStr);
}

const formatRegisteredId = (accountid: number): number => {
    let numStr = accountid.toString();
    let prefixLength = accounts[1].accountid.toString().length;
    let originalIdStr = numStr.slice(prefixLength);
    return Number(originalIdStr);
}

const collectInvoice = async (invoice: invoice, collectFromExpenses = false, collectFromPayment = false) : Promise<boolean> => {

    if (!isModuleEnabled("payments", app)) {
        return false;
    }

    if (invoice.isPaid) {
        logger.debug("Invoice already paid", invoice.transactionid)
        return true;
    }

    const paid = await dbUpdate("transactions", "paid", "1", ["id"], [invoice.transactionid.toString()]);
    const paiddate = await dbUpdate("transactions", "paiddate", new Date(invoice.paidDate).toISOString().slice(0, 19).replace('T', ' ') != '1970-01-01 00:00:00' ? new Date(invoice.paidDate).toISOString().slice(0, 19).replace('T', ' ') : getNewDate(), ["id"], [invoice.transactionid.toString()]);
    const preimage = await dbUpdate("transactions", "preimage", invoice.preimage, ["id"], [invoice.transactionid.toString()]);
    if (paid && paiddate && preimage) {
        logger.info("Invoice paid, transaction updated", invoice.transactionid);
    }else{
        logger.error("Error updating transaction", invoice.transactionid);
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

    logger.debug("Journal entries added for invoice payment", invoice.transactionid)
        
    // Update the balance for the invoice's account
    await getBalance(invoice.accountid);
    return true;

}

const calculateSatoshi = async (originTable: string, size: number, maxSatoshi: number = 0) : Promise<number> => {

    if (!isModuleEnabled("payments", app)) return 0;

    if (originTable == "" || size <= 0) return 0;

    if (originTable == "mediafiles" && app.get("config.payments")["satoshi"]["mediaMaxSatoshi"] == 0) return 0;

    if (originTable == "registered" && app.get("config.payments")["satoshi"]["registerMaxSatoshi"] == 0 && maxSatoshi == 0) return 0;

    if (originTable == "mediafiles") {
        // For mediafiles
        const maxSize = Number(app.get("config.media")["maxMBfilesize"]);
        let fileSizeMB = size / 1024 / 1024;
        if (fileSizeMB > maxSize) {fileSizeMB = maxSize;}
        let mediaMaxSatoshi = maxSatoshi == 0 ? app.get("config.payments")["satoshi"]["mediaMaxSatoshi"] : maxSatoshi;

        let satoshi = Math.round((fileSizeMB / maxSize) * mediaMaxSatoshi);
        logger.info("Filesize:", fileSizeMB, "Satoshi:", satoshi)
        return satoshi;

    }

    if (originTable == "registered") {
        // For registered the minus size is more expensive
        let domainMaxSatoshi = maxSatoshi == 0 ? app.get("config.payments")["satoshi"]["registerMaxSatoshi"] : maxSatoshi;
        if (size <= app.get("config.register")["minUsernameLength"]) {return domainMaxSatoshi};

        // y=mx+b | Linear equation for calculating satoshi based on username length
        const slope = (1 - domainMaxSatoshi) / (app.get("config.register")["maxUsernameLength"] - app.get("config.register")["minUsernameLength"]);
        const intercept = domainMaxSatoshi - slope * app.get("config.register")["minUsernameLength"];
        const satoshi = Math.round(slope * size + intercept);

        logger.debug("Register size:", size, "Satoshi:", satoshi)
        return satoshi >= 1 ? satoshi : 1;
    }

    return 0;
    
}

const getUnpaidTransactionsBalance = async () : Promise<string> => {
    return await dbSelect("SELECT SUM(satoshi) as 'balance' FROM transactions WHERE paid = 0", "balance", []) as string || "0";
}

const payInvoiceFromExpenses = async (transactionid: string) : Promise<boolean> => {

    if (!isModuleEnabled("payments", app)) {
        return false;
    }

    if (!transactionid || transactionid == "0") {
        return false;
    }

    const invoice = await getInvoice(transactionid);
    if (invoice.paymentHash == "") {
        logger.error("No payment hash found for transaction", transactionid)
        return false;
    }

    if (invoice.isPaid) {
        logger.debug("Invoice already paid", transactionid)
        return true;
    }

    // We send the parameter to debit the expenses account instead of the main wallet.
    const collect = await collectInvoice(invoice, true, true);
    if (collect) {
        logger.info("Invoice paid", transactionid)
        return true;
    }

    return false
}

const isInvoicePaid = async (paymentHash: string) : Promise<{paiddate : string, preimage : string}> => {

    if (!isModuleEnabled("payments", app)) {
        return {paiddate: "", preimage: ""};
    }

    if (paymentHash == "") {
        logger.error("No payment hash provided")
        return {paiddate: "", preimage: ""};
    }

    return app.get("config.payments")["paymentProvider"] == 'lnbits' ? await isInvoicePaidLNbits(paymentHash) : await isInvoicePaidGetAlby(paymentHash);

}

// Check periodically for pending invoices and update the balance
let isProcessing = false;
const processPendingInvoices = async () => {
    if (isModuleEnabled("payments", app)) {
        if (isProcessing) return;
        isProcessing = true;
        const pendingInvoices = await getPendingInvoices();
        logger.debug("Pending invoices:", pendingInvoices.length);
        for (const invoice of pendingInvoices) {
            await new Promise(resolve => setTimeout(resolve, 300));
            const paidInfo = await isInvoicePaid(invoice.paymentHash);
            if (paidInfo.paiddate != "" && paidInfo.preimage != "") {
                invoice.paidDate = paidInfo.paiddate;
                invoice.preimage = paidInfo.preimage;
                await collectInvoice(invoice, false, true);
            }
        }
        isProcessing = false;
    }
    setTimeout(processPendingInvoices, app.get("config.payments")["invoicePaidInterval"] * 1000);
};

processPendingInvoices();

const cleanTransactions = async () => {

    if (!isModuleEnabled("payments", app))return;

    const result = await dbMultiSelect(["id"], "transactions", "accountid = ? and paid = 0", ["1100000000"], false);
    result.forEach(async transaction => {
        await deleteTransaction(transaction.id);
    })
    setTimeout(cleanTransactions, app.get("config.payments")["invoicePaidInterval"] * 1000);
}
cleanTransactions();

const validatePreimage = async (transactionid: string, preimage: string) : Promise<boolean> => {
    
        if (!isModuleEnabled("payments", app)) {
            return false;
        }
    
        if (!transactionid || transactionid == "0") {
            return false;
        }
    
        if (preimage == "") {
            logger.error("Can't validate preimage, no preimage provided", transactionid)
            return false;
        }

        logger.debug(await hashString(preimage, "preimage"))
        const invoice = await getInvoice(transactionid);
        logger.debug(invoice.paymentHash)
        if (invoice.preimage == preimage || await hashString(preimage, "preimage") == invoice.paymentHash) {
            return true;
        }
    
        return false;
    }

const updateAccountId = async (pubkey : string, transaction_id : number) : Promise<boolean> => {

    if (!pubkey || pubkey == "" || !transaction_id || transaction_id == 0) return false;

    if (!isModuleEnabled("payments", app)) return false;

    const registeredId = await dbMultiSelect(["id"], "registered", "hex = ?", [pubkey], true);
    if (!registeredId || registeredId.length === 0 || !registeredId[0].id) return false;

    const accountId = await formatAccountNumber(registeredId[0].id);
    if (accountId === 1100000000)  return false;

    const updateTransactions = await dbUpdate("transactions", "accountid", accountId, ["id", "accountid"], [transaction_id, "1100000000"]);
    if (!updateTransactions) return false;

    const updateLedger = await dbUpdate("ledger", "accountid", accountId, ["transactionid", "accountid"], [transaction_id, "1100000000"]);
    if (!updateLedger) return false;

    logger.debug("Updated transaction accountid:", transaction_id, "to:", accountId)

    return true;
}


export {    checkTransaction, 
            addBalance, 
            getBalance, 
            payInvoiceFromExpenses,
            collectInvoice,
            formatAccountNumber, 
            getUnpaidTransactionsBalance, 
            getInvoice,
            isInvoicePaid,
            calculateSatoshi,
            validatePreimage,
            updateAccountId
        }