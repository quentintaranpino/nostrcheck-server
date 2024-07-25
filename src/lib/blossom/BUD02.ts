import { blobDescriptor } from "../../interfaces/blossom.js";
import { mediaTypes, ProcessingFileData } from "../../interfaces/media.js";

const prepareBlobDescriptor = async (filedata : ProcessingFileData): Promise<blobDescriptor> => {

    const event : blobDescriptor = {

        status: filedata.status,
        message: filedata.description,
        url: filedata.url,
        sha256: filedata.originalhash,
        size: filedata.filesize,
        type: mediaTypes[filedata.filename.split('.').pop() || ''],
        uploaded: filedata.date,
        blurhash: filedata.blurhash,
        dim: filedata.width + "x" + filedata.height
        }

    return event;

}

export { prepareBlobDescriptor };