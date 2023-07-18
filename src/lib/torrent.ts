import WebTorrent  from "webtorrent";
import { logger } from './logger.js';
import config from 'config';

const client =  new WebTorrent({
  // @ts-ignore missing from typedef
  torrentPort: config.get('torrent.torrentPort'),
  dhtPort: config.get('torrent.dhtPort'),
});

const CreateMagnet = (filepath:string) : Promise<string> => {

   client
    .seed(filepath, function (torrent: WebTorrent.Torrent) {

      logger.info('Generated magnet for file:', filepath);
      // logger.info( "Magnet:", torrent.magnetURI);
       logger.info('Torrent info hash:', torrent.infoHash)
      // logger.info('Torrent announce-list:', torrent.announce)
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

}

export { CreateMagnet }

