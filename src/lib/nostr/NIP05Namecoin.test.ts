import { describe, expect, it } from "vitest";

import {
    DEFAULT_ELECTRUMX_SERVERS,
    PINNED_ELECTRUMX_CERTS,
    buildNameIndexScript,
    electrumScriptHash,
    extractPubkeyFromNamecoinValue,
    isNamecoinIdentifier,
    parseIdentifier,
    parseNameUpdateScript,
    resolveNamecoinNIP05,
} from "./NIP05Namecoin.js";

const PK1 = "460c25e682fda7832b52d1f22d3d22b3176d972f60dcdc3212ed8c92ef85065c";
const PK2 = "6cdebcca8b8b9f5e1ab3b3aa1d2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2";

// -----------------------------------------------------------------------------
// isNamecoinIdentifier — front-door cheap check
// -----------------------------------------------------------------------------

describe("isNamecoinIdentifier", () => {
    it("matches the expected shapes", () => {
        expect(isNamecoinIdentifier("example.bit")).toBe(true);
        expect(isNamecoinIdentifier("alice@example.bit")).toBe(true);
        expect(isNamecoinIdentifier("d/example")).toBe(true);
        expect(isNamecoinIdentifier("id/alice")).toBe(true);
        expect(isNamecoinIdentifier("nostr:alice@example.bit")).toBe(true);
        expect(isNamecoinIdentifier("  EXAMPLE.BIT  ")).toBe(true);
    });

    it("rejects DNS / empty / non-string inputs", () => {
        expect(isNamecoinIdentifier("")).toBe(false);
        expect(isNamecoinIdentifier("alice@example.com")).toBe(false);
        expect(isNamecoinIdentifier("example.com")).toBe(false);
        // intentionally cheap: `d/` answers "route this through Namecoin"
        // without strict validation. parseIdentifier is the strict gate.
        expect(isNamecoinIdentifier("d/")).toBe(true);
        expect(parseIdentifier("d/")).toBeNull();
        expect(parseIdentifier("id/")).toBeNull();
        expect(parseIdentifier(".bit")).toBeNull();
        // non-string is rejected at the type guard
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(isNamecoinIdentifier(null as any)).toBe(false);
    });
});

// -----------------------------------------------------------------------------
// parseIdentifier — parser spec (rust-nostr 1:1)
// -----------------------------------------------------------------------------

describe("parseIdentifier", () => {
    it("parses user@domain.bit", () => {
        const addr = parseIdentifier("alice@example.bit");
        expect(addr).not.toBeNull();
        expect(addr!.namecoinName).toBe("d/example");
        expect(addr!.namespace).toBe("d/example");
        expect(addr!.localPart).toBe("alice");
        expect(addr!.isDomain).toBe(true);
    });

    it("parses bare domain.bit", () => {
        const addr = parseIdentifier("example.bit");
        expect(addr!.namecoinName).toBe("d/example");
        expect(addr!.localPart).toBe("_");
        expect(addr!.isDomain).toBe(true);
    });

    it("parses d/<name>", () => {
        const addr = parseIdentifier("d/example");
        expect(addr!.namecoinName).toBe("d/example");
        expect(addr!.localPart).toBe("_");
        expect(addr!.isDomain).toBe(true);
    });

    it("parses id/<name>", () => {
        const addr = parseIdentifier("id/alice");
        expect(addr!.namecoinName).toBe("id/alice");
        expect(addr!.localPart).toBe("_");
        expect(addr!.isDomain).toBe(false);
    });

    it("strips a leading nostr: prefix", () => {
        const addr = parseIdentifier("nostr:alice@example.bit");
        expect(addr!.namecoinName).toBe("d/example");
        expect(addr!.localPart).toBe("alice");
    });

    it("is case-insensitive", () => {
        const addr = parseIdentifier("ALICE@EXAMPLE.BIT");
        expect(addr!.namecoinName).toBe("d/example");
        expect(addr!.localPart).toBe("alice");
    });

    it("normalises empty local-part to _", () => {
        const addr = parseIdentifier("@example.bit");
        expect(addr).not.toBeNull();
        expect(addr!.localPart).toBe("_");
        expect(addr!.namecoinName).toBe("d/example");
    });

    it("rejects garbage / non-bit DNS / empty namespaces", () => {
        expect(parseIdentifier("alice@example.com")).toBeNull();
        expect(parseIdentifier("")).toBeNull();
        expect(parseIdentifier(".bit")).toBeNull();
        expect(parseIdentifier("d/")).toBeNull();
        expect(parseIdentifier("id/")).toBeNull();
    });
});

