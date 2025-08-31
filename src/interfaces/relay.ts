import { Event, Filter } from "nostr-tools";
import { WebSocket } from "ws";
import { ResultMessagev2 } from "./server";
import { IpInfo } from "./security";

interface ExtendedWebSocket extends WebSocket {
  challenge?: string;
  isAlive?: boolean;
  reqInfo: IpInfo;
}

const allowedTags = [
  "A",
  "I",
  "a",
  "alt",
  "amt",
  "amount",
  "bid",
  "bookmark",
  "bolt11",
  "bond",
  "blurhash",
  "ciphersuite",
  "challenge",
  "client",
  "clone",
  "comment",
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
  "extensions",
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
  "modules",
  "mls_protocol_version",
  "mute",
  "n",
  "name",
  "network",
  "nonce",
  "no_transform",
  "nuts",
  "option",
  "output",
  "ox",
  "p",
  "P",
  "param",
  "payment_request",
  "pm",
  "polltype",
  "premium",
  "price",
  "proof",
  "proxy",
  "published_at",
  "q",
  "r",
  "rating",
  "request",
  "relay",
  "relays",
  "s",
  "segment",
  "server",
  "size",
  "source",
  "status",
  "subject",
  "summary",
  "t",
  "title",
  "text-track",
  "thumb",
  "tracker",
  "u",
  "url",
  "visibility",
  "web",
  "word",
  "x",
  "y",
  "z",
  "zap",
  "-"
];

interface MetadataEvent extends Event {
  tenantid: number;
  metadata?: { [key: string]: string | string[] };
}

interface RelayJob {
  fn: (...args: any[]) => Promise<any> | any;
  args?: any[];
}

interface RelayStatusMessage extends ResultMessagev2 {
  websocketConnections: number;
  usedMemory: number;
  queueLength: number;
  workerCount: number;
  heavyTasksLength: number;
  lightTasksLength: number;
  heavyTasks: PendingGetEventsTask[];
  lightTasks: PendingGetEventsTask[];
  pendingEvents: number;
  pendingDeleteEvents: number;
}

interface PendingGetEventsTask {
  id: string; 
  filters: Filter[];
  enqueuedAt: number;
}

interface SharedChunk {
  id: string;           
  isActive: boolean;    
  buffer: SharedArrayBuffer;
  indexMap: Uint32Array;
  timeRange: {
    min: number;
    max: number;
  };
  usedBytes?: number; 
}

const CHUNK_SIZE = 3000; 

interface RelayEvents {
  pending: Map<string, MetadataEvent>;
  pendingDelete: Map<string, MetadataEvent>;
  eventIndex: Map<string, EventIndex>;
  sharedDBChunks: SharedChunk[];
  relayEventsLoaded: boolean;
  globalIds: Set<string>;
  globalPubkeys: Set<string>;
  globalExpirable: Set<string>;
}

interface EventIndex {
  id: string;     
  tenantid: number;
  chunkIndex: number;  
  position: number;    
  processed: boolean;   
  created_at: number;   
  kind?: number;       
  pubkey?: string;
  expiration?: number;
}

const eventStore: RelayEvents = {
  pending: new Map<string, MetadataEvent>(),
  pendingDelete: new Map<string, MetadataEvent>(),
  eventIndex: new Map<string, EventIndex>(),
  sharedDBChunks: [],
  relayEventsLoaded: false,
  globalIds: new Set<string>(),
  globalPubkeys: new Set<string>(),
  globalExpirable: new Set<string>(),
};

export { ExtendedWebSocket, allowedTags, SharedChunk, PendingGetEventsTask, RelayJob, RelayStatusMessage, MetadataEvent, EventIndex, RelayEvents, eventStore, CHUNK_SIZE };