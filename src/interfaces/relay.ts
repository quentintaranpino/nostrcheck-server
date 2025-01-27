import { Event } from "nostr-tools";

interface MemoryEvent {
    event: Event;
    processed: boolean;
  }

export { MemoryEvent };