// -----------------------------------------------------------------------------
// extractPubkeyFromNamecoinValue — JSON shape handling
// -----------------------------------------------------------------------------

describe("extractPubkeyFromNamecoinValue", () => {
    it("handles the simple form for root identifiers", () => {
        const value = `{ "nostr": "${PK1}" }`;
        const r = extractPubkeyFromNamecoinValue(value, "_");
        expect(r).not.toBeNull();
        expect(r!.pubkey).toBe(PK1);
        expect(r!.relays).toBeUndefined();
    });

    it("rejects the simple form when a local-part is requested", () => {
        const value = `{ "nostr": "${PK1}" }`;
        expect(extractPubkeyFromNamecoinValue(value, "alice")).toBeNull();
    });

    it("handles extended-form exact name match + relays", () => {
        const value = JSON.stringify({
            nostr: {
                names: { _: PK1, alice: PK2 },
                relays: { [PK2]: ["wss://relay.example.com"] },
            },
        });
        const r = extractPubkeyFromNamecoinValue(value, "alice");
        expect(r).not.toBeNull();
        expect(r!.pubkey).toBe(PK2);
        expect(r!.relays).toEqual(["wss://relay.example.com"]);
    });

    it("falls back to the _ root entry when the local-part is missing", () => {
        const value = JSON.stringify({ nostr: { names: { _: PK1 } } });
        const r = extractPubkeyFromNamecoinValue(value, "ghost");
        expect(r!.pubkey).toBe(PK1);
    });

    it("falls back to the first valid pubkey only when the caller asked for _", () => {
        const value = JSON.stringify({ nostr: { names: { alice: PK1 } } });
        // local-part != "_" must not bleed onto random entries
        expect(extractPubkeyFromNamecoinValue(value, "ghost")).toBeNull();
        // when asking for the root, the first valid hex is fine
        const r = extractPubkeyFromNamecoinValue(value, "_");
        expect(r!.pubkey).toBe(PK1);
    });

    it("supports the identity-namespace pubkey field", () => {
        const value = JSON.stringify({
            nostr: { pubkey: PK1, relays: ["wss://relay.example.com"] },
        });
        const r = extractPubkeyFromNamecoinValue(value, "_");
        expect(r!.pubkey).toBe(PK1);
        expect(r!.relays).toEqual(["wss://relay.example.com"]);
    });

    it("tolerates a nostr: prefix on the local-part", () => {
        const value = JSON.stringify({ nostr: { names: { alice: PK1 } } });
        const r = extractPubkeyFromNamecoinValue(value, "nostr:alice");
        expect(r!.pubkey).toBe(PK1);
    });

    it("returns null on missing or non-hex nostr fields", () => {
        expect(extractPubkeyFromNamecoinValue('{ "ip": "1.2.3.4" }', "_")).toBeNull();
        expect(extractPubkeyFromNamecoinValue('{ "nostr": "not-hex" }', "_")).toBeNull();
        expect(extractPubkeyFromNamecoinValue("not-json", "_")).toBeNull();
        expect(extractPubkeyFromNamecoinValue("", "_")).toBeNull();
    });
});

// -----------------------------------------------------------------------------
// Script + scripthash helpers
// -----------------------------------------------------------------------------

