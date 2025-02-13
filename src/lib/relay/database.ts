import { Application } from "express";
import { Event, Filter, matchFilter } from "nostr-tools";
import { dbBulkInsert, dbSimpleSelect} from "../database.js";
import { logger } from "../logger.js";
import { MemoryEvent } from "../../interfaces/relay.js";
import { isModuleEnabled } from "../config.js";
import app from "../../app.js";

const initEvents = async (app: Application): Promise<boolean> => {

  if (!isModuleEnabled("relay", app)) return false;
  if (!app.get("relayEvents")) {
    const eventsMap: Map<string, MemoryEvent> = new Map();
    const pendingEvents: Map<string, Event> = new Map();
    const eventsArray: Event[] = [];
    app.set("relayEvents", { memoryDB: eventsMap, sortedArray: eventsArray, pending: pendingEvents });
    app.set("relayEventsLoaded", false);

    const loadEvents = async () => {
      try {
        const limit = 100000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            logger.info(`initEvents - Loaded ${eventsMap.size} events from DB`);
            const loadedEvents = await getEventsDB(offset, limit);
            if (loadedEvents.length === 0 || offset > 400000) {
                hasMore = false;
            } else {
                for (const event of loadedEvents) {
                    eventsMap.set(event.id, { event: event, content_lower: event.content.toLowerCase(), processed: true });
                    eventsArray.push(event);
                }
                offset += limit;
            }
        }

        eventsArray.sort((a, b) => b.created_at - a.created_at);
        logger.info(`initEvents - Loaded ${eventsMap.size} events from DB`);
        
      } catch (error) {
        logger.info(`initEvents - Error loading events: ${error}`);
      } finally {
        app.set("relayEventsLoaded", true);
      }
    };

    loadEvents();

    return true;
  }

  return false;
};


const getEventsDB = async (offset: number, limit: number): Promise<Event[]> => {

    const query = `
        SELECT
            e.event_id,
            e.pubkey,
            e.kind,
            e.created_at,
            e.content,
            e.sig,
            t.tag_name,
            t.tag_value,
            t.extra_values
        FROM (
            SELECT *
            FROM events
            WHERE active = '1'
            ORDER BY id DESC
            LIMIT ${limit} OFFSET ${offset}
        ) AS e
        LEFT JOIN eventtags t ON e.event_id = t.event_id;
    `;

    const dbResult = await dbSimpleSelect("events", query);
    if (!dbResult) return [];

    interface EventRow {
        event_id: string;
        pubkey: string;
        kind: number;
        created_at: number;
        content: string;
        sig: string;
        tag_name?: string;
        tag_value?: string;
        extra_values?: string;
    }

    const eventsMap = new Map<string, Event>();
    const events: EventRow[] = JSON.parse(JSON.stringify(dbResult));

    events.forEach((row: EventRow) => {
        if (!eventsMap.has(row.event_id)) {
            eventsMap.set(row.event_id, {
                id: row.event_id,
                pubkey: row.pubkey,
                kind: row.kind,
                created_at: row.created_at,
                content: row.content,
                tags: [],
                sig: row.sig
            });
        }

        const event = eventsMap.get(row.event_id);
        if (event && row.tag_name) {
            const tag = [row.tag_name, row.tag_value];
            // if (row.extra_values) {
            //     try {
            //         tag.push(...JSON.parse(row.extra_values));
            //     } catch (e) {
            //         logger.error("Error parsing extra_values in eventtags:", e);
            //     }
            // }
            event.tags.push(tag.filter(t => t !== undefined));
        }
    });

    return Array.from(eventsMap.values());
};

/**
 * Inserts one or more events (and their tags) into the database using bulk insert.
 * @param {Event | Event[]} eventsInput - Un evento o un array de eventos a insertar.
 * @returns {Promise<number>}
 */
