import { ResultMessagev2 } from "./server.js";

interface Invoice {
    paymentRequest: string;
    paymentHash: string;
    satoshi: number;
    isPaid: boolean;
    createdDate: any;
    expiryDate: any;
    paidDate: any;
    description: any;
    transactionid: number;
    accountid: number;
    preimage: string;
    arkAddress?: string;
}

const emptyInvoice: Invoice = {
    paymentRequest: "",
    paymentHash: "",
    satoshi: 0,
    isPaid: true,
    createdDate: "",
    expiryDate: "",
    paidDate: "",
    description: "",
    transactionid: 0,
    accountid: 0,
    preimage: ""
}

interface Transaction {
    transactionid: number;
    type: string;
    accountid: number;
    paymentRequest: string;
    paymentHash: string;
    satoshi: number;
    isPaid: boolean;
    preimage: string;
    createdDate: any;
    expiryDate: any;
    paidDate: any;
    comments: any;
    arkAddress?: string;
}

const emptyTransaction: Transaction = {
    transactionid: 0,
    type: "",
    accountid: 0,
    paymentRequest: "",
    paymentHash: "",
    satoshi: 0,
    isPaid: true,
    preimage: "",
    createdDate: null,
    expiryDate: null,
    paidDate: "",
    comments: ""
}

const accounts = [
    {accountid: 1000, accountname: "Main Wallet", accounttype: "Asset", comments: "Main wallet for holding server funds"},
    {accountid: 1100, accountname: "Users wallets", accounttype: "Asset", comments: "Account for holding user funds"},
    {accountid: 2000, accountname: "Accounts Receivable", accounttype: "Asset", comments: "Pending invoices and receivables from customers"},
    {accountid: 4000, accountname: "Revenue", accounttype: "Revenue", comments: "Account for recording revenue"},
    {accountid: 5000, accountname: "Expenses", accounttype: "Expense", comments: "Account for recording expenses"},
    
];

interface paymentResultMessage extends ResultMessagev2 {
    payment_request: string;
}

interface invoiceReturnMessage extends ResultMessagev2 {
    invoice: Invoice;
}

interface amountReturnMessage extends ResultMessagev2 {
    amount: number;
}

interface Macaroon {
    ID: string;
    version: string;
    payment_hash: string;
    token_id: string;
    location: string;
    caveats: string[];
}

interface MacaroonResult  extends ResultMessagev2 {
    macaroon?: string;
    Invoice?: string;
    satoshi?: number;
}


interface PaymentProvider {
    generateInvoice: (satoshi: number) => Promise<Invoice>;
    isInvoicePaid: (paymentHash: string) => Promise<{paiddate : string, preimage : string}>;
    // Set to false if the provider doesn't need payments.LNAddress.
    requiresLNAddress?: boolean;
    // Native Ark payments (Blossom X-Ark), for providers that are Ark wallets.
    ark?: ArkPaymentProvider;
}

interface ArkPaymentProvider {
    // Whether the operator turned Ark payments on.
    enabled: () => boolean;
    // A fresh, never used Ark address of the server's wallet ("" on error).
    newAddress: () => Promise<string>;
    // Satoshis received on the address and settled in the wallet, -1 on error.
    received: (address: string, sync?: boolean) => Promise<number>;
    // Bring the wallet up to date with the Ark server before checking many addresses.
    sync: () => Promise<void>;
}

const tableCalculateMode: { [key: string]: "normal" | "reversed" } = {
    "registered": "reversed",
    "mediafiles": "normal",
   
};

export { Invoice, emptyInvoice, Transaction, emptyTransaction, accounts, paymentResultMessage, invoiceReturnMessage, amountReturnMessage, Macaroon, MacaroonResult, PaymentProvider, ArkPaymentProvider, tableCalculateMode}