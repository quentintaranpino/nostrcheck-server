import LZString from "lz-string";
import WebSocket from "ws";
import { Event } from "nostr-tools";
import { logger } from "../logger.js";
import { NIP01_event } from "../../interfaces/nostr.js";
import { getTextLanguage } from "../language.js";
import { MetadataEvent } from "../../interfaces/relay.js";

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

const parseEventMetadata = async (event: Event): Promise<[string, string, string, number, (string | null), string][]> => {
  const metadata: [string, string, string, number, (string | null), string][] = [];
  let position = 0;
  const now = Math.floor(Date.now() / 1000);

  // Extract language
  if (event.kind === 1 || event.kind === 30023) {
    const eventContent = (await decompressEvent(event)).content || "";
    const eventLanguange = getTextLanguage(eventContent || "");
    if (eventLanguange) {
      metadata.push([event.id, "language", eventLanguange, position, null, now.toString()]);
    }
  }

  return metadata;
};

const fillEventMetadata = async (event: Event): Promise<MetadataEvent> => {
  const metaRows = await parseEventMetadata(event); // Devuelve: [event_id, metadata_type, metadata_value, position, extra_data, created_at][]
  const metaObj: { [key: string]: string | string[] } = {};

  metaRows.forEach(row => {
    const key = row[1];
    const value = row[2];
    if (metaObj[key] === undefined) {
      metaObj[key] = value;
    } else {
      if (Array.isArray(metaObj[key])) {
        if (!metaObj[key].includes(value)) {
          metaObj[key] = [...metaObj[key] as string[], value];
        }
      } else {
        if (metaObj[key] !== value) {
          metaObj[key] = [metaObj[key] as string, value];
        }
      }
    }
  });

  return { ...event, metadata: metaObj };
};


/**
 * Parse search tokens from a search string
 * @param search Search string
 * @returns Parsed tokens and text
 * @example
 * parseSearchTokens("tag:value -tag2:value2")
 */
const parseSearchTokens = (search: string): { plainSearch: string, specialTokens: Record<string, string[]> } => {
  const tokens = search.split(/\s+/);
  let plainSearch = "";
  const specialTokens: Record<string, string[]> = {};
  for (const token of tokens) {
    const m = token.match(/^(-?)(\w+):(.+)$/);
    if (m) {
      const negated = m[1] === "-"; 
      const key = m[2].toLowerCase();
      const value = m[3].toLowerCase();

      if (key === "language" && !negated) {
        specialTokens[key] = specialTokens[key] || [];
        specialTokens[key].push(value);
        continue;
      }
    }
    plainSearch += token + " ";
  }
  return { plainSearch: plainSearch.trim(), specialTokens };
};

export { compressEvent, decompressEvent, parseRelayMessage, parseEventMetadata, parseSearchTokens, fillEventMetadata};
