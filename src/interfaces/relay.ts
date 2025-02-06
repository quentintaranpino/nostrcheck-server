import { Event } from "nostr-tools";

interface MemoryEvent {
    event: Event;
    processed: boolean;
}

import { WebSocket } from "ws";
interface ExtendedWebSocket extends WebSocket {
  challenge?: string;
}

const allowedTags = ["p", "e", "r", "t", "i", "d", "l", "L", "title", "nonce", "alt", "L", "emoji", "subject", "expiration", "delegation"];

export { MemoryEvent, ExtendedWebSocket, allowedTags };