// Initialize the SimplePool from NostrTools
const pool = new NostrTools.SimplePool();

// Default relay configuration
let relays = [
  { id: 0, url: 'wss://relay.nostr.band', read:  true, write: true, dms: false, name:'', description: "", pubkey: "", contact: "", supported_nips: [], enabled : true },
  { id: 1, url: 'wss://relay.damus.io', read:  true, write: true, dms: false, name:'', description: "", pubkey: "", contact: "", supported_nips: [], enabled : true },
  { id: 2, url: 'wss://relay.primal.net', read:  true, write: true, dms: false, name:'', description: "", pubkey: "", contact: "", supported_nips: [], enabled : true },
  { id: 3, url: 'wss://relay.nostrcheck.me', read:  true, write: false, dms: false, name:'', description: "", pubkey: "", contact: "", supported_nips: [], enabled : true },
  { id: 4, url: 'wss://nostr-pub.wellorder.net', read:  true, write: false, dms: false, name:'', description: "", pubkey: "", contact: "", supported_nips: [], enabled : true },
];

let userRelays = [];

/**
 * Fetches the user's preferred relays from their Nostr profile (kind 10002 events).
 * @param {string} publicKey - The user's public key.
 * @returns {Promise<Array>} - A promise that resolves to an array of relay objects.
 */
const getRelaysFromUser = async (publicKey) => {
  return new Promise((resolve, reject) => {

    try {
      const subscription = pool.subscribeMany(
        relays.map(relay => relay.url),
        [{ kinds: [10002, 10050], authors: [publicKey] }],
        {
          maxWait: 5000,
          async onevent(event) {
            event.tags.forEach(tag => {
              if (tag[0] === 'r' || tag[0] === 'relay') {
                tag[1].endsWith('/') == true ? tag[1] = tag[1].slice(0, -1) : null;
                const existingRelay = userRelays.find(relay => relay.url == tag[1]);
                if (existingRelay) {
                  if (tag[2] == 'read' && tag[0] == 'r'){
                    existingRelay.read = true;
                    existingRelay.write = false;
                  }
                  if (tag[2] == 'write' && tag[0] == 'r'){
                    existingRelay.write = true;
                    existingRelay.read = false;
                  }
                  if (tag[2] == undefined && tag[0] == 'r'){
                    existingRelay.write = true;
                    existingRelay.read = true;
                  }
                  if (tag[0] == 'relay') existingRelay.dms = true;
                  return;
                }
                userRelays.push({ id : userRelays.length, 
                                  url: tag[1].endsWith('/') == true ? tag[1].slice(0, -1) : tag[1], 
                                  read: tag[2] == 'read' || tag[2] == undefined && tag[0] == 'r' ? true : false, 
                                  write: tag[2] == 'write' || tag[2] == undefined && tag[0] == 'r' ? true : false, 
                                  dms: tag[0] == 'relay' ? true : false, 
                                  name: '', 
                                  description: '', 
                                  pubkey: '', 
                                  contact: '', 
                                  supported_nips: [], 
                                  enabled : true });
              }
            });
          },
          oneose() {
            subscription.close();
            (async () => {
                for (const relay of userRelays) {
                    await getRelayData(relay);
                }
                resolve(userRelays);
            })();
          }
        }
      );
    } catch (error) {
      console.error("Error obtaining user relays:", error);
      reject(error);
    }
  });
};

const getRelayData = async (relay) => {

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000); 

  try {
    const response = await fetch(relay.url.replace('wss://', 'https://').replace('ws://', 'http://'), {
      headers: {
        'Accept': 'application/nostr+json'
      }, 
      signal: controller.signal,

    });

    clearTimeout(timeout)

    if (!response.ok) throw new Error('Failed to fetch relay data', relay.url);

    const data = await response.json();
    relay.name = data.name;
    relay.description = data.description;
    relay.pubkey = data.pubkey;
    relay.contact = data.contact;
    relay.supported_nips = data.supported_nips;
    relay.pubkey = data.pubkey;
  } catch (error) {
    if (error.name === "AbortError") {
      console.debug(`Timeout: ${relay.url} took too long to respond.`);
    } else {
      console.debug(`Error fetching relay data: ${error.message}`);
    }
  }
}

