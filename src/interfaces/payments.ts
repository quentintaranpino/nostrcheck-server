interface invoice {
    paymentRequest: string;
    paymentHash: string;
    createdDate: any;
    expiryDate: any;
    description: any;
    isPaid: () => Promise<boolean>;
    verifyPayment: () => Promise<boolean>;
}

interface checkPaymentResult {
    paymentRequest: string;
    satoshi: number;
}

export { invoice, checkPaymentResult}