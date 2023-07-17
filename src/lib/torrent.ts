import WebTorrent  from 'webtorrent'
import fs from 'fs'
import { logger } from './logger.js';

const PublishTorrent = (filepath:string) => {

const WebTorrentClient = new WebTorrent()

const torrentSeedingOptions: WebTorrent.TorrentOptions = {

  announce: [
              'udp://tracker.opentrackr.org:1337/announce',
              'https://tracker2.ctix.cn:443/announce',
              'https://tracker1.520.jp:443/announce',
              'udp://opentracker.i2p.rocks:6969/announce',
              'http://tracker.openbittorrent.com:80/announce',
              'udp://open.stealth.si:80/announce',
              'udp://exodus.desync.com:6969/announce',
              'udp://tracker.torrent.eu.org:451/announce',
              'udp://tracker.moeking.me:6969/announce',
              'udp://uploads.gamecoast.net:6969/announce',
              'udp://tracker1.bt.moack.co.kr:80/announce',
              'udp://tracker.theoks.net:6969/announce',
              'udp://p4p.arenabg.com:1337/announce',
              'udp://movies.zsw.ca:6969/announce',
              'udp://htz3.noho.st:6969/announce',
              'udp://explodie.org:6969/announce',
              'https://tracker.tamersunion.org:443/announce',
              'https://tracker.moeblog.cn:443/announce',
              'https://tr.burnabyhighstar.com:443/announce',
              'http://open.acgnxtracker.com:80/announce',

            ],

  }

WebTorrentClient.seed(filepath,torrentSeedingOptions, function (torrent) {

    logger.info('Client is seeding:', torrent.magnetURI)
    logger.info('Torrent info hash:', torrent.infoHash)
    logger.info('Torrent announce-list:', torrent.announce)
    
  })

  WebTorrentClient.on('error', function (err) {
    logger.error(err)
  })

  // WebTorrentClient.on('torrent', function (torrent) {
  //   logger.info('Client is downloading:', torrent.infoHash)
  //   logger.info('Torrent info hash:', torrent.infoHash)
  //   logger.info('Torrent announce-list:', torrent.announce)
  //   logger.info('Torrent magnet URI:', torrent.magnetURI)
  //   logger.info('Torrent time remaining:', torrent.timeRemaining)
  //   logger.info('Torrent received:', torrent.received)
  //   logger.info('Torrent uploaded:', torrent.uploaded)
  //   logger.info('Torrent download speed:', torrent.downloadSpeed)
  //   logger.info('Torrent upload speed:', torrent.uploadSpeed)
  //   logger.info('Torrent progress:', torrent.progress)
  //   logger.info('Torrent ratio:', torrent.ratio)
  //   logger.info('Torrent numPeers:', torrent.numPeers)
  // })

}
export { PublishTorrent }

