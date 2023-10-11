import WebTorrent  from "webtorrent";
import { logger } from './logger.js';
import config from 'config';
import fs from "fs";
import { connect } from "./database.js";
import { RowDataPacket } from "mysql2";

const client =  new WebTorrent({
  // @ts-ignore missing from typedef
  torrentPort: config.get('torrent.torrentPort'),
  dhtPort: config.get('torrent.dhtPort'),
});

const SeedMediafilesMagnets = async () => {

  //Retrieve magnet links from database
  let result;
  try{
    const conn = await connect("SeedMediafilesMagnets");
    const [dbFileMagnet] = await conn.execute(
      "SELECT DISTINCT " + 
              "filename, "+ 
              "username " + 
        "FROM mediafiles " + 
        "INNER JOIN registered on mediafiles.pubkey = registered.hex " + 
        "WHERE " + 
              "mediafiles.magnet is not null and " + 
              "mediafiles.filename not like ('%avatar%' or '%banner%')");
    if (!dbFileMagnet) {
      conn.end();
      return "";
    }
    result = JSON.parse(JSON.stringify(dbFileMagnet));
    conn.end();
    }catch (error) {
      logger.error("Error getting magnet links from mediafiles table", error);
    return "";
    }

  //Loop through results and seed each magnet link  
  let filenames: string[] = [];
  result.forEach((element: RowDataPacket) => {
    if (filenames.includes(element.filename)) return;
    filenames.push(element.filename);
    const MediaPath = config.get("media.mediaPath") + element.username + "/" + element.filename;
    try{
        fs.accessSync(MediaPath, fs.constants.R_OK); //check if file exists and is readable
        client.seed(MediaPath);
      }catch (error) {
        logger.error("error seeding magnet for file", MediaPath);
      }
    }
  );
}

const CreateMagnet = (filepath:string) : Promise<string> => {

  try {
    fs.accessSync(filepath, fs.constants.R_OK); //check if file exists and is readable

   client
    .seed(filepath, function (torrent: WebTorrent.Torrent) {

      logger.info('Generated magnet for file:', filepath);
      logger.info('Torrent info hash:', torrent.infoHash)
    })

    return new Promise((resolve, reject) => {
      client.on('torrent', function (torrent: WebTorrent.Torrent) {
        resolve(torrent.magnetURI);
      });
      client.on('error', function (err: any) {
        logger.error("error creating magnet for file", filepath);
        reject(err);
      });
    }
    );

  } catch (err) {
    logger.error("error creating magnet for file", filepath);
    return Promise.reject(err);
  }

}

export { SeedMediafilesMagnets, CreateMagnet }

