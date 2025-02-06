import { Event } from "nostr-tools";

interface MemoryEvent {
    event: Event;
    processed: boolean;
}

import { WebSocket } from "ws";
interface ExtendedWebSocket extends WebSocket {
  challenge?: string;
}

const allowedTags = [
  "a",
  "alt",
  "amt",
  "bookmark",
  "bond",
  "communities",
  "content-warning",
  "current_participants",
  "d",
  "defer",
  "delegation",
  "del",
  "description",
  "e",
  "end",
  "end_tzid",
  "emoji",
  "expiration",
  "f",
  "fa",
  "fork",
  "g",
  "i",
  "imeta",
  "image",
  "k",
  "L",
  "l",
  "layer",
  "m",
  "mint",
  "mute",
  "name",
  "network",
  "nonce",
  "pm",
  "pin",
  "premium",
  "p",
  "proxy",
  "rating",
  "r",
  "relay",
  "relays",
  "s",
  "source",
  "start",
  "start_tzid",
  "status",
  "streaming",
  "subject",
  "summary",
  "t",
  "thumb",
  "title",
  "word",
  "x",
  "y",
  "z",
  "-",
];



export { MemoryEvent, ExtendedWebSocket, allowedTags };