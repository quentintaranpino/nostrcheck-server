import { Application } from "express";
import { Event, Filter, matchFilter } from "nostr-tools";
import { dbSimpleSelect, dbUpsert } from "../database.js";
import { logger } from "../logger.js";
import { MemoryEvent } from "../../interfaces/relay.js";
import { isModuleEnabled } from "../config.js";

const initEvents = async (app: Application): Promise<boolean> => {

    if (!isModuleEnabled("relay", app)) return false;
    if (!app.get("relayEvents")) {
        const eventsMap: Map<string, MemoryEvent> = new Map();
        const eventsArray: Event[] = [];
        app.set("relayEvents", { map: eventsMap, sortedArray: eventsArray });

        const loadEvents = async () => {
            try {
                const limit = 1000;
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

const storeEvent = async (event: Event) : Promise<number> => {

    if (!event) return 0;
    if (event.kind >= 20000 && event.kind < 30000) return 0;
  
    const eventData = {
      active: true,
      checked: false,
      event_id: event.id,
      pubkey: event.pubkey,
      kind: event.kind,
      created_at: event.created_at,
      content: event.content || "",
      sig: event.sig,
      received_at: Math.floor(Date.now() / 1000)
    };
  
    const insertedId = await dbUpsert("events", eventData);
    if (insertedId === 0) {
        logger.error("Error inserting or updating event in DB:", event.id);
        return 0;
    } 
    
    if (event.tags && event.tags.length > 0) {
        await storeEventTags(event.id, event.tags);
    }

    logger.debug("Event inserted in DB:", event.id, "insertId:", insertedId);
    return insertedId;

}

const storeEventTags = async (eventId: string, tags: string[][]): Promise<void> => {
    if (!tags || tags.length === 0) return;

    await Promise.all(tags.map(async (tag, index) => {
        if (!tag || tag.length === 0) return;

        const tagName = tag[0]; 
        const tagValue = tag[1] || ""; 
        const extraValues = tag.slice(2).join(",") || null;

        await dbUpsert("eventtags", {
            event_id: eventId,
            tag_name: tagName,
            tag_value: tagValue,
            position: index,
            extra_values: extraValues
        });
    }));

    logger.debug(`Stored ${tags.length} tags for event ${eventId}`);

};


const getEvents = async (filters: Filter[], relayData: { map: Map<string, MemoryEvent>, sortedArray: Event[] }): Promise<Event[]> => {

    const now = Math.floor(Date.now() / 1000);
    const allEvents: Event[] = [];
  
    for (const filter of filters) {

      const until = filter.until !== undefined ? filter.until : now;
      const since = filter.since !== undefined ? filter.since : 0;
      const limit = filter.limit;
      const searchQuery = filter.search ? filter.search.toLowerCase() : null;

      const filteredEvents: { event: Event, score: number }[] = [];
      for (const event of relayData.sortedArray) {
        if (event.created_at <= until && event.created_at >= since && matchFilter(filter, event)) {
          if (!searchQuery) {
            filteredEvents.push({ event, score: 0 });
            if (limit !== undefined && filteredEvents.length >= limit) break;
          } else {
            const content = event.content.toLowerCase();
            const index = content.indexOf(searchQuery);
            if (index !== -1) {
              filteredEvents.push({ event, score: index });
            }
          }
        }
      }
  
      if (searchQuery)  filteredEvents.sort((a, b) => a.score - b.score);

      const eventsForFilter = limit !== undefined
        ? filteredEvents.slice(0, limit).map(item => item.event)
        : filteredEvents.map(item => item.event);
  
      allEvents.push(...eventsForFilter);
    }
    return allEvents;
  };
  

export { getEvents, storeEvent, initEvents };