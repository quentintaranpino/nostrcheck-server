// let sk = "";
// sk = NostrTools.nip19.decode(sk).data;
// const pk = NostrTools.getPublicKey(sk);
// console.log("PUKBEY:", pk);

const pool = new NostrTools.SimplePool()

let relays = [{url:'wss://relay.damus.io', type: 'write'}, {url:'wss://nos.lol', type: 'write'}, {url:'wss://relay.nostrcheck.me', type: 'read'}];

const getRelaysFromUser = async (pk) => {
    let userRelays = [];

    return new Promise((resolve, reject) => {
        try {
            let p = pool.subscribeMany(
                relays.map(relay => relay.url),
                [
                    {
                        kinds: [10002], 
                        authors: [pk], 
                    },
                ],
                {
                    async onevent(event) {
                        console.log("Event received (kind 10002):", event);

                        event.tags.forEach(tag => {
                            if (tag[0] === 'r') {
                                console.log(tag[0], tag[1], tag[2]);
                                userRelays.push({ url: tag[1], type: tag[2] || "read / write" });
                            }
                        });
                    },

                    oneose() {
                        p.close();
                        console.log('User relays:', userRelays);
                        resolve(userRelays); 
                    }
                }
            );

        } catch (e) {
            p.close();
            console.error("Error obtaining user relays:", e);
            reject(e); 
        }
    });
};

const ensureMinimumFields = (content) => {
    const defaultFields = {
        name: "",
        banner: null,
        picture: null,
        website: "",
        lud16: "",
        nip05: ""
    };
    
    return { ...defaultFields, ...content }; 
};

const publishProfileData = async (updatedFields, pk, sk) => {
    if (!updatedFields || Object.keys(updatedFields).length === 0 || !pk) {
        console.error("No hay campos actualizados.");
        return;
    }

    console.log("Default relays:", relays.map(relay => relay.url));
    let userRelays =  await getRelaysFromUser(pk);
    if (!userRelays || userRelays.length === 0) {
        console.warn("No relays found for user, using default relays.");
    } else {
        relays = userRelays;
    }
    console.log("Relays to use:", relays.map(relay => relay.url));

    return new Promise((resolve, reject) => {
        let combinedContent = {};

        const p = pool.subscribeMany(
            relays.map(relay => relay.url), 
            [
                {
                    kinds: [0], 
                    authors: [pk],
                },
            ],
            {
                async onevent(event) {
                    let eventContent = {};
                    try {
                        eventContent = JSON.parse(event.content);
                        console.log("Received event:", eventContent);
                        console.log(event);
                    } catch (e) {
                        console.error("Error parsing event content:", e);
                        reject("Error parsing event content");
                    }

                    combinedContent = { ...combinedContent, ...eventContent };
                },

                async oneose() {
                    p.close();
                    const updatedContent = ensureMinimumFields({ ...combinedContent, ...updatedFields });

                    const event = {
                        kind: 0,
                        created_at: Math.floor(Date.now() / 1000),
                        tags: [],
                        content: JSON.stringify(updatedContent),
                    };

                    let newEvent;
                    try{
                        if (sk) {
                            sk = NostrTools.nip19.decode(sk).data;
                            newEvent = await NostrTools.finalizeEvent(event, sk)
                        }else{
                            newEvent = await window.nostr.signEvent(event);
                        }
                    }catch(e){ 
                        console.error("Error signing event:", e);
                        reject(false);
                    }
                    console.log("New event:", newEvent);
                    if (!NostrTools.verifyEvent(newEvent)) {
                        console.error("Combined event is not valid.");
                        reject(false);
                    }

                    console.log("New event generated:", newEvent);

                    await Promise.any(pool.publish(relays.map(relay => relay.url), newEvent))
                        .then((e) => {
                            console.log(e);
                            console.log("Event published successfully.");
                            resolve(true); 
                        })
                        .catch((err) => {
                            console.error("Failed to publish event:", err);
                            reject(false); 
                        });
                },
            }
        );
    });
};