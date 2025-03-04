import { Event } from "nostr-tools";

interface MetadataEvent extends Event {
  metadata?: { [key: string]: string | string[] };
}


interface MemoryEvent {
    event: MetadataEvent;
    processed: boolean;
}

import { WebSocket } from "ws";
import { ResultMessagev2 } from "./server";

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


interface RelayJob {
  fn: (...args: any[]) => Promise<any> | any;
  args?: any[];
}

interface RelayStatusMessage extends ResultMessagev2 {
  websocketConnections: number;
  queueLength: number;
  workerCount: number;
}

export interface SharedChunk {
  buffer: SharedArrayBuffer;
  indexMap: Uint32Array;
  timeRange: { min: number; max: number }; 
}

const CHUNK_SIZE = 2000; 

interface RelayEvents {
  pending: Map<string, Event>;
  pendingDelete: Map<string, Event>;
  memoryDB: Map<string, MemoryEvent>;
  sharedDBChunks: SharedChunk[]; 
  relayEventsLoaded: boolean;
}

const eventStore: RelayEvents = {
  pending: new Map<string, Event>(),
  pendingDelete: new Map<string, Event>(),
  memoryDB: new Map<string, MemoryEvent>(),
  sharedDBChunks: [], 
  relayEventsLoaded: false,
};

export { MemoryEvent, ExtendedWebSocket, allowedTags, RelayJob, RelayStatusMessage, MetadataEvent, eventStore, CHUNK_SIZE };