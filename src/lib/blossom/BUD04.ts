// https://github.com/hzrd149/blossom/blob/master/buds/04.md

import { Readable } from "stream";
import { logger } from "../logger.js";

const mirrorFile = async (url: string): Promise<Express.Multer.File | null> => {
    if (url === "") {
        return null;
    }

    const filename = url.split('/').pop() || '';

    try {
        const response = await fetch(url);

        if (!response.ok) {
            logger.error(`Error fetching file: ${response.statusText}`);
            return null;
        }

        const blob = await response.blob();
        const buffer = Buffer.from(await blob.arrayBuffer());

        const file: Express.Multer.File = {
            fieldname: 'file', 
            originalname: filename,
            encoding: 'binary',
            mimetype: blob.type,
            buffer: buffer,
            size: buffer.length,
            stream: Readable.from(buffer),
            destination: '', 
            filename: filename,
            path: '', 
        };

        return file;

    } catch (err) {
        logger.error(`Error mirroring file: ${err}`);
        return null;
    }
};

export { mirrorFile };