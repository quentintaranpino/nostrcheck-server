import { Application } from "express";
import { Event, Filter } from "nostr-tools";
import { dbMultiSelect, dbUpsert } from "../database.js";
import { logger } from "../logger.js";
import { MemoryEvent } from "../../interfaces/relay.js";

const initEventsDB = (app: Application): Map<string, MemoryEvent> => {

    if (!app.get("relayEvents")) {
        const events: Map<string, MemoryEvent> = new Map();
        app.set("relayEvents", events);
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
    } else {
      logger.debug("Event inserted in DB:", event.id, "insertId:", insertedId);
        return insertedId;
    }

}

const getEventsDB = async (filters: Filter[], relayMap: Map<string, MemoryEvent>): Promise<Event[]> => {
    const memEventIds = Array.from(relayMap.keys());

    const { whereClause, params, limit } = translateFiltersToSQL(filters, memEventIds);

    if (!whereClause) return [];

    const queryFields = ["event_id", "pubkey", "kind", "created_at", "content", "sig"];
    const limitClause = limit ? `LIMIT ${limit}` : "";

    const dbResults = await dbMultiSelect(queryFields, "events", whereClause, params, false, limitClause);

    const eventsFromDB: Event[] = dbResults.map((row) => ({
        id: row.event_id,
        pubkey: row.pubkey,
        kind: row.kind,
        content: row.content,
        tags: [], 
        created_at: row.created_at,
        sig: row.sig,
    }));

    if (eventsFromDB.length === 0) return relayMap.size === 0 ? [] : Array.from(relayMap.values()).map((memEvent) => memEvent.event);

    eventsFromDB.forEach((ev) => {
        if (!relayMap.has(ev.id)) {
            relayMap.set(ev.id, { event: ev, processed: true });
        }
    });

    return eventsFromDB;
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

  let whereClause = sqlParts.join(' OR ');
  if (!whereClause.trim()) {
      whereClause = "1=1";
  }

  return { whereClause, params, limit };
};


export { getEventsDB, storeEvent, initEventsDB };