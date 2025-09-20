import { generateAuthToken } from "./authorization.js";
import { getConfig } from "./config/core.js";
import { dbMultiSelect } from "./database/core.js";
import { Request, Response } from "express";
import { hextoNpub } from "./nostr/NIP19.js";
import path from "path";
import fs from "fs";
import { Page } from "../interfaces/frontend.js";

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
        "<p>The server is <b>ready to run</b> as it is, but you must be very clear about the following points.</p>" +
        "<p>You are currently logged in automatically with the super administrator account: <b>'public'</b>." + 
        "This user is created by default and is essential for the server's operation. <b>Do not delete this user</b>.</p>";

        if(getConfig(null, ["environment"]) != "production"){
          res.locals.firstUse +=
          "<h5 class='mt-3 mb-2'>Development mode</h5>" +
          "<div class='alert alert-warning ps-2 pe-2 pt-1 pb-0' role='alert'>" +
            "<p>Development mode is currently enabled.</p>" +
            "<p>Make sure you switch to <b>production</b> environment and place the server " +
            "behind a secure HTTPS proxy (like Nginx or Traefik). Running in development mode keeps the server " +
            "less secure and should only be used temporarily during initial setup or local testing.</p>" +
            "<p>If the environment is set to <b>production</b> but the site is not served over <b>HTTPS</b>, " +
            "you will lose access</b> to manage the server. <b>Never run a public server in development mode.</b>" +
          "</div>";
        }

        res.locals.firstUse +=
        "<h5 class='mt-3 mb-2'>Autologin enabled</h5>" +
        "<div class='alert alert-danger ps-2 pe-2 pt-1 pb-0' role='alert'>" +
          "<p><b>Autologin is currently enabled.</b> This means the server will automatically log in with the public user until you manually disable autologin in the settings.</p>" +
          "<p><b>We strongly recommend that you:</b><br>" +
          "- Backup the public/private key available on the <a class='text-decoration-none' href='settings#settingsServer' target='blank'>settings page</a>.<br>" +
          "- Note down the legacy password sent via nostr DM to this 'public' user.<br>" +
          "- Create your own user on <a class='text-decoration-none' href='dashboard'>dashboard</a> and set it as <code>allowed</code> (admin rights).<br>" +
          "- Disable autologin in the <a class='text-decoration-none' href='settings' target='blank'>settings page</a>.</p>" +
        "</div>" +
      
        "<h5 class='mt-3 mb-2'>Server public user</h5>" +
        "<p>The 'public' user was created using the key pair defined in the configuration file to allow easy access during the the initial setup steps. The server communicates externally using this same key pair.</p>" +
        "<p>This 'public' user is also the one that answers <code>NIP-05</code> requests of the form <code>_@server.com</code>. Clients usually treat the identifier <code>_@domain</code> as the root identifier.</p>" +
       
        "<div class='alert alert-warning ps-2 pe-2 pt-1 pb-0' role='alert'>" +
          "<p>Ensure the server's configuration file pubkey matches the 'public' user's pubkey to <b>avoid inconsistencies</b> in communication and data.</p>" +
          "<p>If you need to change the server's pubkey/secret, update it in both places (Settings and editing the 'public' user) before restarting the server.</p>" +
        "</div>" +

        "<h5 class='mt-3 mb-2'>Documentation</h5>" +
        "<p>It is highly recommended to review the <a href='https://github.com/quentintaranpino/nostrcheck-server/wiki' target='_blank'>project documentation</a> " +
        "before proceeding with further server configuration steps.</p>" +
      
        "";
      
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

const getResource = async (tenant : string, filename : string): Promise<string | null> => {
  
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);

  const pathsToTry = [
      path.resolve(`./src/pages/static/resources/tenants/${tenant}/${filename}`),
      path.resolve(`./src/pages/static/resources/tenants/global/${filename}`),
      path.resolve(`./src/pages/static/resources/${name}.default${ext}`),
      path.resolve(`./src/pages/static/resources/${filename}`),
  ];

  for (const filePath of pathsToTry) {
      try {
          await fs.promises.access(filePath, fs.constants.F_OK);
          return filePath;
      }
      catch (err) {
          // Ignore the error.
      }
  
  }

  return null;

};

const getSiteManifest = async (req: Request, res: Response) => {
  const domain = req.hostname;

  const siteName = getConfig(domain, ["appearance", "siteName"]) || getConfig(domain, ["server", "host"]) || "Nostrcheck Server";
  const shortName = siteName.slice(0, 12);
  const themeColor = getConfig(domain, ["appearance", "themeColor"]) || "#ffffff";
  const backgroundColor = "#ffffff"; 

  const manifest = {
    name: siteName,
    short_name: shortName,
    icons: [
      {
        src: "/static/resources/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/static/resources/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ],
    theme_color: themeColor,
    background_color: backgroundColor,
    display: "standalone",
    orientation: "portrait",
  };

  res.setHeader("Content-Type", "application/manifest+json");
  res.send(JSON.stringify(manifest, null, 2));
};

const replaceTokens = (domain: string | null, input: string | null | undefined): string => {
  if (typeof input !== 'string') return '';
  return input.replace(/{([^}]+)}/g, (match, tokenPath) => {
    const keys = tokenPath.split(".");
    const value = getConfig(domain, keys);
    if (value === undefined || value === null) {
      return match;
    }
    return String(value);
  });
};


const generateSitemap = (pages: Page[], baseUrl: string): string => {
  const urlset = pages.map((page: Page) => {
    const loc = `${baseUrl.replace(/\/+$/, "")}${page.path}`;
    const lastmod = page.lastmod ? `<lastmod>${page.lastmod}</lastmod>` : "";
    const changefreq = page.changefreq ? `<changefreq>${page.changefreq}</changefreq>` : "";
    const priority = page.priority !== undefined ? `<priority>${page.priority.toFixed(1)}</priority>` : "";
    return `
  <url>
    <loc>${loc}</loc>
    ${lastmod}
    ${changefreq}
    ${priority}
  </url>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlset}
</urlset>`;

}


export {isAutoLoginEnabled, countPubkeyFiles, setAuthCookie, getLegalText, getResource, replaceTokens, getSiteManifest, generateSitemap};