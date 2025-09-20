import {FileData } from "../../interfaces/media.js";
import {NIP94_data, NIP96_event, NIP96file, supported_nips} from "../../interfaces/nostr.js";
import { PrepareNIP94_event } from "./NIP94.js";
import { getAllowedMimeTypes, getMediaUrl, getMimeType } from "../media.js";
import { getHostInfo } from "../utils.js";
import { getConfig } from "../config/core.js";

//https://github.com/nostr-protocol/nips/blob/master/96.md

const getNIP96file = async (domain: string): Promise<NIP96file> => {

    const nip96file : NIP96file= {
    
        "api_url": `${getMediaUrl("NIP96", domain)}`,
        "supported_nips": supported_nips,
        "tos_url": `${getHostInfo(domain).url}/tos/`,
        "content_types": await getAllowedMimeTypes(),
        "plans": {
            "free": {
              "name": "Free Tier",
              "is_nip98_required": true,
              "url": "",
              "max_byte_size": Number(getConfig(domain, ["media", "maxMBfilesize"])) * 1024 * 1024,
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

const PrepareNIP96_event = async (filedata : FileData): Promise<NIP96_event> => {

    const event: NIP96_event = {
        status: filedata.status,
        message: filedata.description,
        processing_url: filedata.processing_url,
        payment_request: filedata.payment_request,
        nip94_event: await PrepareNIP94_event(filedata)
    }

    return event;
}

const PrepareNIP96_listEvent = async (filedata : FileData): Promise<NIP94_data> => {

    const event : NIP94_data = {
            tags: [
                    ["url", filedata.url],
                    ["m", filedata.originalmime != '' ? filedata.originalmime : await getMimeType(filedata.filename.split('.').pop() || '') || ''],
                    ["x", filedata.hash],
                    ["ox", filedata.originalhash],
                    ["size", filedata.filesize?.toString()],
                    ["dim",filedata.width + "x" + filedata.height],
                    ["magnet", filedata.magnet],
                    ["blurhash", filedata.blurhash],
                    ["no_transform", filedata.no_transform.valueOf().toString() ],
                    ["payment_request", filedata.payment_request],
                    ["visibility", filedata.visibility.valueOf().toString()],
            ],              
            content: '',
            created_at: Number(filedata.date),}

    return event;

}

export {getNIP96file, PrepareNIP96_event, PrepareNIP96_listEvent}; 