import config from "config";
import {allowedMimeTypes} from "../../interfaces/media.js";
import {NIP96file} from "../../interfaces/nostr.js";


const GetNIP96file = (hostname : string): NIP96file => {

    let nip96file = {
    
        "api_url": "https://" + hostname + "/api/v1/media",
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
              "image_transformations": ["resizing"]
            }
        }
    };

    return nip96file;

}


export {GetNIP96file};