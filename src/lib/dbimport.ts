// TESTING FILE. For importing CSV files into the database.
// DO NOT USE IN PRODUCTION.

import * as fs from "fs";
import * as csv from "fast-csv";
import { dbUpsert, dbInsert, dbMultiSelect } from "./database.js"; 
import { logger } from "./logger.js";

const importCSV = async (filePath: string) => {
  const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
  
  const csvParser = csv
    .parse({ headers: true, trim: true, escape: '"' })
    .on("data-invalid", (_, error) => {
      logger.error(`inportCSV: Invalid CSV row: ${error}`);
    })
    .on("error", (error) => {
      logger.error(`inportCSV: Error parsing CSV: ${error}`);
    });

  let processedCount = 0;
  const BATCH_SIZE = 10000;
  let batch: any[] = [];

  const dbEvents = await dbMultiSelect(["event_id"], "events", "active = ?", [1]);
  const dbEventsMap = new Map<string, boolean>();
  dbEvents.forEach((event) => {
    dbEventsMap.set(event["event_id"].replace("\\x", ""), true);
  });

  const csvStream = stream.pipe(csvParser);

  try {
    for await (const row of csvStream) {
      batch.push(row);
      if (batch.length >= BATCH_SIZE) {
        await processBatch(batch, dbEventsMap);
        processedCount += batch.length;
        if (processedCount % 1000 === 0) {
          logger.info(`importCSV: ${processedCount} processed events...`);
        }
        batch = [];
      }
    }
  } catch (error) {
    logger.error(`importCSV - Stream CSV error: ${error}`);
  }

  if (batch.length > 0) {
    await processBatch(batch, dbEventsMap);
    processedCount += batch.length;
  }

  logger.info(`importCSV - Total processed events: ${processedCount}`);
};

async function processBatch(batch: any[], dbEventsMap: Map<string, boolean>) {
  await Promise.all(
    batch.map(async (row) => {
      try {
        const rawEventId = row["event_id"];
        if (!rawEventId) return; 
        const eventId = rawEventId.replace("\\x", "");

        if (dbEventsMap.has(eventId)) {
          return;
        }

        const pubkey = row["event_pubkey"] ? row["event_pubkey"].replace("\\x", "") : "";
        const kind = parseInt(row["event_kind"], 10);
        const createdAt = parseInt(row["event_created_at"], 10);
        const content = row["event_content"] || "";
        const sig = row["event_signature"] ? row["event_signature"].replace("\\x", "") : "";
        const receivedAt = Math.floor(Date.now() / 1000);

        const eventData = {
          event_id: eventId,
          pubkey,
          kind,
          created_at: createdAt,
          content,
          sig,
          received_at: receivedAt,
        };

        const eventUpsert = await dbUpsert("events", eventData);
        if (eventUpsert === 0) {
          logger.error(`prcessBatch - Error upserting event ${eventId}`);
          return;
        }

        if (row["event_tags"]) {
          try {
            const cleanTags = row["event_tags"].replace(/\\x/g, "").trim();
            const parsedTags = JSON.parse(cleanTags)
              .map((tag: any[]) => tag.filter((item) => item.trim() !== ""))
              .filter((tag: any[]) => Array.isArray(tag) && tag.length >= 2);

            let position = 0;
            for (const tag of parsedTags) {
              await dbInsert(
                "eventtags",
                ["event_id", "tag_name", "tag_value", "position", "extra_values"],
                [
                  eventId,
                  tag[0],
                  tag[1],
                  position,
                  tag.slice(2).length ? JSON.stringify(tag.slice(2)) : null,
                ]
              );
              position++;
            }
          } catch (error) {
            logger.error(`processBatch - Error processing tags for event ${eventId}:`, error);
          }
        }
      } catch (error) {
        logger.error(`processBatch - Error processing event:`, error);
      }
    })
  );
}

export { importCSV };
