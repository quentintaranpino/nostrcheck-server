
import { FileData } from "../../interfaces/media.js";
import { NIPKinds } from "../../interfaces/nostr.js";
import { NIP94_event } from "../../interfaces/nostr.js";
import { getMimeType } from "../media.js";

//https://github.com/nostr-protocol/nips/blob/master/94.md

const PrepareNIP94_event = async (filedata : FileData): Promise<NIP94_event> => {

        const event : NIP94_event = {
                id : "",
                pubkey: filedata.pubkey,
                created_at: filedata.date,
                kind: NIPKinds.NIP94,
                tags: [
                        ["url", filedata.url],
                        ["m", filedata.originalmime != '' ? filedata.originalmime : await getMimeType(filedata.filename.split('.').pop() || '') || ''],
                        ["x", filedata.no_transform == true ? filedata.originalhash : filedata.hash],
                        ["ox", filedata.originalhash],
                        ["size", filedata.filesize ? filedata.filesize.toString() : "0"],
                        ["dim", filedata.width != 0 && filedata.height != 0 ? `${filedata.width}x${filedata.height}` : "0x0"],
                        ["magnet", filedata.magnet],
                        ["blurhash", filedata.blurhash],
                        ["no_transform", filedata.no_transform.valueOf().toString() ],
                        ["payment_request", filedata.payment_request],
                        ["visibility", filedata.visibility.valueOf().toString() ],
                ],              
                content: '',
                sig : "",
        }

        return event;

}

export { PrepareNIP94_event }





