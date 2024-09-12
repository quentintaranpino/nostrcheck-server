let sk = "";
sk = NostrTools.nip19.decode(sk).data;
const pk = NostrTools.getPublicKey(sk);
console.log("PUKBEY:", pk);

const pool = new NostrTools.SimplePool()

let relays = [{url:'wss://relay.damus.io', url:'wss://nos.lol', url:'wss://relay.nostrcheck.me'}]

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
                                userRelays.push({ url: tag[1], type: tag[2] || "write" });
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

    console.log("Original relays:", relays);
    relays = await getRelaysFromUser(pk);
    if (!relays || relays.length === 0) {
        console.error("No relays found for user.");
        return false;
    }
    console.log("User relay URLs:", relays);

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
                    if (sk) {
                        newEvent = await NostrTools.finalizeEvent(event, sk)
                    }else{
                        try{
                            newEvent = await window.nostr.signEvent(event);
                        }catch(e){ 
                            console.error("Error signing event:", e);
                            reject(false);
                        }
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