interface IpInfo {
    ip: string;
    reqcount: number;
    banned: boolean;
    domainId: number;
    domain: string;
    comments: string;
    pubkey?: string;
} 

export { IpInfo };