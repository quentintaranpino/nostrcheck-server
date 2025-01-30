import { Application } from "express";
import { Event, Filter } from "nostr-tools";
import { dbMultiSelect, dbUpsert } from "../database.js";
import { logger } from "../logger.js";
import { MemoryEvent } from "../../interfaces/relay.js";

const initEventsDB = async (app: Application): Promise<Map<string, MemoryEvent>> => {

    if (!app.get("relayEvents")) {
        const events: Map<string, MemoryEvent> = new Map();
        app.set("relayEvents", events);
        const loadedEvents = await getEventsDB([], events);
        loadedEvents.forEach((event) => events.set(event.id, { event, processed: true }));
        return events;
    }

    return app.get("relayEvents");
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
      received_at: Date.now()
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


const getEventsDB = async (filters: Filter[], relayMap: Map<string, MemoryEvent>): Promise<Event[]> => {

    const memEventIds = Array.from(relayMap.keys());

    const { whereClause, params, limit } = translateFiltersToSQL(filters, memEventIds);
    if (!whereClause) return [];

    const queryFields = ["event_id", "pubkey", "kind", "created_at", "content", "sig"];
    const limitClause = limit ? `LIMIT ${limit}` : "";

    const dbResults = await dbMultiSelect(queryFields, "events", whereClause, params, false, limitClause);

    if (dbResults.length === 0) return relayMap.size === 0 ? [] : Array.from(relayMap.values()).map((memEvent) => memEvent.event);

    const tempEvents = new Map<string, Event>();
    dbResults.forEach((row) => {
        tempEvents.set(row.event_id, { 
            id: row.event_id,
            pubkey: row.pubkey,
            kind: row.kind,
            content: row.content,
            tags: [], 
            created_at: row.created_at,
            sig: row.sig
        });
    });

    const eventIds = Array.from(tempEvents.keys());
    if (eventIds.length > 0) {
        const tagResults = await dbMultiSelect(
            ["event_id", "tag_name", "tag_value", "extra_values"],
            "eventtags",
            `event_id IN (${eventIds.map(() => "?").join(", ")})`,
            eventIds,
            false
        );

        try{
            tagResults.forEach((tagRow) => {
                const event = tempEvents.get(tagRow.event_id);
                if (event) {
                    const tag = [tagRow.tag_name, tagRow.tag_value];
                    if (tagRow.extra_values) tag.push(...JSON.parse(tagRow.extra_values));
                    event.tags.push(tag);
                }
            });
        }catch(e){
            logger.error("Error parsing extra_values in eventtags:", e);
        }
       
    }

    tempEvents.forEach((event, eventId) => {
        if (!relayMap.has(eventId))  relayMap.set(eventId, { event, processed: true });
    });

    return Array.from(tempEvents.values());

};


const translateFiltersToSQL = (filters: Filter[], memEventIds: string[]): { whereClause: string, params: any[], limit?: number } => {
    const sqlParts: string[] = [];
    const params: any[] = [];
    let limit: number | undefined;

    filters.forEach((filter) => {
        const parts: string[] = [];

        if (filter.ids && filter.ids.length > 0) {
            parts.push(`event_id IN (${filter.ids.map(() => '?').join(', ')})`);
            params.push(...filter.ids);
        }

        if (filter.kinds && filter.kinds.length > 0) {
            parts.push(`kind IN (${filter.kinds.map(() => '?').join(', ')})`);
            params.push(...filter.kinds);
        }

        if (filter.authors && filter.authors.length > 0) {
            parts.push(`pubkey IN (${filter.authors.map(() => '?').join(', ')})`);
            params.push(...filter.authors);
        }

        Object.keys(filter).forEach((key) => {
            if (key.startsWith("#")) {
                const tagName = key.substring(1);
                const tagValues = (filter as Record<string, string[]>)[key]; 

                if (Array.isArray(tagValues) && tagValues.length > 0) {
                    parts.push(
                        `EXISTS (SELECT 1 FROM eventtags WHERE eventtags.event_id = events.event_id AND eventtags.tag_name = ? AND eventtags.tag_value IN (${tagValues.map(() => '?').join(', ')}))`
                    );
                    params.push(tagName, ...tagValues);
                }
            }
        });

        if (filter.since) {
            parts.push(`created_at >= ?`);
            params.push(filter.since);
        }

        if (filter.until) {
            parts.push(`created_at <= ?`);
            params.push(filter.until);
        }

        if (filter.limit && typeof filter.limit === 'number' && filter.limit > 0) {
            limit = filter.limit;
        }

        if (parts.length > 0) {
            sqlParts.push('(' + parts.join(' AND ') + ')');
        }
    });

    if (memEventIds.length > 0) {
        sqlParts.push(`event_id NOT IN (${memEventIds.map(() => '?').join(', ')})`);
        params.push(...memEventIds);
    }

    let whereClause = sqlParts.length > 1 ? sqlParts.join(' AND ') : sqlParts[0] || "1=1";

    logger.debug(`Generated SQL Where Clause: ${whereClause}`);
    logger.debug(`Generated SQL Params: ${JSON.stringify(params)}`);

    return { whereClause, params, limit };
};

export { getEventsDB, storeEvent, initEventsDB };