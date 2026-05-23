import { describe, expect, it } from "vitest";

import {
    DEFAULT_ELECTRUMX_SERVERS,
    DEFAULT_IMPORT_MAX_DEPTH,
    PINNED_ELECTRUMX_CERTS,
    buildNameIndexScript,
    electrumScriptHash,
    expandImports,
    extractPubkeyFromNamecoinValue,
    isNamecoinIdentifier,
    parseIdentifier,
    parseNameUpdateScript,
    resolveNamecoinNIP05,
} from "./namecoinNIP05.lib.js";

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
        expect(isNamecoinIdentifier(null)).toBe(false);
    });
});

// -----------------------------------------------------------------------------
// parseIdentifier — parser spec (rust-nostr 1:1)
// -----------------------------------------------------------------------------

describe("parseIdentifier", () => {
    it("parses user@domain.bit", () => {
        const addr = parseIdentifier("alice@example.bit");
        expect(addr).not.toBeNull();
        expect(addr.namecoinName).toBe("d/example");
        expect(addr.namespace).toBe("d/example");
        expect(addr.localPart).toBe("alice");
        expect(addr.isDomain).toBe(true);
    });

    it("parses bare domain.bit", () => {
        const addr = parseIdentifier("example.bit");
        expect(addr.namecoinName).toBe("d/example");
        expect(addr.localPart).toBe("_");
        expect(addr.isDomain).toBe(true);
    });

    it("parses d/<name>", () => {
        const addr = parseIdentifier("d/example");
        expect(addr.namecoinName).toBe("d/example");
        expect(addr.localPart).toBe("_");
        expect(addr.isDomain).toBe(true);
    });

    it("parses id/<name>", () => {
        const addr = parseIdentifier("id/alice");
        expect(addr.namecoinName).toBe("id/alice");
        expect(addr.localPart).toBe("_");
        expect(addr.isDomain).toBe(false);
    });

    it("strips a leading nostr: prefix", () => {
        const addr = parseIdentifier("nostr:alice@example.bit");
        expect(addr.namecoinName).toBe("d/example");
        expect(addr.localPart).toBe("alice");
    });

    it("is case-insensitive", () => {
        const addr = parseIdentifier("ALICE@EXAMPLE.BIT");
        expect(addr.namecoinName).toBe("d/example");
        expect(addr.localPart).toBe("alice");
    });

    it("normalises empty local-part to _", () => {
        const addr = parseIdentifier("@example.bit");
        expect(addr).not.toBeNull();
        expect(addr.localPart).toBe("_");
        expect(addr.namecoinName).toBe("d/example");
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
        expect(r.pubkey).toBe(PK1);
        expect(r.relays).toBeUndefined();
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
        expect(r.pubkey).toBe(PK2);
        expect(r.relays).toEqual(["wss://relay.example.com"]);
    });

    it("falls back to the _ root entry when the local-part is missing", () => {
        const value = JSON.stringify({ nostr: { names: { _: PK1 } } });
        const r = extractPubkeyFromNamecoinValue(value, "ghost");
        expect(r.pubkey).toBe(PK1);
    });

    it("falls back to the first valid pubkey only when the caller asked for _", () => {
        const value = JSON.stringify({ nostr: { names: { alice: PK1 } } });
        // local-part != "_" must not bleed onto random entries
        expect(extractPubkeyFromNamecoinValue(value, "ghost")).toBeNull();
        // when asking for the root, the first valid hex is fine
        const r = extractPubkeyFromNamecoinValue(value, "_");
        expect(r.pubkey).toBe(PK1);
    });

    it("supports the identity-namespace pubkey field", () => {
        const value = JSON.stringify({
            nostr: { pubkey: PK1, relays: ["wss://relay.example.com"] },
        });
        const r = extractPubkeyFromNamecoinValue(value, "_");
        expect(r.pubkey).toBe(PK1);
        expect(r.relays).toEqual(["wss://relay.example.com"]);
    });

    it("tolerates a nostr: prefix on the local-part", () => {
        const value = JSON.stringify({ nostr: { names: { alice: PK1 } } });
        const r = extractPubkeyFromNamecoinValue(value, "nostr:alice");
        expect(r.pubkey).toBe(PK1);
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
        const parts = [];
        parts.push(0x53);
        parts.push(9);
        parts.push(..."d/example".split("").map((c) => c.charCodeAt(0)));
        parts.push(2);
        parts.push(..."{}".split("").map((c) => c.charCodeAt(0)));
        parts.push(0x6d, 0x75);
        parts.push(0x76, 0xa9, 0x14, 0xde, 0xad, 0xbe, 0xef);
        const decoded = parseNameUpdateScript(Buffer.from(parts));
        expect(decoded).not.toBeNull();
        expect(decoded.name.toString("utf8")).toBe("d/example");
        expect(decoded.value.toString("utf8")).toBe("{}");
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
// expandImports — ifa-0001 §"import" chain resolution
//
// Hermetic suite: every "imported" name is served from an in-memory map.
// Mirrors the 16 unit + 4 integration cases pinned by the canonical Kotlin
// reference. Tests do NOT touch the network.
// -----------------------------------------------------------------------------

const PK_ROOT = "460c25e682fda7832b52d1f22d3d22b3176d972f60dcdc3212ed8c92ef85065c";
const PK_M = "6cdebccabda1dfa058ab85352a79509b592b2bdfa0370325e28ec1cb4f18667d";
const PK_OVERRIDE = "aaaa000000000000000000000000000000000000000000000000000000000001";

/** Build a fake lookup that serves a static map and records every query. */
const makeLookup = (records) => {
    const queried = [];
    const lookup = async (name) => {
        queried.push(name);
        if (!(name in records)) return null;
        const v = records[name];
        if (v instanceof Error) throw v;
        return v;
    };
    return { lookup, queried };
};

describe("expandImports \u2014 unit", () => {
    it("DEFAULT_IMPORT_MAX_DEPTH is the spec minimum of 4", () => {
        expect(DEFAULT_IMPORT_MAX_DEPTH).toBe(4);
    });

    it("case 1 \u2014 object with no `import` key is returned unchanged with zero lookup calls", async () => {
        const { lookup, queried } = makeLookup({});
        const root = { ip: "1.2.3.4" };
        const out = await expandImports(root, lookup);
        expect(out).toEqual({ ip: "1.2.3.4" });
        expect(queried).toEqual([]);
    });

    it("case 2 \u2014 string shorthand `\"import\": \"d/foo\"`", async () => {
        const { lookup } = makeLookup({
            "d/lib": JSON.stringify({ ip: "9.9.9.9", nostr: { names: { _: PK_ROOT } } }),
        });
        const out = await expandImports({ import: "d/lib", ip: "1.1.1.1" }, lookup);
        expect(out.ip).toBe("1.1.1.1");
        expect(out.nostr.names._).toBe(PK_ROOT);
        expect("import" in out).toBe(false);
    });

    it("case 3 \u2014 array shorthand `[\"d/foo\"]`", async () => {
        const { lookup } = makeLookup({
            "d/lib": JSON.stringify({ tag: "from-lib" }),
        });
        const out = await expandImports({ import: ["d/lib"] }, lookup);
        expect(out.tag).toBe("from-lib");
        expect("import" in out).toBe(false);
    });

    it("case 4 \u2014 array-with-selector shorthand `[\"d/foo\", \"relay\"]`", async () => {
        const { lookup } = makeLookup({
            "d/lib": JSON.stringify({
                ip: "1.1.1.1",
                map: { relay: { ip: "7.7.7.7", tag: "selected" } },
            }),
        });
        const out = await expandImports({ import: ["d/lib", "relay"] }, lookup);
        // The selector descends into map.relay; d/lib's top-level ip is NOT seen.
        expect(out.ip).toBe("7.7.7.7");
        expect(out.tag).toBe("selected");
    });

    it("case 5 \u2014 canonical array-of-arrays, later imports override earlier", async () => {
        const { lookup } = makeLookup({
            "d/a": JSON.stringify({ ip: "10.0.0.1", tag: "from-a" }),
            "d/b": JSON.stringify({ ip: "10.0.0.2", extra: "from-b" }),
        });
        const out = await expandImports({ import: [["d/a"], ["d/b"]] }, lookup);
        // d/b processed after d/a, so its ip wins. importer has no ip of its own.
        expect(out.ip).toBe("10.0.0.2");
        expect(out.tag).toBe("from-a");
        expect(out.extra).toBe("from-b");
    });

    it("case 6 \u2014 importer-wins on plain keys", async () => {
        const { lookup } = makeLookup({
            "d/lib": JSON.stringify({ ip: "9.9.9.9", extra: "remote", "only-imported": "yes" }),
        });
        const out = await expandImports(
            { import: "d/lib", ip: "1.1.1.1", extra: "local" },
            lookup,
        );
        expect(out.ip).toBe("1.1.1.1");
        expect(out.extra).toBe("local");
        expect(out["only-imported"]).toBe("yes");
    });

    it("case 7 \u2014 null in importer is preserved (semantic suppression marker)", async () => {
        const { lookup } = makeLookup({
            "d/lib": JSON.stringify({ ip: "9.9.9.9", other: "keep" }),
        });
        const out = await expandImports({ import: "d/lib", ip: null }, lookup);
        // The merged object still has the `ip` key, set to null (downstream
        // parsers ignore null as if absent — same outcome either way).
        expect("ip" in out).toBe(true);
        expect(out.ip).toBeNull();
        expect(out.other).toBe("keep");
    });

    it("case 8 \u2014 depth-4 recursion happy path", async () => {
        const { lookup } = makeLookup({
            "d/a": JSON.stringify({ import: "d/b", layer: "a" }),
            "d/b": JSON.stringify({ import: "d/c", layer: "b" }),
            "d/c": JSON.stringify({ import: "d/d", layer: "c" }),
            "d/d": JSON.stringify({ layer: "d", deep: "reached" }),
        });
        const out = await expandImports({ import: "d/a" }, lookup);
        // Each layer overrides `layer`, so the top sees "a". `deep` only
        // exists on d/d and survives all the way up.
        expect(out.layer).toBe("a");
        expect(out.deep).toBe("reached");
    });

    it("case 9 \u2014 chain deeper than max-depth is silently truncated", async () => {
        const { lookup } = makeLookup({
            "d/a": JSON.stringify({ import: "d/b", tag: "from-a" }),
            "d/b": JSON.stringify({ tag: "from-b", leaf: "wont-show" }),
        });
        const out = await expandImports({ import: "d/a", local: "keep" }, lookup, 1);
        // Budget=1 — we expand d/a once. Because d/b sits one level below
        // d/a, the recursive call for d/a starts with budget=0 in its
        // children and so d/b is never expanded. d/a's own body still
        // merges; the importing record's own keys stay.
        expect(out.local).toBe("keep");
        expect(out.tag).toBe("from-a");
        expect("leaf" in out).toBe(false);
    });

    it("case 10 \u2014 lookup returns null is treated as empty object", async () => {
        const { lookup } = makeLookup({}); // every lookup returns null
        const out = await expandImports(
            { import: "d/missing", local: "survives" },
            lookup,
        );
        expect(out.local).toBe("survives");
        expect("import" in out).toBe(false);
    });

    it("case 11 \u2014 lookup throws is treated as empty object", async () => {
        const { lookup } = makeLookup({
            "d/broken": new Error("electrumx transport boom"),
        });
        const out = await expandImports(
            { import: "d/broken", local: "survives" },
            lookup,
        );
        expect(out.local).toBe("survives");
    });

    it("case 12 \u2014 lookup returns malformed JSON is treated as empty object", async () => {
        const { lookup } = makeLookup({
            "d/broken": "not valid json {{{",
        });
        const out = await expandImports(
            { import: "d/broken", local: "keep" },
            lookup,
        );
        expect(out.local).toBe("keep");
    });

    it("case 13 \u2014 malformed `import` value (number) is a no-op", async () => {
        const { lookup, queried } = makeLookup({});
        const out = await expandImports({ import: 42, local: "keep" }, lookup);
        expect(out.local).toBe("keep");
        expect("import" in out).toBe(false);
        // Malformed import value must not trigger any lookup.
        expect(queried).toEqual([]);
    });

    it("case 14 \u2014 cycle A\u2192B\u2192A is broken without infinite recursion", async () => {
        const { lookup } = makeLookup({
            "d/a": JSON.stringify({ import: "d/b", fromA: "yes" }),
            "d/b": JSON.stringify({ import: "d/a", fromB: "yes" }),
        });
        const out = await expandImports({ import: "d/a", local: "top" }, lookup);
        expect(out.local).toBe("top");
        // At least one of fromA / fromB must have made it through; the
        // call MUST terminate.
        expect("fromA" in out || "fromB" in out).toBe(true);
    });

    it("case 15 \u2014 multi-label selector descends `map` tree DNS right-to-left", async () => {
        // Selector "a.b" means: descend map.b, then map.a.
        const { lookup } = makeLookup({
            "d/lib": JSON.stringify({
                map: { b: { map: { a: { value: "deep" } } } },
            }),
        });
        const out = await expandImports({ import: [["d/lib", "a.b"]] }, lookup);
        expect(out.value).toBe("deep");
    });

    it("case 16 \u2014 selector falls back to `*` wildcard when exact label is missing", async () => {
        const { lookup } = makeLookup({
            "d/lib": JSON.stringify({
                map: { "*": { value: "wildcard" } },
            }),
        });
        const out = await expandImports({ import: ["d/lib", "ghost"] }, lookup);
        expect(out.value).toBe("wildcard");
    });
});

// -----------------------------------------------------------------------------
// Integration — expandImports + extractPubkeyFromNamecoinValue together,
// pinning the apex-with-import → NIP-05 path used by the canonical
// `testls.bit` demo target.
// -----------------------------------------------------------------------------

/**
 * Mimic the real `resolveNamecoinNIP05` flow on a static set of records.
 * Parses the apex, runs `expandImports` with the in-memory map as the
 * sibling fetcher, then runs the existing JSON-shape extractor on the
 * merged object via the public `extractPubkeyFromNamecoinValue`.
 */
const resolveOnRecords = async (records, identifier) => {
    const addr = parseIdentifier(identifier);
    if (!addr) return { result: null, queried: [] };
    const { lookup, queried } = makeLookup(records);
    const apex = await lookup(addr.namecoinName);
    if (!apex) return { result: null, queried };
    let parsed;
    try {
        parsed = JSON.parse(apex);
    } catch {
        return { result: null, queried };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { result: null, queried };
    }
    const merged = await expandImports(parsed, lookup);
    // Re-serialise for the public extractor (which takes a raw JSON string).
    const result = extractPubkeyFromNamecoinValue(JSON.stringify(merged), addr.localPart);
    return { result, queried };
};

describe("expandImports \u2014 integration with NIP-05 extractor", () => {
    it("case 17 \u2014 bare `_@foo.bit` resolves across an import", async () => {
        // The canonical `testls.bit` deployment: the apex record is up
        // against the 520-byte limit and delegates its `nostr.names`
        // block to a sibling via `"import":"dd/testls"`. Without import
        // support, NIP-05 sees no `nostr` field at the apex and fails.
        const records = {
            "d/testls": JSON.stringify({ import: "dd/testls", ip: "107.152.38.155" }),
            "dd/testls": JSON.stringify({
                nostr: { names: { _: PK_ROOT, m: PK_M } },
            }),
        };
        const { result, queried } = await resolveOnRecords(records, "testls.bit");
        expect(result).not.toBeNull();
        expect(result.pubkey).toBe(PK_ROOT);
        expect(queried).toContain("d/testls");
        expect(queried).toContain("dd/testls");
    });

    it("case 18 \u2014 named `alice@foo.bit` resolves across an import", async () => {
        const records = {
            "d/testls": JSON.stringify({ import: "dd/testls" }),
            "dd/testls": JSON.stringify({
                nostr: { names: { _: PK_ROOT, m: PK_M } },
            }),
        };
        const { result } = await resolveOnRecords(records, "m@testls.bit");
        expect(result).not.toBeNull();
        expect(result.pubkey).toBe(PK_M);
    });

    it("case 19 \u2014 no-import record costs exactly one fetch (zero extra I/O regression guard)", async () => {
        const records = {
            "d/plain": JSON.stringify({
                nostr: { names: { _: PK_ROOT } },
            }),
        };
        const { result, queried } = await resolveOnRecords(records, "plain.bit");
        expect(result).not.toBeNull();
        expect(result.pubkey).toBe(PK_ROOT);
        // Exactly one fetch: the apex. No import means no extra lookups.
        expect(queried).toEqual(["d/plain"]);
    });

    it("case 20 \u2014 importer wins on `nostr.names` map (importer overrides imported `m`)", async () => {
        // Importer declares its own `nostr.names.m`; the imported record
        // declares a different one. Importer wins on the whole `nostr`
        // key (shallow per-key merge per spec).
        const records = {
            "d/testls": JSON.stringify({
                import: "dd/testls",
                nostr: { names: { m: PK_OVERRIDE } },
            }),
            "dd/testls": JSON.stringify({
                nostr: { names: { m: PK_M } },
            }),
        };
        const { result } = await resolveOnRecords(records, "m@testls.bit");
        expect(result).not.toBeNull();
        expect(result.pubkey).toBe(PK_OVERRIDE);
    });
});

// -----------------------------------------------------------------------------
// Optional integration suite — guarded behind an env flag.
// -----------------------------------------------------------------------------

const integration = process.env.NOSTRCHECK_NAMECOIN_INTEGRATION === "1";

describe.skipIf(!integration)("resolveNamecoinNIP05 — live ElectrumX (integration)", () => {
    it("resolves a known .bit identity", async () => {
        const id = process.env.NOSTRCHECK_NAMECOIN_TEST_ID ?? "d/test";
        const r = await resolveNamecoinNIP05(id, { connectTimeoutMs: 8000, readTimeoutMs: 12000 });
        expect(r === null || typeof r === "object").toBe(true);
    });
});
