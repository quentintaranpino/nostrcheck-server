import { dbMultiSelect } from "./database/core.js";

const getLightningAddress = async (pubkey: string) => {

    if (!pubkey || pubkey == "") return "";

    const LNAddress = await dbMultiSelect(["lightningaddress"], "lightning", "pubkey = ?", [pubkey], true);
    if (!LNAddress || LNAddress.length === 0 || !LNAddress[0].lightningaddress) return "";

    return LNAddress[0].lightningaddress;
    
}

export { getLightningAddress };