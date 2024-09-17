import config from "config";
import {fileData } from "../../interfaces/media.js";
import {NIP94_data, NIP96_event, NIP96file} from "../../interfaces/nostr.js";
import { PrepareNIP94_event } from "./NIP94.js";
import { getAllowedMimeTypes, getMimeFromExtension } from "../media.js";

//https://github.com/nostr-protocol/nips/blob/master/96.md

const getNIP96file = (hostname : string): NIP96file => {

    const nip96file : NIP96file= {
    
        "api_url": "https://" + hostname + "/api/v2/media",
        "download_url": "https://" + hostname + "/media",
        "supported_nips": [1,4,5,78,94,96,98],
        "tos_url": "https://" + hostname + "/api/v2/tos/",
        "content_types": getAllowedMimeTypes(),
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

const PrepareNIP96_event = async (filedata : fileData): Promise<NIP96_event> => {

    const event: NIP96_event = {
        status: filedata.status,
        message: filedata.description,
        processing_url: filedata.processing_url,
        payment_request: filedata.payment_request,
        nip94_event: await PrepareNIP94_event(filedata)
    }

    return event;
}

const PrepareNIP96_listEvent = async (filedata : fileData): Promise<NIP94_data> => {

    const event : NIP94_data = {
            tags: [
                    ["url", filedata.url],
                    ["m", filedata.originalmime != '' ? filedata.originalmime : getMimeFromExtension(filedata.filename.split('.').pop() || '') || ''],
                    ["x", filedata.hash],
                    ["ox", filedata.originalhash],
                    ["size", filedata.filesize?.toString()],
                    ["dim",filedata.width + "x" + filedata.height],
                    ["magnet", filedata.magnet],
                    ["i", filedata.torrent_infohash],
                    ["blurhash", filedata.blurhash],
                    ["no_transform", filedata.no_transform.valueOf().toString() ]
            ],              
            content: '',
            created_at: Number(new Date(filedata.date).getTime() / 1000),}

    return event;

}

export {getNIP96file, PrepareNIP96_event, PrepareNIP96_listEvent}; 