import { Event } from "nostr-tools";

interface MemoryEvent {
    event: Event;
    content_lower: string;
    processed: boolean;
}

import { WebSocket } from "ws";
interface ExtendedWebSocket extends WebSocket {
  challenge?: string;
  isAlive?: boolean;
}

const allowedTags = [
  "A",
  "I",
  "a",
  "alt",
  "amount",
  "bid",
  "bookmark",
  "bolt11",
  "bond",
  "blurhash",
  "challenge",
  "client",
  "clone",
  "communities",
  "content-warning",
  "context",
  "current_participants",
  "d",
  "defer",
  "delegation",
  "del",
  "description",
  "dim",
  "duration",
  "e",
  "E",
  "encrypted",
  "end",
  "end_tzid",
  "endsAt",
  "emoji",
  "expiration",
  "f",
  "fa",
  "fallback",
  "file",
  "fork",
  "g",
  "goal",
  "h",
  "i",
  "imeta",
  "image",
  "ios",
  "k",
  "K",
  "l",
  "L",
  "layer",
  "location",
  "m",
  "magnet",
  "mint",
  "mute",
  "name",
  "network",
  "nonce",
  "option",
  "output",
  "ox",
  "p",
  "P",
  "param",
  "polltype",
  "price",
  "proxy",
  "published_at",
  "q",
  "r",
  "s",
  "server",
  "subject",
  "summary",
  "t",
  "title",
  "text-track",
  "thumb",
  "tracker",
  "u",
  "url",
  "web",
  "word",
  "x",
  "y",
  "z",
  "zap",
  "-"
];



export { MemoryEvent, ExtendedWebSocket, allowedTags };