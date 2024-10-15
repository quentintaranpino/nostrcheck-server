// This plugin checks if the uploader's pubkey has the registered NIP05 published and active on the nostr profile.

function plugin() {
    return {
        order: 1,
        enabled: false,
        name: 'registeredNIP05',
        execute: async (input, globals) => {
            const pubkeyMetadata = await globals.nostr.NIP01.getPubkeyMedatada(input.pubkey);
            if (pubkeyMetadata.nip05 === "") return false;

            const registeredData = await globals.registered.getUsernames(input.pubkey);
            if (registeredData.length === 0) return false;

            for (const element of registeredData) {
                if (element.username + '@' + element.domain === pubkeyMetadata.nip05) {
                    return true;
                }
            }

            return false;
        }
    };
}

export default plugin;
