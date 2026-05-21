/**
 * NIP-05 over Namecoin (`.bit`) resolver — plain-JS, self-contained.
 *
 * Lives alongside `plugins/namecoinNIP05.js` so the plugin has no dependency
 * on the compiled server tree (`dist/...`) or on any other file outside
 * `plugins/`. Operators can drop the two files into any nostrcheck-server
 * checkout and the plugin works regardless of build state.
 *
 * Companion to the existing DNS-based NIP-05 verification flow. This module
 * parses NIP-05 identifiers rooted in the Namecoin blockchain and resolves
 * them via public ElectrumX servers over TCP+TLS (Node's stdlib `tls`
 * module — no extra npm dependencies).
 *
 * Accepted identifiers:
 *
 *  - `alice@example.bit`
 *  - `example.bit` (uses the `_` root entry)
 *  - `d/example` (domain namespace, root)
 *  - `id/alice` (identity namespace)
 *  - A leading `nostr:` NIP-21 prefix is tolerated on any of the above.
 *
 * Local-part priority when scanning a `nostr.names` map: exact match → `_` →
 * first valid entry (only when the identifier targets the root `_`).
 *
 * Parser semantics mirror the rust-nostr `nip05namecoin` module byte-for-byte,
 * itself a port of the Kotlin (Amethyst), Swift (Nostur) and Go reference
 * implementations. Spec draft: nostr-protocol/nips#2349.
 */

import { createHash } from "crypto";
import * as tls from "tls";

// -----------------------------------------------------------------------------
// Default ElectrumX server list
// -----------------------------------------------------------------------------

/**
 * Default ElectrumX server endpoints maintained by the Namecoin ecosystem.
 *
 * Mirrors the Kotlin / Swift / Go / Rust reference implementations. These
 * operators currently serve self-signed TLS certificates; the pinned cert
 * bundle below is consulted alongside the system trust store.
 */
export const DEFAULT_ELECTRUMX_SERVERS = Object.freeze([
    { host: "nmc2.bitcoins.sk", portTcpTls: 57002, usePinnedTrustStore: true },
    { host: "electrumx.testls.space", portTcpTls: 50002, usePinnedTrustStore: true },
]);

/**
 * PEM-encoded bundle of pinned ElectrumX server certificates.
 *
 * Copied verbatim from the Kotlin Amethyst / Go reference. Refresh with:
 *   `echo | openssl s_client -connect HOST:PORT 2>/dev/null | openssl x509 -outform PEM`
 */