const storeEvents = async (eventsInput: Event | Event[]): Promise<number> => {

    const events: Event[] = Array.isArray(eventsInput) ? eventsInput : [eventsInput];
    const eventsToStore = events.filter(e => e && !(e.kind >= 20000 && e.kind < 30000));
    if (eventsToStore.length === 0) return 0;
  

    const now = Math.floor(Date.now() / 1000);
    const eventValues = eventsToStore.map(e => [
      true,              // active
      false,             // checked
      e.id,              // event_id
      e.pubkey,
      e.kind,
      e.created_at,
      e.content || "",
      e.sig,
      now
    ]);
  
    const eventColumns = [
      "active",
      "checked",
      "event_id",
      "pubkey",
      "kind",
      "created_at",
      "content",
      "sig",
      "received_at"
    ];
  
    const insertedRows = await dbBulkInsert("events", eventColumns, eventValues);
    if (insertedRows !== eventsToStore.length) {
      logger.error(`storeEvents - Failed to insert events. Expected: ${eventsToStore.length}, Inserted: ${insertedRows}`);
    }
  
    const allTagValues: any[][] = [];
    eventsToStore.forEach(e => {
      if (e.tags && e.tags.length > 0) {
        e.tags.forEach((tag: string[], index: number) => {
          const tagName = tag[0];
          const tagValue = tag[1] || "";
          const extraValues = tag.slice(2).join(",") || null;
          allTagValues.push([e.id, tagName, tagValue, index, extraValues]);
        });
      }
    });
  
    if (allTagValues.length > 0) {
      const tagColumns = ["event_id", "tag_name", "tag_value", "position", "extra_values"];
      const insertedTagRows = await dbBulkInsert("eventtags", tagColumns, allTagValues);
      if (insertedTagRows !== allTagValues.length) {
        logger.error(`storeEvents - Failed to insert all event tags. Expected: ${allTagValues.length}, Inserted: ${insertedTagRows}`);
      }
    }
  
    logger.debug(`storeEvents - Bulk inserted events: ${insertedRows}`);
    return insertedRows;
  };

  const getEvents = async (filters: Filter[], relayData: { memoryDB: Map<string, MemoryEvent>; sortedArray: Event[] }): Promise<Event[]> => {

    const now = Math.floor(Date.now() / 1000);
    const allEvents: Event[] = [];

    const maxLimit = app.get("config.relay")["limitation"]["max_limit"];
  
    for (const filter of filters) {
      const until = filter.until !== undefined ? filter.until : now;
      const since = filter.since !== undefined ? filter.since : 0;
      
      // If is a search query, we don't apply the limit
      let effectiveLimit = filter.limit;
      const isSearch = filter.search && filter.search.trim().length >= 3;
      if (!isSearch) {
        if (effectiveLimit === undefined) {
          effectiveLimit = maxLimit;
        } else if (effectiveLimit > maxLimit) {
          effectiveLimit = maxLimit;
        }
      }
      
      const rawSearch = filter.search ? filter.search.trim() : "";
      const searchQuery = rawSearch.length >= 3 ? rawSearch.toLowerCase() : null;
      const startIndex = binarySearchFirstDescending(relayData.sortedArray, until);
      const endIndex = binarySearchFirstStrictDescending(relayData.sortedArray, since);
      const candidates = relayData.sortedArray.slice(startIndex, endIndex);
      
      const { search, ...basicFilter } = filter;
      let filtered: { event: Event; score: number }[] = [];
      
      for (const event of candidates) {
        if (!matchFilter(basicFilter, event)) continue;
        
        if (!searchQuery) {
          filtered.push({ event, score: 0 });
        } else {
          const memEvent = relayData.memoryDB.get(event.id);
          const contentLower = memEvent ? memEvent.content_lower : event.content.toLowerCase();
          const index = contentLower.indexOf(searchQuery);
          if (index !== -1) filtered.push({ event, score: index });
        }
        
        // If we have reached the limit, we stop (if it's not a search query)
        if (!searchQuery && effectiveLimit !== undefined && filtered.length >= effectiveLimit) break;
      }
      
      if (searchQuery) filtered.sort((a, b) => a.score - b.score);
      
      // Obtain the events from the filtered list
      const eventsForFilter =
        effectiveLimit !== undefined
          ? filtered.slice(0, effectiveLimit).map((item) => item.event)
          : filtered.map((item) => item.event);
      
      for (const event of eventsForFilter) {
        allEvents.push(event);
      }
      
    }
    
    return allEvents;
  };
  


function binarySearchFirstDescending(arr: Event[], target: number): number {
    let low = 0;
    let high = arr.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (arr[mid].created_at > target) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    return low;
}

function binarySearchFirstStrictDescending(arr: Event[], target: number): number {
    let low = 0;
    let high = arr.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (arr[mid].created_at >= target) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    return low;
}

/**
 * Returns the index where an event should be inserted in a sorted array.
 * 
 * This function performs a binary search on a sorted array of events and returns the index
 * at which a new event should be inserted to maintain the order of the array.
 * using the `created_at` timestamp as the sorting criterion.
 * 
 * @param {Event[]} arr - The sorted array of events.
 * @param {number} target - The timestamp to compare against.
 * @returns {number}
*/
const binarySearchCreatedAt = (arr: Event[], target: number): number => {
    let low = 0;
    let high = arr.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (arr[mid].created_at < target) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    return low;
  }

export { getEvents, storeEvents, initEvents, binarySearchCreatedAt };