interface TenantInfo {
    requireinvite: boolean;
    requirepayment: boolean;
    maxsatoshi: number;
    minUsernameLength: number;
    maxUsernameLength: number;
};

export { TenantInfo };