export const PINNED_ELECTRUMX_CERTS = Object.freeze([
    // electrumx.testls.space:50002 — expires 2027-05-04.
    `-----BEGIN CERTIFICATE-----
MIIDwzCCAqsCFGGKT5mjh7oN98aNyjOCiqafL8VyMA0GCSqGSIb3DQEBCwUAMIGd
MQswCQYDVQQGEwJVUzEQMA4GA1UECAwHQ2hpY2FnbzEQMA4GA1UEBwwHQ2hpY2Fn
bzESMBAGA1UECgwJSW50ZXJuZXRzMQ8wDQYDVQQLDAZJbnRlcncxHjAcBgNVBAMM
FWVsZWN0cnVtLnRlc3Rscy5zcGFjZTElMCMGCSqGSIb3DQEJARYWbWpfZ2lsbF84
OUBob3RtYWlsLmNvbTAeFw0yMjA1MDUwNjIzNDFaFw0yNzA1MDQwNjIzNDFaMIGd
MQswCQYDVQQGEwJVUzEQMA4GA1UECAwHQ2hpY2FnbzEQMA4GA1UEBwwHQ2hpY2Fn
bzESMBAGA1UECgwJSW50ZXJuZXRzMQ8wDQYDVQQLDAZJbnRlcncxHjAcBgNVBAMM
FWVsZWN0cnVtLnRlc3Rscy5zcGFjZTElMCMGCSqGSIb3DQEJARYWbWpfZ2lsbF84
OUBob3RtYWlsLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAO4H
+PKCdiiz3jNOA77aAmS2YaU7eOQ8ZGliEVr/PlLcgF5gmthb2DI6iK4KhC1ad34G
1n9IhkXPhkVJ94i8wB3uoTBlA7mI5h59m01yhzSkJAoYoU/i6DM9ipbakqWFCTEp
P+yE216NTU5MbYwThZdRSAIIABe9RyIliMSidyrwHvKBLfnJPFScghW6rhBWN7PG
PA8k0MFGzf+HXbpnV/jAvz08ZC34qiBIjkJrTgh49JweyoZKdppyJcH4UbkslJ2t
YUJR3oURBvrPj+D7TwLVRbX36ul7r4+dP3IjgmljsSAHDK4N/PfWrCBdlj9Pc1Cp
yX+ZDh8X2NrL4ukHoVMCAwEAATANBgkqhkiG9w0BAQsFAAOCAQEAeVj6VZNmY/Vb
nhzrC7xBSHqVWQ1wkLOClLsdvgKP8cFFJuUoCMQU5bPMi7nWnkfvvsIKH4Eibk5K
fqiA9jVsY0FHvQ8gP3KMk1LVuUf/sTcRe5itp3guBOSk/zXZUD5tUz/oRk3k+rdc
MsInqhomjNy/dqYmD6Wm4DNPjZh6fWy+AVQKVNOI2t4koaVdpoi8Uv8h4gFGPbdI
sVmtoGiIGkKNIWum+6mnF6PfynNrLk+ztH4TrdacVNeoJUPYEAxOuesWXFy3H4r+
HKBqA4xAzyjgKLPqoWnjSu7gxj1GIjBhnDxkM6wUOnDq8A0EqxR+A17OcXW9sZ2O
2ZIVwmtnyA==
-----END CERTIFICATE-----`,
    // nmc2.bitcoins.sk:57002 — expires 2030-10-22.
    `-----BEGIN CERTIFICATE-----
MIID+TCCAuGgAwIBAgIUdmJGukmfPvqmAYpTfuGcjRoYHJ8wDQYJKoZIhvcNAQEL
BQAwgYsxCzAJBgNVBAYTAlNLMREwDwYDVQQIDAhTbG92YWtpYTETMBEGA1UEBwwK
QnJhdGlzbGF2YTEUMBIGA1UECgwLYml0Y29pbnMuc2sxGTAXBgNVBAMMEG5tYzIu
Yml0Y29pbnMuc2sxIzAhBgkqhkiG9w0BCQEWFGRlYWZib3lAY2ljb2xpbmEub3Jn
MB4XDTIwMTAyNDE5MjQzOVoXDTMwMTAyMjE5MjQzOVowgYsxCzAJBgNVBAYTAlNL
MREwDwYDVQQIDAhTbG92YWtpYTETMBEGA1UEBwwKQnJhdGlzbGF2YTEUMBIGA1UE
CgwLYml0Y29pbnMuc2sxGTAXBgNVBAMMEG5tYzIuYml0Y29pbnMuc2sxIzAhBgkq
hkiG9w0BCQEWFGRlYWZib3lAY2ljb2xpbmEub3JnMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAzBUkZNDfaz7kc28l5tDKohJjekWmz1ynzfGx3ZLsqOZE
c+kNfcMaWU+zT/j0mV6pX6KSH7G9pPAku+8PRdKRq+d63wiJDEjGSaFztQWKW6L1
vTxgCK5gu+Eir3BkTagJObsrLKS+T6qH610/3+btGgoR3lunB5TzCgB/9oQanjDW
zjg2CwmxgR5Iw1Eqfenx7zkSK33FSXSF2SvbUs1Atj2oPU4DLivyrx0RaUmaPemn
cmcpnax+py4pQeB6dJWU1INhzXt3hTJRyoqsSGY3vCECIKIBIkh8GsYjAX4z+Y9y
6pJx0da2b88qPWdsoxaIMvrQiuWknDrSJwAyw2Yd8QIDAQABo1MwUTAdBgNVHQ4E
FgQUT2J83B2/9jxGGdFeWrxMohTzHNwwHwYDVR0jBBgwFoAUT2J83B2/9jxGGdFe
WrxMohTzHNwwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAsbxX
wN8tZaXOybImMZCQS7zfxmKl2IAcqu+R01KPfnIfrFqXPsGDDl3rYLkwh1O4/hYQ
NKNW9KTxoJxuBmAkm7EXQQh1XUUzajdEDqDBVRyvR0Z2MdMYnMSAiiMXMl2wUZnc
QXYftBo0HbtfsaJjImQdDjmlmRPSzE/RW6iUe+1cesKBC7e8nVf69Yu/fxO4m083
VWwAstlWJfk1GyU7jzVc8svealg/oIiDoOMe6CFSLx1BDv2FeHSpRdqd3fn+AC73
bK2N2smrHUOQnFijuiFw3WOrjERi0eMhjVNfVu9W9ZYa/Wd6SdIzV55LbG+NpmSf
5W7ix41hRvdT6cTAJA==
-----END CERTIFICATE-----`,
]);

