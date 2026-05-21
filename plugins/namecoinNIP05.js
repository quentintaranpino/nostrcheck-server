// namecoinNIP05 — opt-in NIP-05/Namecoin (`.bit`) verification.
//
// Composes with the existing `activeNIP05` plugin:
//
//   - `activeNIP05` checks DNS-based NIP-05 (e.g. `alice@example.com`) against
//     the pubkey's published kind-0 metadata.
//   - `namecoinNIP05` checks `.bit` (Namecoin) NIP-05 the same way, but uses
//     public ElectrumX servers as the source of truth instead of DNS.
//
// The two are mutually exclusive on a per-pubkey basis: an identifier is
// either a `.bit` Namecoin name or a DNS name. Non-Namecoin identifiers
// pass through this plugin (return `true`) so the existing DNS chain still
// runs and is responsible for the verdict.
//
// Disabled by default. Operators enable it via the existing plugins config
// UI / config file (the plugin loader writes `enabled: false` on first
// discovery; flip it to `true` to activate).

import { resolveNamecoinNIP05, isNamecoinIdentifier } from "../dist/lib/nostr/NIP05Namecoin.js";

function plugin() {
    return {
        order: 2,
        name: 'namecoinNIP05',
        module: '',
        execute: async (input, globals) => {
            try {
                if (!input || typeof input.pubkey !== 'string' || !input.pubkey) {
                    return true;
                }

                // Read the pubkey's currently published kind-0 metadata. We
                // mirror activeNIP05's caching strategy exactly so the two
                // plugins share the same redis key and don't double-fetch.
                let pubkeyMetadata = JSON.parse(await globals.redis.get(`pubkeyMetadata-${input.pubkey}`));
                if (!pubkeyMetadata) {
                    pubkeyMetadata = await globals.nostr.NIP01.getPubkeyMetadata(input.pubkey);
                    await globals.redis.set(`pubkeyMetadata-${input.pubkey}`, JSON.stringify(pubkeyMetadata), { EX: 3600 });
                }

                const claimed = (pubkeyMetadata && pubkeyMetadata.nip05) ? String(pubkeyMetadata.nip05).trim() : "";
                if (!claimed) {
                    // No NIP-05 claim at all — leave the verdict to DNS-side
                    // plugins. activeNIP05 will return false; namecoinNIP05
                    // has nothing to say.
                    return true;
                }

                // Not a Namecoin identifier — pass through so DNS NIP-05
                // checks (activeNIP05) handle the verdict.
                if (!isNamecoinIdentifier(claimed)) {
                    return true;
                }

                // Namecoin identifier — resolve on-chain and compare.
                const resolved = await resolveNamecoinNIP05(claimed);
                if (!resolved || typeof resolved.pubkey !== 'string') {
                    globals.logger.warn(`namecoinNIP05 - could not resolve ${claimed} for pubkey ${input.pubkey}`);
                    return false;
                }

                return resolved.pubkey.toLowerCase() === input.pubkey.toLowerCase();

            } catch (error) {
                globals.logger.error('Error executing namecoinNIP05 plugin', error);
                return false;
            }
        }
    };
}

export default plugin;
