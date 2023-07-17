import WebTorrent  from 'webtorrent'
import { logger } from './logger.js';

const PublishTorrent = (filepath:string) => {

const client =  new WebTorrent({
  // @ts-ignore missing from typedef
  torrentPort: 6881, // Default: 6881
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

