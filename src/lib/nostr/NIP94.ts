
import { FileData, ProcessingFileData, mediaTypes } from "../../interfaces/media.js";
import { NIPKinds } from "../../interfaces/nostr.js";
import { NIP94_event } from "../../interfaces/nostr.js";

//https://github.com/nostr-protocol/nips/blob/master/94.md


const PrepareNIP94_event = async (filedata : FileData): Promise<NIP94_event> => {

        let event : NIP94_event = {
                id : "",
                pubkey: filedata.pubkey,
                created_at: Math.floor(Date.now() / 1000).toString(),
                kind: NIPKinds.NIP94,
                tags: [
                        ["url", filedata.url],
                        ["m", mediaTypes[filedata.filename.split('.').pop() || '']],
                        ["x", filedata.hash],
                        ["ox", filedata.originalhash],
                        ["size", "TODO"], //TODO
                        ["dim",filedata.width + "x" + filedata.height],
                        ["magnet", filedata.magnet],
                        ["i", filedata.torrent_infohash],
                        ["blurhash", filedata.blurhash]
                ],              
                content: '',
                sig : "",
        }

        return event;

}

export { PrepareNIP94_event }





