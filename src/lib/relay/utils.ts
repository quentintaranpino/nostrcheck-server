import LZString from "lz-string";
import WebSocket from "ws";
import { Event } from "nostr-tools";
import { logger } from "../logger.js";
import { NIP01_event } from "../../interfaces/nostr.js";

/**
 * Compress an event using LZString
 * @param e Event to compress
 * @returns Compressed event or original if compression is not beneficial
 */
const compressEvent = async (e: Event): Promise<Event> => {
    try {
        if (!e.content) return e;
        const compressed = LZString.compress(e.content);
        if (!compressed || e.content.length <= compressed.length) return e;
        return { ...e, content: `lz:${compressed}` };
    } catch (error: any) {
        logger.warn(`compressEvent2 - Error compressing event: ${error.message}`);
        return e;
    }
};

/**
 * Decompress an event using LZString
 * @param e Event to decompress
 * @returns Decompressed event
 */
const decompressEvent = async (e: Event): Promise<Event> => {
    try {
        if (!e.content || !e.content.startsWith('lz:')) return e;
        const decompressed = LZString.decompress(e.content.substring(3)) ?? e.content;
        return { ...e, content: decompressed };
    } catch (error: any) {
        logger.warn(`decompressEvent2 - Error decompressing event: ${error.message}`);
        return e;
    }
};

/**
 * Parse a relay message using NIP01_event schema
 * @param data Raw data to parse
 * @returns Parsed data or null if parsing fails
 */
const parseRelayMessage = (data: WebSocket.RawData): ReturnType<typeof NIP01_event.safeParse>["data"] | null => {
  try {
    const message = JSON.parse(data.toString());
    const result = NIP01_event.safeParse(message);
    return result.success ? result.data : null;
  } catch {
    return null; 
  }
};

export { compressEvent, decompressEvent, parseRelayMessage};
