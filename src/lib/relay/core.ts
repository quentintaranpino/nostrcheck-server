import { matchFilter as nostrMatchFilter } from "nostr-tools";
import { verifyEventInternal } from "../nostr/core.js";
import * as z from "zod";
import WebSocket from "ws";

export const relayMessageSchema = z.union([
  z.tuple([z.literal("EVENT"), z.object({
    id: z.string(),
    kind: z.number(),
    pubkey: z.string(),
    content: z.string(),
    tags: z.array(z.array(z.string())),
    created_at: z.number(),
    sig: z.string(),
  })]),
  z.tuple([z.literal("REQ"), z.string(), z.object({}).passthrough()]),
  z.tuple([z.literal("CLOSE"), z.string()]),
]);

export const parseRelayMessage = (data: WebSocket.RawData): any | null => {
  try {
    const message = JSON.parse(data.toString());
    const result = relayMessageSchema.safeParse(message);
    return result.success ? result.data : null;
  } catch {
    return null; 
  }
};

export const isValidEvent = async (event: any): Promise<boolean> => {
    const verify = await verifyEventInternal(event);
  return verify == 0 ? true : false;
};

export const matchFilter = (filter: any, event: any): boolean => {
  return nostrMatchFilter(filter, event);
};
