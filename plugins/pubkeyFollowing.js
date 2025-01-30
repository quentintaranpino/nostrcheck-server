function plugin() {
    return {
        order: 2,
        enabled: false,
        name: 'pubkeyFollowing',
        module: '',
        execute: async (input, globals) => {
            try {
                const serverPubkey = globals.app.get("config.server")["pubkey"];
                let followingList = JSON.parse(await globals.redis.get(`pubkeyFollowing-${serverPubkey}`));

                if (!followingList) {
                    followingList = await globals.nostr.NIP01.getPubkeyFollowing(serverPubkey);
                    await globals.redis.set(`pubkeyFollowing-${serverPubkey}`, JSON.stringify(followingList), { EX: 3600 });
                }

                return followingList.includes(input.pubkey);
                 
            } catch (error) {
                globals.logger.error('Error executing pubkeyFollowing plugin', error);
                return false;
            }
        }
    };
}

export default plugin;
