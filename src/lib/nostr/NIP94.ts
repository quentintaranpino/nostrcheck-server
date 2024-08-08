
import { ProcessingFileData } from "../../interfaces/media.js";
import { NIPKinds } from "../../interfaces/nostr.js";
import { NIP94_event } from "../../interfaces/nostr.js";
import { getMimeFromExtension } from "../media.js";

//https://github.com/nostr-protocol/nips/blob/master/94.md

const PrepareNIP94_event = async (filedata : ProcessingFileData): Promise<NIP94_event> => {

        const event : NIP94_event = {
                id : "",
                pubkey: filedata.pubkey,
                created_at: filedata.date,
                kind: NIPKinds.NIP94,
                tags: [
                        ["url", filedata.url],
                        ["m", getMimeFromExtension(filedata.filename.split('.').pop() || '') || ''],
                        ["x", filedata.no_transform == true ? filedata.originalhash : filedata.hash],
                        ["ox", filedata.originalhash],
                        ["size", filedata.no_transform == true ? filedata.filesize? filedata.filesize.toString() : "" : ""],
                        ["dim", filedata.no_transform == true ? filedata.width + "x" + filedata.height : ""],
                        ["magnet", filedata.magnet],
                        ["i", filedata.torrent_infohash],
                        ["blurhash", filedata.blurhash],
                        ["no_transform", filedata.no_transform.valueOf().toString() ]
                ],              
                content: '',
                sig : "",
        }

        return event;

}

export { PrepareNIP94_event }





