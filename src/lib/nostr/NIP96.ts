import config from "config";
import {ProcessingFileData, allowedMimeTypes} from "../../interfaces/media.js";
import {NIP96_event, NIP96file} from "../../interfaces/nostr.js";
import { PrepareNIP94_event } from "./NIP94.js";
import { getTOSUrl } from "../server.js";

//https://github.com/nostr-protocol/nips/blob/master/96.md

const getNIP96file = (hostname : string): NIP96file => {

    let nip96file : NIP96file= {
    
        "api_url": "https://" + hostname + "/api/v2/media",
        "download_url": "https://" + hostname + "/media",
        "supported_nips": [1,78,94,96,98,],
        "tos_url": getTOSUrl(hostname),
        "content_types": allowedMimeTypes,
        "plans": {
            "free": {
              "name": "Free Tier",
              "is_nip98_required": true,
              "url": "",
              "max_byte_size": Number(config.get("media.maxMBfilesize"))*1024*1024,
              "file_expiration": [0, 0],
              media_transformations: {
                "image": ["resizing", "format_conversion", "compression", "metadata_stripping"],
                "video": ["resizing", "format_conversion", "compression", "metadata_stripping"]
                }
            }
        }
    };

    return nip96file;

}

const PrepareNIP96_event = async (filedata : ProcessingFileData): Promise<NIP96_event> => {

    let event: NIP96_event = {
        status: filedata.status,
        message: filedata.description,
        processing_url: filedata.processing_url,
        nip94_event: await PrepareNIP94_event(filedata)
    }

    return event;
}

export {getNIP96file, PrepareNIP96_event}; 