// -----------------------------------------------------------------------------
// Identifier parsing
// -----------------------------------------------------------------------------

const HEX64_RE = /^[0-9a-f]{64}$/i;

const stripNostrPrefix = (s) =>
    s.length >= 6 && s.slice(0, 6).toLowerCase() === "nostr:" ? s.slice(6) : s;

/**
 * Reports whether an identifier should be routed to Namecoin resolution
 * instead of DNS-based NIP-05. Intentionally cheap: callers can use this as
 * a front-door check in hot paths before opening any network connection.
 */
export const isNamecoinIdentifier = (id) => {
    if (typeof id !== "string") return false;
    const trimmed = id.trim();
    if (!trimmed) return false;
    const stripped = stripNostrPrefix(trimmed).toLowerCase();
    if (stripped.startsWith("d/") || stripped.startsWith("id/")) return true;
    return stripped.endsWith(".bit");
};

/**
 * Parse a Namecoin identifier (`alice@example.bit`, `example.bit`,
 * `d/example`, `id/alice`). Returns `null` if the input cannot be parsed.
 *
 * Parser semantics mirror the rust-nostr `nip05namecoin::NamecoinAddress::parse`
 * byte-for-byte.
 */
export const parseIdentifier = (id) => {
    if (typeof id !== "string") return null;
    const input = stripNostrPrefix(id.trim());
    if (!input) return null;
    const lower = input.toLowerCase();

    if (lower.startsWith("d/")) {
        const rest = lower.slice(2);
        if (!rest) return null;
        return { namecoinName: lower, namespace: lower, localPart: "_", isDomain: true };
    }

    if (lower.startsWith("id/")) {
        const rest = lower.slice(3);
        if (!rest) return null;
        return { namecoinName: lower, namespace: lower, localPart: "_", isDomain: false };
    }

    if (input.includes("@") && lower.endsWith(".bit")) {
        const at = input.indexOf("@");
        const localRaw = input.slice(0, at);
        const domainRaw = input.slice(at + 1);
        const local = localRaw === "" ? "_" : localRaw.toLowerCase();
        const domainLower = domainRaw.toLowerCase();
        if (!domainLower.endsWith(".bit")) return null;
        const domain = domainLower.slice(0, -".bit".length);
        if (!domain) return null;
        const namecoinName = `d/${domain}`;
        return { namecoinName, namespace: namecoinName, localPart: local, isDomain: true };
    }

    if (lower.endsWith(".bit")) {
        const domain = lower.slice(0, -".bit".length);
        if (!domain) return null;
        const namecoinName = `d/${domain}`;
        return { namecoinName, namespace: namecoinName, localPart: "_", isDomain: true };
    }

    return null;
};

// -----------------------------------------------------------------------------
// JSON value extraction
// -----------------------------------------------------------------------------

const isHexPubkey = (value) =>
    typeof value === "string" && HEX64_RE.test(value);

const isPlainObject = (value) =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const relayListFor = (obj, pubkey) => {
    const relays = obj.relays;
    if (!isPlainObject(relays)) return undefined;
    const list = relays[pubkey.toLowerCase()];
    if (Array.isArray(list) && list.every((r) => typeof r === "string")) {
        return list.length > 0 ? list : undefined;
    }
    return undefined;
};

const extractFromDomain = (obj, localPart) => {
    const names = obj.names;
    if (!isPlainObject(names)) return null;

    let picked;
    const exact = names[localPart];
    if (isHexPubkey(exact)) picked = exact;
    if (!picked) {
        const root = names["_"];
        if (isHexPubkey(root)) picked = root;
    }
    if (!picked && localPart === "_") {
        for (const candidate of Object.values(names)) {
            if (isHexPubkey(candidate)) {
                picked = candidate;
                break;
            }
        }
    }
    if (!picked) return null;
    const pubkey = picked.toLowerCase();
    const relays = relayListFor(obj, pubkey);
    return relays ? { pubkey, relays } : { pubkey };
};

const extractFromIdentity = (obj) => {
    if (isHexPubkey(obj.pubkey)) {
        const pubkey = obj.pubkey.toLowerCase();
        let relays;
        if (Array.isArray(obj.relays) && obj.relays.every((r) => typeof r === "string")) {
            relays = obj.relays.length > 0 ? obj.relays : undefined;
        } else {
            relays = relayListFor(obj, pubkey);
        }
        return relays ? { pubkey, relays } : { pubkey };
    }

    const names = obj.names;
    if (isPlainObject(names)) {
        const root = names["_"];
        if (isHexPubkey(root)) {
            const pubkey = root.toLowerCase();
            const relays = relayListFor(obj, pubkey);
            return relays ? { pubkey, relays } : { pubkey };
        }
    }

    return null;
};

