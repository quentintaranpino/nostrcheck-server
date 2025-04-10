import { generateAuthToken } from "./authorization.js";
import { getConfig } from "./config/core.js";
import { dbMultiSelect } from "./database.js";
import { Request, Response } from "express";
import { hextoNpub } from "./nostr/NIP19.js";

const countPubkeyFiles = async (pubkey: string): Promise<number> => {

    const files = await dbMultiSelect(["id"], "mediafiles", "pubkey = ?", [pubkey], false);
    return files ? files.length : 0;
}

const isAutoLoginEnabled = async (req : Request, res: Response): Promise<boolean> => {
	
	if (getConfig(null, ["autoLogin"]) == true){
        req.session.identifier = getConfig(req.hostname, ["server", "pubkey"]);
        const authToken = generateAuthToken(req.session.identifier, true);
        setAuthCookie(res, authToken);
        req.session.metadata = {
            hostedFiles: 0,
            usernames: [],
            pubkey: getConfig(req.hostname, ["server", "pubkey"]),
            npub: await hextoNpub(getConfig(req.hostname, ["server", "pubkey"])),
            lud16: ""
        }
        res.locals.firstUse =  
        "<h5 class='mt-3 mb-2'>Read this carefully 💜</h5>" +
        "<p>You are currently logged in automatically with the special administrator account: <b>'public'</b>. This user is created by default and is essential for the server's initial operation. <b>Do not delete this user</b>.</p>" +
      
        "<div class='alert alert-danger ps-2 pe-2 pt-1 pb-0' role='alert'>" +
          "<p><b>Autologin is currently enabled.</b> This means the server will automatically log in with the 'public' user until <b>you manually disable autologin in the settings</b>.</p>" +
          "<p><b>We strongly recommend that you:</b><br>" +
          "- Create a new user as soon as possible.<br>" +
          "- Backup the <b>private key</b> available on the <a class='text-decoration-none' href='settings#settingsServer' target='blank'>settings page</a>.<br>" +
          "- Note down the <b>legacy password</b> sent via nostr DM to the 'public' user.</p>" +
        "</div>" +
      
        "<h5 class='mt-3 mb-2'>Key Management</h5>" +
        "<p>The 'public' user was created using the key pair defined in the configuration file to allow easy access during the first use. The server communicates externally using this same key pair.</p>" +
        "<div class='alert alert-warning ps-2 pe-2 pt-1 pb-0' role='alert'>" +
          "<p><b>Ensure the server's pubkey matches the 'public' user's pubkey</b> to avoid inconsistencies in communication and data.</p>" +
        "</div>" +
      
        "<h5 class='mt-3 mb-2'>Disabling Autologin</h5>" +
        "<p>Once you've created another user and are confident you have safely stored the 'public' user's credentials and keys, you should disable autologin from the <a class='text-decoration-none' href='settings#settingsServer' target='blank'>settings page</a>. After that, the server will no longer log in automatically.</p>" +
      
        "<h5 class='mt-3 mb-2'>Login Methods</h5>" +
        "<p>Users can log in using one of the following methods:</p>" +
        "<ul>" +
          "<li>With a <b>NIP-07 browser extension</b> (more info <a class='text-decoration-none' href='https://nostrcheck.me/register/browser-extension.php' target='blank'>here</a>).</li>" +
          "<li>Via traditional username and password.</li>" +
          "<li>Using a <b>one-time login code</b> sent via nostr DM to the user's pubkey.</li>" +
        "</ul>" +
      
        "<div class='alert alert-primary ps-2 pe-2 pt-1 pb-0' role='alert'>" +
          "<p>The legacy password for the 'public' user <b>has been sent via nostr DM to the same pubkey</b>. You can retrieve it using any nostr client.</p>" +
        "</div>" +
      
        "<p>Note: Passwords are always sent via DM and cannot be set manually. You can reset any user's password at any time.</p>";
      
        return true;
    }

    return false;
}

/**
 * Sets the authkey cookie and sends it in the response
 * 
 * @param res - The Express response object
 * @param token - The JWT token to be set in the cookie
 */
const setAuthCookie = (res: Response, token: string) => {

    const currentToken = res.getHeader('Set-Cookie')?.toString().includes(`authkey=${token}`) ? token : null;

    if (currentToken  == token) return;

    res.cookie('authkey', token, {
        httpOnly: getConfig(null, ["environment"]) != "production" ? false : true,
        secure: getConfig(null, ["environment"]) != "production" ? false : true,
        sameSite: 'strict',
        maxAge: getConfig(null, ["session", "maxAge"]),
    });
};

const getLegalText = (hostname : string): string => {

    const legal = getConfig(hostname, ["server", "legal"]);

    if (legal.entityType === "company") {
        return `
* This service is operated by **${legal.company}**.
* Contact email: **${legal.email}**
* Registered address: **${legal.address}**
* Country of operation: **${legal.country}**
* Jurisdiction: **${legal.jurisdiction}**
* VAT Number: **${legal.vat || "Not applicable"}**
* PHONE: **${legal.phone || "Not applicable"}**
        `.trim();
    } else {
        return `
* This service is operated by an **individual operator**.
* Contact email: **${legal.email}**
* Registered address: **Confidential**
* Country of operation: **${legal.country}**
* Jurisdiction: **${legal.jurisdiction}**
* VAT Number: **Not applicable**
* PHONE: **Not applicable**
        `.trim();
    }
}

export {isAutoLoginEnabled, countPubkeyFiles, setAuthCookie, getLegalText};