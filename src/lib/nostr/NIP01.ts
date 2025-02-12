import { Event } from "nostr-tools"
import { relays, relaysPool } from "./core.js";
import { logger } from "../logger.js";
import { emptyNostrProfileData, nostrProfileData } from "../../interfaces/nostr.js";

/**
 * Retrieves the pubkey metadata from the Nostr network (Kind 0).
 * @param pubkey - The public key of the user, hex format.
 * @returns A promise that resolves to the content data of the kind 0 note.
 */
const getPubkeyMedatada = async (pubkey: string): Promise<nostrProfileData> => {
	const metadataEvents: Event[] = []

	return new Promise((resolve) => {
		try{
			const data = relaysPool.subscribeMany(
				relays,
				[{
					authors: [pubkey],
					kinds: [0],
				}],
				{
					eoseTimeout: 1000,
					onevent(e) {
						metadataEvents.push(e);
					},
					oneose() {
						if (metadataEvents.length > 0) {
							metadataEvents.sort((a, b) => b.created_at - a.created_at);
							const data = JSON.parse(metadataEvents[0].content);
							const profileData: nostrProfileData = {
								name: data.name,
								about: data.about,
								picture: data.picture,
								nip05: data.nip05,
								lud16: data.lud16,
								website: data.website,
								display_name: data.display_name,
								banner: data.banner,
							}
							resolve(profileData);
						}		
						data.close();
						resolve(emptyNostrProfileData);
					},
				},
			);
		}catch (error) {
			logger.error(`getPubkeyMedatada - Error retrieving pubkey metadata: ${error}`)
			resolve(emptyNostrProfileData)
		}
	});
}

/*
* Retrieves the pubkey's following list relays (Kind 3).
* @param pubkey - The public key of the user, hex format.
* @returns A promise that resolves to the list of public keys the user is following.
*/
const getPubkeyFollowing = (pubkey : string) : Promise<string[]> => {
	
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
							resolve(pubkeys);
						}		
						data.close();
						resolve([]);
					},
				},
			);
		}catch (error) {
			logger.error(`getPubkeyFollowing - Error retrieving pubkey following: ${error}`)
			resolve([])
		}
	});
}


/**
 * Retrieves the pubkey's followers list relays (Kind 3). 
 * @param pubkey - The public key of the user, hex format.
 * @returns A boolean indicating whether the operation was successful.
 */
const getPubkeyFollowers = (pubkey : string) : Promise<string[]> => {
	
	const followerList : string[] = []

	return new Promise((resolve) => {
		try{
			const data = relaysPool.subscribeMany(
				relays,
				[{
					kinds: [3],
					"#p": [pubkey],
					since: Math.floor(Date.now() / 1000) - (365 * 24 * 60 * 60),
					until: Math.floor(Date.now() / 1000),
				}],
				{
					eoseTimeout: 1000,
					onevent(e) {
						followerList.push(e.pubkey);
					},
					oneose() {
						data.close();
						resolve(followerList);
					},
				},
			);
		}catch (error) {
			logger.error(`getPubkeyFollowers - Error retrieving pubkey followers: ${error}`)
			resolve([])
		}
	});
}

const isEphemeral = (kind: number) => {
	return (kind >= 20000 && kind < 30000);
}

const isReplaceable = (kind: number) => {
	return ((kind >= 10000 && kind < 20000) || kind === 0 || kind === 3);
}

export {getPubkeyMedatada, getPubkeyFollowing, getPubkeyFollowers, isEphemeral, isReplaceable}