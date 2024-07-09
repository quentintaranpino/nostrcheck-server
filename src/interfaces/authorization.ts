import { ResultMessagev2 } from "./server.js";

type credentialTypes = 'password' | 'authkey' | 'otc';

interface authHeaderResult extends ResultMessagev2 {
    authkey: string,
    pubkey: string
}

export { credentialTypes, authHeaderResult };
