
import { fileData } from "../../interfaces/media.js";
import { NIPKinds } from "../../interfaces/nostr.js";
import { NIP94_event } from "../../interfaces/nostr.js";
import { getMimeFromExtension } from "../media.js";

//https://github.com/nostr-protocol/nips/blob/master/94.md

const PrepareNIP94_event = async (filedata : fileData): Promise<NIP94_event> => {

        const event : NIP94_event = {
                id : "",
                pubkey: filedata.pubkey,
                created_at: filedata.date,
                kind: NIPKinds.NIP94,
                tags: [
                        ["url", filedata.url],
                        ["m", filedata.originalmime != '' ? filedata.originalmime : getMimeFromExtension(filedata.filename.split('.').pop() || '') || ''],
                        ["x", filedata.no_transform == true ? filedata.originalhash : filedata.hash],
                        ["ox", filedata.originalhash],
                        ["size", filedata.processing_url == "" ? filedata.filesize? filedata.filesize.toString() : "" : ""],
                        ["dim",filedata.processing_url == "" ? filedata.width != 0 && filedata.height != 0? filedata.width + "x" + filedata.height : "" : ""],
                        ["magnet", filedata.magnet],
                        ["i", filedata.torrent_infohash],
                        ["blurhash", filedata.blurhash],
                        ["no_transform", filedata.no_transform.valueOf().toString() ],
                        ["payment_request", filedata.payment_request],
                ],              
                content: '',
                sig : "",
        }

        return event;

}

export { PrepareNIP94_event }





