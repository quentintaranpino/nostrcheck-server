import fs from 'fs';
import config from "config";
import { S3Client, S3ClientConfig, PutObjectCommand } from "@aws-sdk/client-s3";
import { ProcessingFileData, mime_conversion } from '../../interfaces/media.js';
import { logger } from '../logger.js';

const s3Config: S3ClientConfig = {
  endpoint: config.get("storage.remote.endpoint"),
  credentials: {
    accessKeyId: config.get("storage.remote.accessKeyId"),
    secretAccessKey: config.get("storage.remote.secretAccessKey"),
  },
  region: config.get("storage.remote.region"),
  forcePathStyle: config.get("storage.remote.s3ForcePathStyle"),
};

const s3Client = new S3Client(s3Config);

const saveFileS3 = async (filePath: string, filedata:ProcessingFileData): Promise<string> => {

  const bucketName :string = config.get("storage.remote.bucketName");

  const params = {
    Bucket: bucketName,
    Key: filedata.filename,
    Body: fs.readFileSync(filePath),
    ContentType : mime_conversion[filedata.originalmime],
  };

  logger.debug(params.ContentType)
  try {
    await s3Client.send(new PutObjectCommand(params));
    const fileUrl = `${config.get("storage.remote.endpoint")}/${params.Bucket}/${params.Key}`;
    logger.info(`Successfully uploaded file to ${fileUrl}`);
    return fileUrl;
  } catch (error) {
      logger.error(`Error uploading file: ${error}`);
  }
return "";
}

export { saveFileS3 };