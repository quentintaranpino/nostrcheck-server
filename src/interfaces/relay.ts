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
  "p",
  "e",
  "r",
  "t",
  "i",
  "d",
  "l",
  "L",
  "title",
  "nonce",
  "alt",
  "emoji",
  "subject",
  "expiration",
  "delegation",
  "proxy",
  "group",
  "relay",
  "word",
  "pin",
  "mute",
  "bookmark",
  "communities",
  "start",
  "end",
  "location",
  "g",
  "start_tzid",
  "end_tzid",
  "summary",
  "image",
  "status",
  "fb"
];

export { MemoryEvent, ExtendedWebSocket, allowedTags };