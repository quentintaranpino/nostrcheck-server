import { BlobDescriptor } from "../../interfaces/blossom.js";
import { FileData } from "../../interfaces/media.js";
import { getMimeType } from "../media.js";
import { PrepareNIP94_event } from "../nostr/NIP94.js";

// NIP-94 tags returned in the descriptor (BUD-08). Our own extras stay out.
const NIP94_TAGS = new Set(["url", "m", "x", "ox", "size", "dim", "magnet", "blurhash"]);

// https://github.com/hzrd149/blossom/blob/master/buds/02.md

const prepareBlobDescriptor = async (filedata : FileData): Promise<BlobDescriptor> => {

    // Descriptor must describe served bytes, not the input.
    const event : BlobDescriptor = {

        status: filedata.status,
        message: filedata.description,
        url: filedata.url,
        sha256: filedata.hash || filedata.originalhash,
        size: filedata.filesize,
        type: filedata.mimetype || filedata.originalmime || (await getMimeType(filedata.filename.split('.').pop() || '')) || '',
        uploaded: filedata.date,
        blurhash: filedata.blurhash,
        dim: filedata.width + "x" + filedata.height,
        payment_request: filedata.payment_request,
        visibility: filedata.visibility,
        nsfw: filedata.nsfw,
        nip94: (await PrepareNIP94_event(filedata)).tags.filter(tag => NIP94_TAGS.has(tag[0]) && tag[1] && tag[1] != "0x0"),
    }

    return event;

}

export { prepareBlobDescriptor };