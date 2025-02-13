// import app from "../../app.js"; 
import { MemoryEvent } from "../../interfaces/relay.js";
import { deflate, inflate } from 'zlib';
import { promisify } from 'util';
import { Event } from "nostr-tools";
import LZString from 'lz-string';

const deflateAsync = promisify(deflate);
const inflateAsync = promisify(inflate);

/**
 * Generate a dictionary from the content of the provided events
 * @param events Events to generate the dictionary from
 * @returns Dictionary
 */
const generateDict = (events: Map<string, MemoryEvent>): Buffer => {
    const eventsArray = Array.from(events.values());
    const dict = eventsArray
        .slice(0, Math.min(10000, eventsArray.length))
        .map(e => e.event.content)
        .join('');
    return Buffer.from(dict, 'utf8');
}

/**
 * Compress an event content using the provided dictionary
 * @param e Event to compress
 * @param dictionary Dictionary to use for compression
 * @returns Compressed event
 */
const compressEvent = async (e: Event, dictionary: Buffer): Promise<Event> => {
    try {
        const compressed = await deflateAsync(e.content, { dictionary });
        return { ...e, content: compressed.toString('base64') };
    } catch (error: any) {
        throw new Error(`compressEvent - Error compressing event: ${error.message}`);
    }
};

/**
 * Decompress an event content using the provided dictionary
 * @param e Event to decompress
 * @param dictionary Dictionary to use for decompression
 * @returns Decompressed event
 */
const decompressEvent = async (e: Event, dictionary: Buffer): Promise<Event> => {
    try {
        const compressedBuffer = Buffer.from(e.content, 'base64');
        const decompressedBuffer = await inflateAsync(compressedBuffer, { dictionary });
        const content = decompressedBuffer.toString('utf8');
        return { ...e, content };
    } catch (error: any) {
        throw new Error(`decompressEvent - Error decompressing event: ${error.message}`);
    }
};

const compressEvent2 = async (e: Event): Promise<Event> => {
    try {
        const compressed = await LZString.compress(e.content);
        return { ...e, content: compressed };
    } catch (error: any) {
        throw new Error(`compressEvent - Error compressing event: ${error.message}`);
    }
}

const decompressEvent2 = async (e: Event): Promise<Event> => {
    try {
        const decompressed = LZString.decompress(e.content);
        return { ...e, content: decompressed };
    } catch (error: any) {
        throw new Error(`decompressEvent - Error decompressing event: ${error.message}`);
    }
}

export {generateDict, compressEvent, decompressEvent, compressEvent2, decompressEvent2};