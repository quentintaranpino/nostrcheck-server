import { Event } from "nostr-tools";

interface MemoryEvent {
    event: Event;
    processed: boolean;
}

import { WebSocket } from "ws";
interface ExtendedWebSocket extends WebSocket {
  challenge?: string;
}

const allowedTags = ["p", "e", "r", "t", "i", "d", "l", "L", "title", "nonce", "alt", "emoji", "subject", "expiration", "delegation", "proxy"];

export { MemoryEvent, ExtendedWebSocket, allowedTags };