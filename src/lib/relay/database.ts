import { Application } from "express";
import { Event, Filter, matchFilter } from "nostr-tools";
import { dbMultiSelect, dbUpsert } from "../database.js";
import { logger } from "../logger.js";
import { MemoryEvent } from "../../interfaces/relay.js";

const initEvents = async (app: Application): Promise<Map<string, MemoryEvent>> => {
    if (!app.get("relayEvents")) {
        const events: Map<string, MemoryEvent> = new Map();
        app.set("relayEvents", events);

        const loadedEvents = await getEventsDB();
        for (const event of loadedEvents) {
            events.set(event.id, { event, processed: true });
        }

        return events;
    }

    return app.get("relayEvents");
};

const getEventsDB = async (): Promise<Event[]> => {
    const queryFields = ["event_id", "pubkey", "kind", "created_at", "content", "sig"];
    const whereClause = "active = ?";
    const dbResults = await dbMultiSelect(queryFields, "events", whereClause, ["1"], false);
    if (dbResults.length === 0) return [];

    const eventsMap = new Map<string, Event>();
    
    dbResults.forEach((row) => {
        eventsMap.set(row.event_id, {
            id: row.event_id,
            pubkey: row.pubkey,
            kind: row.kind,
            created_at: row.created_at,
            content: row.content,
            tags: [], 
            sig: row.sig
        });
    });

    const eventIds = Array.from(eventsMap.keys());
    if (eventIds.length > 0) {
        const tagResults = await dbMultiSelect(
            ["event_id", "tag_name", "tag_value", "extra_values"],
            "eventtags",
            `event_id IN (${eventIds.map(() => "?").join(", ")})`,
            eventIds,
            false
        );

        try {
            tagResults.forEach((tagRow) => {
                const event = eventsMap.get(tagRow.event_id);
                if (event) {
                    const tag = [tagRow.tag_name, tagRow.tag_value];
                    if (tagRow.extra_values) {
                        tag.push(...JSON.parse(tagRow.extra_values));
                    }
                    event.tags.push(tag);
                }
            });
        } catch (e) {
            logger.error("Error parsing extra_values in eventtags:", e);
        }
    }

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


const getEvents = async (filters: Filter[], relayMap: Map<string, MemoryEvent>): Promise<Event[]> => {
    return Array.from(relayMap.values())
        .map(entry => entry.event)
        .filter(event => filters.some(f => matchFilter(f, event)))
        .sort((a, b) => b.created_at - a.created_at); // Ordenar por created_at en orden descendente
};
export { getEvents, storeEvent, initEvents };