/**
 * Checks if a relay is online.
 * @param {string} relayUrl - The URL of the relay to check.
 * @returns {Promise<Object>} - A promise that resolves to an object with the online status and response time.
 */
const isRelayOnline = async (relayUrl) => {
  return new Promise(async (resolve) => {
      const startTime = Date.now(); 
      const timeout = setTimeout(() => {
          resolve({ online: false, ping: null });
      }, 5000);

      const url = relayUrl.replace(/^wss?:\/\//, (match) => match === 'wss://' ? 'https://' : 'http://');

      try {
          const response = await fetch(url, { method: 'GET', mode: 'no-cors' });
          clearTimeout(timeout);
          const responseTime = Date.now() - startTime;
          if (response.ok || response.type === 'opaque') { 
              resolve({ online: true, ping: responseTime });
          } else {
              resolve({ online: false, ping: null });
          }
      } catch (error) {
          resolve({ online: false, ping: null });
      }
  });
};

/**
 * Ensures that the profile content has at least the minimum required fields.
 * @param {Object} content - The profile content to ensure.
 * @returns {Object} - The content with minimum required fields ensured.
 */
const ensureMinimumFields = (content) => {
  const defaultFields = {
    name: "",
    banner: null,
    picture: null,
    website: "",
    lud16: "",
    nip05: "",
    about: "",
  };
  return { ...defaultFields, ...content };
};

/**
 * Publishes the updated profile data to the user's relays.
 * @param {Object} updatedFields - The updated fields to merge into the profile.
 * @param {string} publicKey - The user's public key.
 * @param {string} secretKey - The user's secret key.
 * @returns {Promise<boolean>} - A promise that resolves to true if publishing was successful.
 */
const publishProfileData = async (updatedFields, publicKey, secretKey) => {
  if (!updatedFields || Object.keys(updatedFields).length === 0 || !publicKey) {
    console.error("No updated fields or public key provided.");
    return;
  }

  console.debug("Default relays:", relays.map(relay => relay.url));

  let result = await getRelaysFromUser(publicKey);
  if (!result || userRelays.length === 0) {
    console.warn("No relays found for user, using default relays.");
  } else {
    relays = result;
  }

  console.debug("Relays to use:", relays.map(relay => relay.url));

  return new Promise((resolve, reject) => {
    let combinedContent = {};

    try {
      const subscription = pool.subscribeMany(
        relays.map(relay => relay.url),
        [{ kinds: [0], authors: [publicKey] }],
        {
          maxWait: 5000,
          async onevent(event) {
            try {
              const eventContent = JSON.parse(event.content);
              console.debug("Received event:", eventContent);
              combinedContent = { ...combinedContent, ...eventContent };
            } catch (error) {
              console.error("Error parsing event content:", error);
              reject("Error parsing event content");
            }
          },
          async oneose() {
            subscription.close();
            const updatedContent = ensureMinimumFields({ ...combinedContent, ...updatedFields });

            const event = {
              kind: 0,
              created_at: Math.floor(Date.now() / 1000),
              tags: [],
              content: JSON.stringify(updatedContent),
              pubkey: publicKey
            };

            let signedEvent;
            try {
              if (secretKey) {
                const decodedSecretKey = NostrTools.nip19.decode(secretKey).data;
                signedEvent = await NostrTools.finalizeEvent(event, decodedSecretKey);
              } else if (window.nostr && window.nostr.signEvent) {
                signedEvent = await window.nostr.signEvent(event);
              } else {
                throw new Error("No secret key provided and NIP-07 extension is not available.");
              }
            } catch (error) {
              console.error("Error signing event:", error);
              reject(error);
            }

            if (!NostrTools.verifyEvent(signedEvent)) {
              console.error("Signed event is not valid.");
              reject("Signed event is not valid.");
            }

            console.debug("Signed event generated:", signedEvent);

            try {
              await Promise.any(pool.publish(relays.map(relay => relay.url), signedEvent));
              console.log("Event published successfully.");
              resolve(true);
            } catch (error) {
              console.error("Failed to publish event:", error);
              reject(error);
            }
          },
        }
      );
    } catch (error) {
      console.error("Error during publishing profile data:", error);
      reject(error);
    }
  });
};

const publishProfileRelays = async (relays, publicKey, secretKey, type) => {

  if (!relays || relays.length === 0 || !publicKey) {
    console.error("No public key provided.");
    return;
  }

  const enabledRelays = relays.filter(relay => relay.enabled && (type === 'app' ? !relay.dms : relay.dms));
  if (enabledRelays.length === 0) {
    console.error("No enabled relays found without DMs.");
    return;
  }

  console.debug("enabledRelays:", enabledRelays);

  // Check if every relay is online
  const onlineRelays = (await Promise.all(
    enabledRelays.map(async (relay) => {
      const status = await isRelayOnline(relay.url); 
      return { ...relay, ...status };
    })
  )).filter(relay => relay.online);

  console.debug("onlineRelays:", onlineRelays);

  const appRelayTags = onlineRelays.map(relay => {
    const tag = [type == 'app' ? "r" : "relay", relay.url];
    if ((relay.read && relay.write) || type == 'dms') {
      return tag; 
    } else if (relay.read && type != 'dms') {
      return [...tag, "read"];
    } else if (relay.write && type != 'dms') {
      return [...tag, "write"];
    }
    return tag;
  });

  console.debug("Relay tags to publish:", appRelayTags);

  const appRelayEvent = {
    kind: type == 'app' ? 10002 : 10050,
    created_at: Math.floor(Date.now() / 1000),
    tags: appRelayTags,
    content: "", 
    pubkey: publicKey,
  };

  let signedEvent;

  try {
    if (secretKey) {
      const decodedSecretKey = NostrTools.nip19.decode(secretKey).data;
      signedEvent = await NostrTools.finalizeEvent(appRelayEvent, decodedSecretKey);
    } else if (window.nostr && window.nostr.signEvent) {
      signedEvent = await window.nostr.signEvent(appRelayEvent);
    } else {
      throw new Error("No secret key provided and NIP-07 extension is not available.");
    }

    if (!NostrTools.verifyEvent(signedEvent)) {
      console.error("Signed event is not valid.");
      return;
    }

    console.debug("Signed event generated:", signedEvent);

    try {
      await Promise.any(pool.publish(enabledRelays.map(relay => relay.url), signedEvent));
      console.log("Event published successfully.");
      return true;
    } catch (error) {
      console.error("Failed to publish event:", error);
      return false;
    }
  } catch (error) {
    console.error("Error signing event:", error);
    return false;
  }
};

const subscribeRelays = async (kind, pubkeys, type, since, until) => {
  
  if (!Array.isArray(pubkeys)) pubkeys = [pubkeys];

  if (pubkeys.length === 0 || kind === undefined || pubkeys[0] == "") {
    return;
  }


  const p = [...new Set(pubkeys)].map(pubkey => {
    if (!pubkey.startsWith('npub')) return pubkey;
    try {
      return NostrTools.nip19.decode(pubkey).data; 
    } catch (error) {
      console.error(`Error decoding pubkey: ${pubkey}`, error);
      return null; 
    }
  }).filter(pubkey => pubkey !== null); 

  return new Promise((resolve, reject) => {

    const notes = [];

    const filter = {
      kinds: [kind],
      since: since || Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60),
      until: until || Math.floor(Date.now() / 1000)
    }

    if (type === 'from') filter.authors = p;
    if (type === 'to') filter["#p"] = p;

    try {
      const subscription = pool.subscribeMany(
        userRelays.length > 0 ? userRelays.map(relay => relay.url) : relays.map(relay => relay.url),
        [filter],
        {
          maxWait: 5000,
          async onevent(event) {
            notes.push(event);
          },
          oneose() {
            resolve(notes.sort((a, b) => b.created_at - a.created_at));
            subscription.close();
          }
        }
      );
      console.log("Subscribed to relays:", userRelays.length > 0 ? userRelays.map(relay => relay.url) : relays.map(relay => relay.url));
    } catch (error) {
      console.error("Error obtaining pubkey notes:", error);
      reject(error);
    }
  });
}

const hextoNpub = async (hex) => {

  if (hex != "" && hex.startsWith("npub")) {
      return hex;
  }

  try {
      return await NostrTools.nip19.npubEncode(hex);
  } catch (error) {
      logger.error("Error while encoding pubkey to npub: ", error);
  }

  return "";

}