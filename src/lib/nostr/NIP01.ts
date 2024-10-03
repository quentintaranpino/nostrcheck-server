import { Event } from "nostr-tools"
import { relays, relaysPool } from "./core.js";
import app from "../../app.js";
import { logger } from "../logger.js";

/**
 * Retrieves the profile data of a user from the Nostr network (Kind 0).
 * @param pubkey - The public key of the user, hex format.
 * @returns A promise that resolves to the content data of the kind 0 note.
 */
const getProfileData = async (pubkey: string, kind: number = 0): Promise<Event[]> => {
    let resolveEvents: (events: Event[]) => void;
    const subscribePromise: Promise<Event[]> = new Promise(resolve => resolveEvents = resolve);
    
    const events: Event[] = [];
    const data = relaysPool.subscribeMany(
        relays,
        [{
            authors: [pubkey],
            kinds: [kind],
			since: Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60)
        }],
        {
            eoseTimeout: 100,
            onevent(e) {
                events.push(e);
            },
            oneose() {
                data.close();
                resolveEvents(events.length ? events : [{kind: 0, created_at: 0, tags: [], content: "{}", pubkey: "", id: "", sig: ""}]);
            },
        },
    );

    const resultEvents: Event[] = await subscribePromise;
    if (resultEvents.length === 0) {
        return [{kind: 0, created_at: 0, tags: [], content: "{}", pubkey: "", id: "", sig: ""}];
    }

	resultEvents.sort((a, b) => b.created_at - a.created_at);
	
    return resultEvents;
}

/**
 * Retrieves the followers of a user from relays (Kind 3). Asynchronously updates the app state with the number of followers.
 * @param pubkey - The public key of the user, hex format.
 * @returns A boolean indicating whether the operation was successful.
 */
const getProfileFollowers = (pubkey : string) : Promise<boolean> => {
	
	const followerList : Event[] = []

	return new Promise((resolve) => {
		try{
			const data = relaysPool.subscribeMany(
				relays,
				[{
					kinds: [3],
					"#p": [pubkey],
				}],
				{
					eoseTimeout: 100,
					onevent(e) {
						followerList.push(e);
					},
					oneose() {
						data.close();
						app.set("#p_" + pubkey, followerList.length);
						resolve(true)
					},
				},
			);
		}catch (error) {
			logger.error(error)
			resolve(false)
		}
	});
}

const getProfileFollowing = (pubkey : string) : Promise<Boolean> => {
	
	const followingEvents: Event[] = []

	return new Promise((resolve) => {
		try{
			const data = relaysPool.subscribeMany(
				relays,
				[{
					authors: [pubkey],
					kinds: [3],
				}],
				{
					eoseTimeout: 1000,
					onevent(e) {
						followingEvents.push(e);
					},
					oneose() {
						if (followingEvents.length > 0) {
							followingEvents.sort((a, b) => b.created_at - a.created_at);
							const pubkeys = followingEvents[0].tags.map(item => item[1]);
							app.set("#f_" + pubkey, pubkeys);
						}		
						data.close();
						resolve(true);

					},
				},
			);
		}catch (error) {
			logger.error(error)
			resolve(false)
		}
	});
}

/**
 * Publishes an event to several relays.
 * @param e - The event to publish.
 * @returns A promise that resolves to a boolean indicating whether the operation was successful.
 */
const publishEvent = async (e : Event) : Promise<boolean> => {

	try {
		await Promise.any(relaysPool.publish(relays, e));
		logger.debug("Event published successfully");
		return true;
	}
	catch (error) {
		logger.error('Error publishing event:', error);
		return false;
	}
};

export {getProfileData, getProfileFollowers, getProfileFollowing, publishEvent}