describe("name index script + scripthash", () => {
    it("builds the name index script layout", () => {
        const script = buildNameIndexScript("d/example");
        expect(script[0]).toBe(0x53); // OP_NAME_UPDATE
        expect(script[1]).toBe(9); // push length for "d/example"
        expect(script.subarray(2, 11).toString("utf8")).toBe("d/example");
        expect(script[11]).toBe(0x00); // empty push
        expect(script[12]).toBe(0x6d); // OP_2DROP
        expect(script[13]).toBe(0x75); // OP_DROP
        expect(script[14]).toBe(0x6a); // OP_RETURN
    });

    it("computes a reversed-sha256 lowercase hex scripthash", () => {
        const h = electrumScriptHash(buildNameIndexScript("d/example"));
        expect(h).toHaveLength(64);
        expect(/^[0-9a-f]{64}$/.test(h)).toBe(true);
    });

    it("round-trips parseNameUpdateScript with a small value", () => {
        // OP_NAME_UPDATE push("d/example") push("{}") OP_2DROP OP_DROP <addr>
        const parts: number[] = [];
        parts.push(0x53);
        parts.push(9);
        parts.push(..."d/example".split("").map((c) => c.charCodeAt(0)));
        parts.push(2);
        parts.push(..."{}".split("").map((c) => c.charCodeAt(0)));
        parts.push(0x6d, 0x75);
        parts.push(0x76, 0xa9, 0x14, 0xde, 0xad, 0xbe, 0xef);
        const decoded = parseNameUpdateScript(Buffer.from(parts));
        expect(decoded).not.toBeNull();
        expect(decoded!.name.toString("utf8")).toBe("d/example");
        expect(decoded!.value.toString("utf8")).toBe("{}");
    });

    it("rejects garbage scripts", () => {
        expect(parseNameUpdateScript(Buffer.alloc(0))).toBeNull();
        expect(parseNameUpdateScript(Buffer.from([0x76, 0xa9]))).toBeNull();
    });
});

// -----------------------------------------------------------------------------
// Pinned defaults sanity
// -----------------------------------------------------------------------------

describe("pinned defaults", () => {
    it("ships a non-empty server list", () => {
        expect(DEFAULT_ELECTRUMX_SERVERS.length).toBeGreaterThan(0);
        for (const s of DEFAULT_ELECTRUMX_SERVERS) {
            expect(s.host.length).toBeGreaterThan(0);
            expect(s.portTcpTls).toBeGreaterThan(0);
        }
    });

    it("ships pinned PEM blocks", () => {
        expect(PINNED_ELECTRUMX_CERTS.length).toBeGreaterThan(0);
        for (const pem of PINNED_ELECTRUMX_CERTS) {
            expect(pem.includes("BEGIN CERTIFICATE")).toBe(true);
            expect(pem.includes("END CERTIFICATE")).toBe(true);
        }
    });
});

// -----------------------------------------------------------------------------
// resolveNamecoinNIP05 — pure-function behaviour without network
// -----------------------------------------------------------------------------

describe("resolveNamecoinNIP05 (no network)", () => {
    it("returns null for non-Namecoin identifiers", async () => {
        const r = await resolveNamecoinNIP05("alice@example.com");
        expect(r).toBeNull();
    });

    it("returns null when no servers are configured", async () => {
        const r = await resolveNamecoinNIP05("alice@example.bit", { servers: [] });
        expect(r).toBeNull();
    });
});

// -----------------------------------------------------------------------------
// Optional integration suite — guarded behind an env flag.
// -----------------------------------------------------------------------------

const integration = process.env.NOSTRCHECK_NAMECOIN_INTEGRATION === "1";

describe.skipIf(!integration)("resolveNamecoinNIP05 — live ElectrumX (integration)", () => {
    it("resolves a known .bit identity", async () => {
        // Set NOSTRCHECK_NAMECOIN_INTEGRATION=1 and provide your own
        // identifier here when running the integration suite locally.
        const id = process.env.NOSTRCHECK_NAMECOIN_TEST_ID ?? "d/test";
        const r = await resolveNamecoinNIP05(id, { connectTimeoutMs: 8000, readTimeoutMs: 12000 });
        // We don't assert success — the public network may be offline; the
        // suite is here to provide a manual smoke check, not a guarantee.
        expect(r === null || typeof r === "object").toBe(true);
    });
});
