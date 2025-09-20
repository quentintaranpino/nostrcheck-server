function plugin() {
    return {
        order: 4,
        name: 'pubkeyFollowers',
        module: '',
        execute: async (input, globals) => {
            try {
                const serverPubkey = globals.config.server.pubkey;
                let followersList = JSON.parse(await globals.redis.get(`pubkeyFollowers-${serverPubkey}`));

                if (!followersList) {
                    followersList = await globals.nostr.NIP01.getPubkeyFollowers(serverPubkey);
                    await globals.redis.set(`pubkeyFollowers-${serverPubkey}`, JSON.stringify(followersList), { EX: 3600 });
                }

                return followersList.includes(input.pubkey);
                 
            } catch (error) {
                globals.logger.error('Error executing pubkeyFollowers plugin', error);
                return false;
            }
        }
    };
}

export default plugin;
