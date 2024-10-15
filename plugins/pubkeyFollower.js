// This plugin checks if the pubkey is following the server pubkey.

function plugin() {
    return {
        order: 4,
        enabled: false,
        name: 'pubkeyFollowing',
        execute: async (input, globals) => {
            const followersList = await globals.nostr.NIP01.getPubkeyFollowers(globals.app.get("config.server")["pubkey"]);
            globals.logger.warn(followersList);
            if (followersList.includes(input.pubkey)) {
                return true;
            } else {
                return false;
            }
        }
    };
}

export default plugin;