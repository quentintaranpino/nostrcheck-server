import { Application } from "express";
import { Event, Filter, matchFilter } from "nostr-tools";
import { dbBulkInsert, dbSimpleSelect, dbUpsert } from "../database.js";
import { logger } from "../logger.js";
import { MemoryEvent } from "../../interfaces/relay.js";
import { isModuleEnabled } from "../config.js";

const initEvents = async (app: Application): Promise<boolean> => {

    if (!isModuleEnabled("relay", app)) return false;
    if (!app.get("relayEvents")) {
        const eventsMap: Map<string, MemoryEvent> = new Map();
        const pendingEvents: Map<string, Event> = new Map();
        const eventsArray: Event[] = [];
        app.set("relayEvents", { memoryDB: eventsMap, sortedArray: eventsArray, pending: pendingEvents });

        const loadEvents = async () => {
            try {
                const limit = 100000;
                let offset = 0;
                let hasMore = true;

                while (hasMore) {
                    logger.info(`Loaded ${eventsMap.size} events from DB`);
                    const loadedEvents = await getEventsDB(offset, limit);
                    if (loadedEvents.length === 0) {
                        hasMore = false;
                    } else {
                        for (const event of loadedEvents) {
                            eventsMap.set(event.id, { event, processed: true });
                            eventsArray.push(event);
                        }
                        offset += limit;
                    }
                }

                eventsArray.sort((a, b) => b.created_at - a.created_at);
                logger.info("Loaded", eventsMap.size, "events from DB");
            } catch (error) {
                logger.error("Error loading events:", error);
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
        FROM events e
        LEFT JOIN eventtags t ON e.event_id = t.event_id
        WHERE ACTIVE = '1'
        ORDER BY e.id DESC
        LIMIT ${limit} OFFSET ${offset}
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
      logger.error("Bulk insert: Failed to insert all events. Expected:", eventsToStore.length, "Inserted:", insertedRows);
      return 0;
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
        logger.error("Bulk insert: Failed to insert all event tags. Expected:", allTagValues.length, "Inserted:", insertedTagRows);
      }
    }
  
    logger.debug("Bulk inserted events:", insertedRows);
    return insertedRows;
  };

const getEvents = async (filters: Filter[], relayData: { map: Map<string, MemoryEvent>; sortedArray: Event[] }): Promise<Event[]> => {
    const now = Math.floor(Date.now() / 1000);
    const allEvents: Event[] = [];
    for (const filter of filters) {
        const until = filter.until !== undefined ? filter.until : now;
        const since = filter.since !== undefined ? filter.since : 0;
        const limit = filter.limit;

        const rawSearch = filter.search ? filter.search.trim() : "";
        const searchQuery = rawSearch.length >= 3 ? rawSearch.toLowerCase() : null;

        const startIndex = binarySearchFirst(relayData.sortedArray, until, (event, target) => event.created_at <= target);
        const endIndex = binarySearchFirst(relayData.sortedArray, since, (event, target) => event.created_at < target);
        const candidates = relayData.sortedArray.slice(startIndex, endIndex);
        const { search, ...basicFilter } = filter;

        let filtered: { event: Event; score: number }[] = [];
        for (const event of candidates) {
            if (!matchFilter(basicFilter, event)) continue;
            if (!searchQuery) {
                filtered.push({ event, score: 0 });
            } else {
                const content = event.content.toLowerCase();
                const index = content.indexOf(searchQuery);
                if (index !== -1) filtered.push({ event, score: index });
            }
            if (!searchQuery && limit !== undefined && filtered.length >= limit) break;
        }

        if (searchQuery) filtered.sort((a, b) => a.score - b.score);

        const eventsForFilter = limit !== undefined? filtered.slice(0, limit).map((item) => item.event) : filtered.map((item) => item.event);
        allEvents.push(...eventsForFilter);
    }
    
    return allEvents;
};

function binarySearchFirst(arr: Event[], target: number, compare: (event: Event, target: number) => boolean): number {
    let low = 0;
    let high = arr.length;
    let result = arr.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (compare(arr[mid], target)) {
        result = mid;
        high = mid;
        } else {
        low = mid + 1;
        }
    }
    return result;
}

export { getEvents, storeEvents, initEvents };