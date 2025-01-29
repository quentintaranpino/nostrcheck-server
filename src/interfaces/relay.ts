import { Event } from "nostr-tools";

interface MemoryEvent {
    event: Event;
    processed: boolean;
}

interface AuthEvent {
  id: string;
  kind: 22242;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
  sig: string;
}

import { WebSocket } from "ws";
interface ExtendedWebSocket extends WebSocket {
  challenge?: string;
}

const allowedTags = ["p", "e", "r", "t", "nonce", "alt", "L", "emoji", "subject"];


export { MemoryEvent, AuthEvent, ExtendedWebSocket, allowedTags };