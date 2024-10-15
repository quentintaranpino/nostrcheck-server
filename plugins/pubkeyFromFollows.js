// This plugin checks if the server pubkey is following the uploader's pubkey

function plugin() {
    return {
        order: 2,
        enabled: false,
        name: 'pubkeyFromFollows',
        execute: async (input, globals) => {
            const followingList = await globals.nostr.NIP01.getPubkeyFollowing(globals.app.get("config.server")["pubkey"]);
            if (followingList.includes(input.pubkey)) {
                return true;
            } else {
                return false;
            }
        }
    };
}

export default plugin;