import { blobDescriptor } from "../../interfaces/blossom.js";
import { mediaTypes, ProcessingFileData } from "../../interfaces/media.js";

const prepareBlobDescriptor = async (filedata : ProcessingFileData): Promise<blobDescriptor> => {

    const event : blobDescriptor = {

        status: filedata.status,
        message: filedata.description,
        url: filedata.url,
        sha256: filedata.hash,
        size: filedata.filesize,
        type: mediaTypes[filedata.filename.split('.').pop() || ''],
        uploaded: Math.floor(filedata.date / 1000)
    }

    return event;

}

export { prepareBlobDescriptor };