/**
 * Extract a NIP-05 result from a raw Namecoin name value string.
 *
 * Handles both the simple `{ "nostr": "hex" }` form and the extended
 * `{ "nostr": { "names": {...}, "relays": {...} } }` form used by Amethyst
 * and the `.bit` NIP-05 spec draft.
 */
export const extractPubkeyFromNamecoinValue = (value, localPart) => {
    if (typeof value !== "string" || !value) return null;
    const normalisedLocal = stripNostrPrefix(localPart || "_").toLowerCase() || "_";

    let parsed;
    try {
        parsed = JSON.parse(value);
    } catch {
        return null;
    }
    if (!isPlainObject(parsed)) return null;

    const nostrField = parsed.nostr;
    if (nostrField === undefined) return null;

    // Simple form: "nostr": "hex-pubkey".
    if (typeof nostrField === "string") {
        if (normalisedLocal !== "_") return null;
        if (!isHexPubkey(nostrField)) return null;
        return { pubkey: nostrField.toLowerCase() };
    }

    if (!isPlainObject(nostrField)) return null;

    const domainHit = extractFromDomain(nostrField, normalisedLocal);
    if (domainHit) return domainHit;

    return extractFromIdentity(nostrField);
};

// -----------------------------------------------------------------------------
// Namecoin script + ElectrumX scripthash helpers
// -----------------------------------------------------------------------------

const OP_NAME_UPDATE = 0x53;
const OP_2DROP = 0x6d;
const OP_DROP = 0x75;
const OP_RETURN = 0x6a;
const OP_PUSHDATA1 = 0x4c;
const OP_PUSHDATA2 = 0x4d;
const OP_PUSHDATA4 = 0x4e;

const pushData = (out, data) => {
    const n = data.length;
    if (n < OP_PUSHDATA1) {
        out.push(n & 0xff);
    } else if (n <= 0xff) {
        out.push(OP_PUSHDATA1, n & 0xff);
    } else if (n <= 0xffff) {
        out.push(OP_PUSHDATA2, n & 0xff, (n >> 8) & 0xff);
    } else {
        out.push(OP_PUSHDATA4, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff);
    }
    for (let i = 0; i < n; i++) out.push(data[i]);
};

/**
 * Build the canonical name-index script used by the Namecoin ElectrumX fork.
 * Format: `OP_NAME_UPDATE <push(name)> <push(empty)> OP_2DROP OP_DROP OP_RETURN`.
 */
export const buildNameIndexScript = (name) => {
    const out = [];
    out.push(OP_NAME_UPDATE);
    pushData(out, Buffer.from(name, "utf8"));
    pushData(out, Buffer.alloc(0));
    out.push(OP_2DROP, OP_DROP, OP_RETURN);
    return Buffer.from(out);
};

/**
 * Compute the Electrum scripthash: SHA-256 of `script`, byte-reversed, hex-lc.
 */
export const electrumScriptHash = (script) => {
    const digest = createHash("sha256").update(script).digest();
    const reversed = Buffer.from(digest).reverse();
    return reversed.toString("hex");
};

const readPushData = (script, pos) => {
    if (pos >= script.length) return null;
    const op = script[pos];
    if (op === 0x00) return { data: Buffer.alloc(0), next: pos + 1 };
    if (op < OP_PUSHDATA1) {
        const end = pos + 1 + op;
        if (end > script.length) return null;
        return { data: script.subarray(pos + 1, end), next: end };
    }
    if (op === OP_PUSHDATA1) {
        if (pos + 2 > script.length) return null;
        const length = script[pos + 1];
        const end = pos + 2 + length;
        if (end > script.length) return null;
        return { data: script.subarray(pos + 2, end), next: end };
    }
    if (op === OP_PUSHDATA2) {
        if (pos + 3 > script.length) return null;
        const length = script[pos + 1] | (script[pos + 2] << 8);
        const end = pos + 3 + length;
        if (end > script.length) return null;
        return { data: script.subarray(pos + 3, end), next: end };
    }
    if (op === OP_PUSHDATA4) {
        if (pos + 5 > script.length) return null;
        const length =
            script[pos + 1] |
            (script[pos + 2] << 8) |
            (script[pos + 3] << 16) |
            (script[pos + 4] << 24);
        const end = pos + 5 + length;
        if (end > script.length) return null;
        return { data: script.subarray(pos + 5, end), next: end };
    }
    return null;
};

