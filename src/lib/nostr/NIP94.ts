
import { Event, getEventHash, getSignature, getPublicKey } from "nostr-tools";
import config from "config";
import { logger } from "../../lib/logger.js";
import { NIPKinds, ResultMessage } from "../../types.js";

//https://github.com/nostr-protocol/nips/blob/master/94.md


//TODO config privatekey

const privateKey: string = config.get("nostr.privatekey")

let event = {
    id : "",
    pubkey: getPublicKey(privateKey),
    created_at: Math.floor(Date.now() / 1000),
    kind: NIPKinds.NIP94,
    tags: [
            ["url", "https://example.com"],
            ["aes-256-gcm", "key", "iv"],
            ["m", "mime"],
            ["x", "hash sha256"],
            ["size", "bytes"],
            ["dim","200x300"],
            ["magnet", "url"],
            ["i", "torrent infohash"],
            ["blurhash", "value"]
    ],
    content: 'File media description',
    sig : "",

  }

  event.id = getEventHash(event)
  event.sig = getSignature(event, privateKey)

  logger.debug(event.sig);




