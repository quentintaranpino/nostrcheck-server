import WebTorrent  from 'webtorrent'
import { logger } from './logger.js';
import config from 'config';

const PublishTorrent = (filepath:string) => {

const client =  new WebTorrent({
  // @ts-ignore missing from typedef
  // torrentPort: config.get('torrent.torrentPort'),
  // dhtPort: config.get('torrent.dhtPort'),
});

client
  .seed(filepath, function (torrent) {

      logger.info('Client is seeding:', torrent.magnetURI)
      logger.info('Torrent info hash:', torrent.infoHash)
      logger.info('Torrent announce-list:', torrent.announce)
    })

  .on('error', function (err) {
    logger.error(err)
  })

  
}
export { PublishTorrent }