/**
 * Parse a Namecoin `NAME_UPDATE` output script and return `{ name, value }`.
 * Returns `null` if the script cannot be decoded.
 */
export const parseNameUpdateScript = (script) => {
    if (script.length === 0 || script[0] !== OP_NAME_UPDATE) return null;
    const namePush = readPushData(script, 1);
    if (!namePush) return null;
    const valuePush = readPushData(script, namePush.next);
    if (!valuePush) return null;
    return {
        name: Buffer.from(namePush.data),
        value: Buffer.from(valuePush.data),
    };
};

// -----------------------------------------------------------------------------
// ElectrumX TCP+TLS transport
// -----------------------------------------------------------------------------

const ELECTRUM_PROTOCOL_VERSION = "1.4";
const NAME_EXPIRE_DEPTH = 36000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_READ_TIMEOUT_MS = 15_000;

const buildSecureContext = (server) => {
    if (!server.usePinnedTrustStore) return undefined;
    try {
        return tls.createSecureContext({ ca: PINNED_ELECTRUMX_CERTS.slice() });
    } catch {
        return undefined;
    }
};

const dialElectrum = (server, options) => {
    const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    const readTimeoutMs = options.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
        let settled = false;
        const opts = {
            host: server.host,
            port: server.portTcpTls,
            servername: server.host,
            minVersion: "TLSv1.2",
        };

        const pinnedCtx = buildSecureContext(server);
        if (pinnedCtx) {
            opts.secureContext = pinnedCtx;
            // Trust system roots OR the pinned self-signed bundle.
            // Hostname binding stays enforced via `servername`. We override
            // the cert chain check so the pinned bundle counts as a root.
            opts.rejectUnauthorized = false;
            const expectedHost = server.host;
            opts.checkServerIdentity = (host) => {
                if (host !== expectedHost) {
                    return new Error(
                        `namecoin: unexpected TLS host ${host} (expected ${expectedHost})`,
                    );
                }
                return undefined;
            };
        }

        const onError = (err) => {
            if (settled) return;
            settled = true;
            try {
                socket.destroy();
            } catch {
                /* swallow */
            }
            reject(err);
        };

        const connectTimer = setTimeout(() => {
            onError(new Error(`namecoin: connect timeout ${server.host}:${server.portTcpTls}`));
        }, connectTimeoutMs);

        const socket = tls.connect(opts, () => {
            clearTimeout(connectTimer);
            if (!socket.authorized) {
                const reason = socket.authorizationError;
                if (server.usePinnedTrustStore) {
                    onError(
                        new Error(
                            `namecoin: TLS cert for ${server.host} not in system or pinned trust store: ${reason}`,
                        ),
                    );
                    return;
                }
                onError(new Error(`namecoin: TLS handshake failed for ${server.host}: ${reason}`));
                return;
            }

            let buffered = "";
            const pendingResolvers = [];
            const pendingRejectors = [];
            let readTimer;

            const armReadTimer = () => {
                if (readTimer) clearTimeout(readTimer);
                readTimer = setTimeout(() => {
                    const err = new Error(
                        `namecoin: read timeout from ${server.host}:${server.portTcpTls}`,
                    );
                    while (pendingRejectors.length) {
                        const rej = pendingRejectors.shift();
                        pendingResolvers.shift();
                        rej(err);
                    }
                    try {
                        socket.destroy();
                    } catch {
                        /* swallow */
                    }
                }, readTimeoutMs);
            };

            const dispatch = () => {
                while (pendingResolvers.length > 0) {
                    const newlineIdx = buffered.indexOf("\n");
                    if (newlineIdx < 0) break;
                    const line = buffered.slice(0, newlineIdx);
                    buffered = buffered.slice(newlineIdx + 1);
                    const resolveFn = pendingResolvers.shift();
                    pendingRejectors.shift();
                    resolveFn(line);
                }
                if (pendingResolvers.length === 0 && readTimer) {
                    clearTimeout(readTimer);
                    readTimer = undefined;
                }
            };

            socket.setEncoding("utf8");
            socket.on("data", (chunk) => {
                buffered += chunk;
                dispatch();
            });

            const fail = (err) => {
                while (pendingRejectors.length) {
                    const rej = pendingRejectors.shift();
                    pendingResolvers.shift();
                    rej(err);
                }
                if (readTimer) {
                    clearTimeout(readTimer);
                    readTimer = undefined;
                }
            };

            socket.on("error", fail);
            socket.on("close", () => fail(new Error(`namecoin: socket closed by ${server.host}`)));

            const conn = {
                write(line) {
                    socket.write(line.endsWith("\n") ? line : line + "\n");
                },
                nextLine() {
                    return new Promise((resolveLine, rejectLine) => {
                        const newlineIdx = buffered.indexOf("\n");
                        if (newlineIdx >= 0) {
                            const line = buffered.slice(0, newlineIdx);
                            buffered = buffered.slice(newlineIdx + 1);
                            resolveLine(line);
                            return;
                        }
                        pendingResolvers.push(resolveLine);
                        pendingRejectors.push(rejectLine);
                        armReadTimer();
                    });
                },
                close() {
                    if (readTimer) clearTimeout(readTimer);
                    try {
                        socket.end();
                        socket.destroy();
                    } catch {
                        /* swallow */
                    }
                },
            };

            settled = true;
            resolve(conn);
        });

        socket.on("error", (err) => {
            clearTimeout(connectTimer);
            onError(err);
        });
    });
};

