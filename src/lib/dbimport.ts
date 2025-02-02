// TESTING FILE. For importing CSV files into the database.
// DO NOT USE IN PRODUCTION.

import * as fs from "fs";
import * as csv from "fast-csv";
import { dbUpsert, dbInsert } from "./database.js"; 
import { logger } from "./logger.js";

const importCSV = async (filePath: string) => {
  const stream = fs.createReadStream(filePath);
  const csvParser = csv.parse({ headers: true, trim: true, escape: '"' });

  let processedCount = 0;

  for await (const row of stream.pipe(csvParser)) {
    try {
      const eventId = row["event_id"].replace("\\x", "");
      const pubkey = row["event_pubkey"].replace("\\x", "");
      const kind = parseInt(row["event_kind"], 10);
      const createdAt = parseInt(row["event_created_at"], 10);
      const content = row["event_content"] || "";
      const sig = row["event_signature"].replace("\\x", "");
      const receivedAt = Math.floor(Date.now() / 1000);

      const eventData = {
        event_id: eventId,
        pubkey: pubkey,
        kind: kind,
        created_at: createdAt,
        content: content,
        sig: sig,
        received_at: receivedAt,
      };

      const eventUpsert = await dbUpsert("events", eventData);
      if (eventUpsert === 0) {
        logger.error(`Error inserting or updating event in DB: ${eventId}`);
        continue;
      }

      if (row["event_tags"]) {
        try {
            let cleanTags = row["event_tags"].replace(/\\x/g, "").trim(); 
            const parsedTags = JSON.parse(cleanTags).map((tag: any[]) => tag.filter(item => item.trim() !== "")) 
                .filter((tag: any[]) => Array.isArray(tag) && tag.length >= 2);
            let position = 0;
            for (const tag of parsedTags) {
                await dbInsert("eventtags", ["event_id", "tag_name", "tag_value", "position", "extra_values"], [
                eventId,
                tag[0],
                tag[1],
                position,
                tag.slice(2).length ? JSON.stringify(tag.slice(2)) : null,
                ]);
                position++;
            }
        } catch (error) {
          logger.error(`Error processing tags for event ${eventId}:`, error);
        }
      }
      processedCount++;
      if (processedCount % 1000 === 0) {
        logger.info(`${processedCount} processed events...`);
      }
    } catch (error) {
      logger.error(`Error processing event:`, error);
    }
  }
  logger.info(`Imported ${processedCount} events from CSV file.`);
};

export { importCSV };