function plugin() {
    return {
        order: 1,
        enabled: true,
        name: 'activeNIP05',
        execute: async (input, globals) => {
            try {
                let pubkeyMetadata = JSON.parse(await globals.redis.get(`pubkeyMetadata-${input.pubkey}`));

                if (!pubkeyMetadata) {
                    pubkeyMetadata = await globals.nostr.NIP01.getPubkeyMedatada(input.pubkey);
                    await globals.redis.set(`pubkeyMetadata-${input.pubkey}`, JSON.stringify(pubkeyMetadata), { EX: 3600 });
                }

                if (pubkeyMetadata.nip05 === "") return false;

                const registeredData = await globals.registered.getUsernames(input.pubkey);
                if (registeredData.length === 0) return false;

                for (const element of registeredData) {
                    if (element.username + '@' + element.domain === pubkeyMetadata.nip05) {
                        return true;
                    }
                }

                return false;

            } catch (error) {
                globals.logger.error('Error executing activeNIP05 plugin', error);
                return false;
            }
        }
    };
}

export default plugin;