let rpcCounter = 0;
const nextRpcId = () => {
    rpcCounter = (rpcCounter + 1) | 0;
    if (rpcCounter <= 0) rpcCounter = 1;
    return rpcCounter;
};

const sendRpc = async (conn, method, params) => {
    const id = nextRpcId();
    conn.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    const line = await conn.nextLine();
    try {
        return JSON.parse(line);
    } catch (err) {
        throw new Error(`namecoin: invalid JSON-RPC reply for ${method}: ${err.message}`);
    }
};

const queryNameValue = async (name, server, options) => {
    const conn = await dialElectrum(server, options);
    try {
        await sendRpc(conn, "server.version", ["nostrcheck-server/namecoin", ELECTRUM_PROTOCOL_VERSION]);

        const script = buildNameIndexScript(name);
        const scriptHash = electrumScriptHash(script);
        const history = await sendRpc(conn, "blockchain.scripthash.get_history", [scriptHash]);
        if (!Array.isArray(history.result) || history.result.length === 0) return null;
        const latest = history.result[history.result.length - 1];
        if (!latest || typeof latest.tx_hash !== "string") return null;

        const headers = await sendRpc(conn, "blockchain.headers.subscribe", []);
        const currentHeight = typeof headers.result?.height === "number" ? headers.result.height : 0;
        if (currentHeight > 0 && latest.height > 0 && currentHeight - latest.height >= NAME_EXPIRE_DEPTH) {
            return null;
        }

        const tx = await sendRpc(conn, "blockchain.transaction.get", [latest.tx_hash, true]);
        const vouts = tx.result?.vout;
        if (!Array.isArray(vouts)) return null;

        for (const vout of vouts) {
            const hexScript = vout?.scriptPubKey?.hex;
            if (typeof hexScript !== "string" || !hexScript.startsWith("53")) continue;
            let scriptBytes;
            try {
                scriptBytes = Buffer.from(hexScript, "hex");
            } catch {
                continue;
            }
            const decoded = parseNameUpdateScript(scriptBytes);
            if (!decoded) continue;
            if (decoded.name.toString("utf8") !== name) continue;
            return decoded.value.toString("utf8");
        }
        return null;
    } finally {
        conn.close();
    }
};

/**
 * Resolve a NIP-05/Namecoin identifier to its on-chain Nostr pubkey.
 *
 * Tries each ElectrumX server in {@link DEFAULT_ELECTRUMX_SERVERS} in order
 * (operators can override via `options.servers`). Returns `null` when the
 * name is unregistered, expired, the value cannot be parsed, or every
 * server is unreachable. Does **not** throw on network errors — the caller
 * gets `null` and is expected to deny verification.
 */
export const resolveNamecoinNIP05 = async (id, options = {}) => {
    const parsed = parseIdentifier(id);
    if (!parsed) return null;

    const servers = (options.servers ?? DEFAULT_ELECTRUMX_SERVERS).slice();
    if (servers.length === 0) return null;

    for (const server of servers) {
        try {
            const value = await queryNameValue(parsed.namecoinName, server, options);
            if (!value) continue;
            const extracted = extractPubkeyFromNamecoinValue(value, parsed.localPart);
            if (extracted) return extracted;
            return null;
        } catch {
            // Transport error — try the next server.
            continue;
        }
    }
    return null;
};
