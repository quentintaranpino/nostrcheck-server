
import { Event, getEventHash, getSignature, getPublicKey } from "nostr-tools";
import config from "config";
import { logger } from "../../lib/logger.js";
import { ResultMessage } from "../../interfaces/server.js";
import { NIPKinds } from "../../interfaces/kinds.js";

//https://github.com/nostr-protocol/nips/blob/master/94.md



let event = {
    id : "",
    pubkey: "",
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





