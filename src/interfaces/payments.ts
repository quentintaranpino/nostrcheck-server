interface invoice {
    paymentRequest: string;
    paymentHash: string;
    createdDate: any;
    expiryDate: any;
    description: any;
    isPaid: boolean;
    transactionid: number;
    satoshi: number;
}

interface checkPaymentResult {
    paymentRequest: string;
    satoshi: number;
}

export { invoice, checkPaymentResult}