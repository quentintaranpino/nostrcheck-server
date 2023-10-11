import config from "config";
import {ProcessingFileData, allowedMimeTypes} from "../../interfaces/media.js";
import {NIP96_event, NIP96file} from "../../interfaces/nostr.js";
import { PrepareNIP94_event } from "./NIP94.js";

//https://github.com/nostr-protocol/nips/blob/master/96.md

const GetNIP96file = (hostname : string): NIP96file => {

    let nip96file = {
    
        "api_url": "https://" + hostname + "/api/v2/media",
        "download_url": "https://" + hostname + "/media",
        "supported_nips": ["NIP-94", "NIP-98","NIP-96"],
        "tos_url": config.get("media.tosURL") as string,
        "content_types": allowedMimeTypes,
        "plans": {
            "free": {
              "name": "Free Tier",
              "is_nip98_required": false,
              "url": "",
              "max_byte_size": Number(config.get("media.maxMBfilesize"))*1024*1024,
              "file_expiration": [0, 0],
              "image_transformations": ["resizing", "format_conversion", "compression"]
            }
        }
    };

    return nip96file;

}

const PrepareNIP96_event = async (filedata : ProcessingFileData): Promise<NIP96_event> => {

    let event: NIP96_event = {
        status: filedata.status,
        message: filedata.description,
        processing_url: filedata.servername + "/api/v2/media/" + filedata.fileid,
        nip94_event: await PrepareNIP94_event(filedata)
    }

    return event;
}

export {GetNIP96file, PrepareNIP96_event}; 