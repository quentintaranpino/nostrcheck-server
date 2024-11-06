import { blobDescriptor } from "../../interfaces/blossom.js";
import { fileData } from "../../interfaces/media.js";
import { getMimeFromExtension } from "../media.js";

// https://github.com/hzrd149/blossom/blob/master/buds/02.md

const prepareBlobDescriptor = async (filedata : fileData): Promise<blobDescriptor> => {

    const event : blobDescriptor = {

        status: filedata.status,
        message: filedata.description,
        url: filedata.url,
        sha256: filedata.originalhash,
        size: filedata.filesize,
        type: filedata.originalmime != '' ? filedata.originalmime : getMimeFromExtension(filedata.filename.split('.').pop() || '') || '',
        uploaded: filedata.date,
        blurhash: filedata.blurhash,
        dim: filedata.width + "x" + filedata.height,
        payment_request: filedata.payment_request,
        visibility: filedata.visibility
    }

    return event;

}

export { prepareBlobDescriptor };