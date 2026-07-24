import { getConfig, getModules, isModuleEnabled } from "../config/core.js";
import { supported_nips } from "../../interfaces/nostr.js";

// Short human descriptions for the documentation page. Kept next to the
// builder so a new NIP/BUD only has to be described in one place.
const nipDescriptions: Record<number, string> = {
	1: "Basic protocol flow",
	2: "Follow lists",
	3: "OpenTimestamps",
	4: "Encrypted DMs (deprecated)",
	5: "Mapping Nostr keys to DNS identifiers (name@server)",
	7: "Browser extension signing",
	9: "Event deletion",
	11: "Relay information document",
	13: "Proof of work",
	14: "Sensitive content tag",
	19: "bech32 entities (npub, note, nprofile)",
	28: "Public chat",
	40: "Expiration timestamp",
	42: "Auth on relays",
	44: "Encrypted payloads (v2)",
	45: "Event counts",
	47: "Nostr Wallet Connect",
	48: "Proxy tags",
	50: "Search filter",
	56: "Reports",
	62: "Request to vanish",
	65: "Relay list metadata",
	70: "Protected events",
	73: "External content IDs",
	78: "Application-specific data",
	94: "File metadata",
	96: "HTTP file storage integration",
	98: "HTTP auth",
};

const budDescriptions: Record<string, string> = {
	"01": "Server requirements and blob descriptor",
	"02": "Blob retrieval and listing",
	"03": "User server list",
	"04": "Mirror blobs from another server",
	"05": "Media optimization",
	"06": "Upload requirements",
	"08": "Nostr file metadata events",
	"09": "Blob reports",
	"11": "Authorization with NIP-98",
};

const implementedBuds = ["01", "02", "03", "04", "05", "06", "08", "09", "11"];

const luds = [
	{ num: "06", url: "https://github.com/lnurl/luds/blob/luds/06.md", desc: "payRequest base" },
	{ num: "16", url: "https://github.com/lnurl/luds/blob/luds/16.md", desc: "Lightning addresses (name@server)" },
	{ num: "21", url: "https://github.com/lnurl/luds/blob/luds/21.md", desc: "verify (proof of payment)" },
];

export interface DocsData {
	endpoints: { relay: string | null; nip96: string | null; blossom: string | null; nip05: string | null };
	modules: { name: string; path: string; methods: string[]; description: string }[];
	nips: { num: number; label: string; desc: string }[];
	buds: { num: string; desc: string }[];
	luds: { num: string; url: string; desc: string }[];
	relayEnabled: boolean;
	mediaEnabled: boolean;
	lightningEnabled: boolean;
}

/**
 * Everything the documentation page renders, derived from the tenant's
 * config. Shared by the EJS controller and the Astro page.
 */
const getDocsData = (hostname: string): DocsData => {

	const mediaEnabled = isModuleEnabled("media", hostname);
	const relayEnabled = isModuleEnabled("relay", hostname);
	const nostraddressEnabled = isModuleEnabled("nostraddress", hostname);
	const useCDNPrefix = getConfig(hostname, ["media", "useCDNPrefix"]);

	return {
		endpoints: {
			relay: relayEnabled ? `wss://relay.${hostname}` : null,
			nip96: mediaEnabled ? `https://${hostname}/.well-known/nostr/nip96.json` : null,
			blossom: mediaEnabled ? (useCDNPrefix ? `https://cdn.${hostname}` : `https://${hostname}`) : null,
			nip05: nostraddressEnabled ? `https://${hostname}/.well-known/nostr.json` : null,
		},
		modules: getModules(hostname, true).map(m => ({
			name: m.name,
			path: m.path,
			methods: m.methods || [],
			description: m.description,
		})),
		nips: supported_nips.map(n => ({ num: n, label: String(n).padStart(2, "0"), desc: nipDescriptions[n] || "" })),
		buds: implementedBuds.map(b => ({ num: b, desc: budDescriptions[b] || "" })),
		luds,
		relayEnabled,
		mediaEnabled,
		lightningEnabled: isModuleEnabled("payments", hostname),
	};
};

export { getDocsData };
