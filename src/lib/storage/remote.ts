import fs from 'fs';
import { S3Client, S3ClientConfig, PutObjectCommand } from "@aws-sdk/client-s3";
import { ProcessingFileData, mime_conversion } from '../../interfaces/media.js';
import { logger } from '../logger.js';
import app from '../../app.js';

const s3Config: S3ClientConfig = {

  endpoint: app.get("config.storage")["remote"]["endpoint"] ,
  credentials: {
    accessKeyId: app.get("config.storage")["remote"]["accessKeyId"],
    secretAccessKey: app.get("config.storage")["remote"]["secretAccessKey"],
  },
  region: app.get("config.storage")["remote"]["region"],
  forcePathStyle: app.get("config.storage")["remote"]["s3ForcePathStyle"],
};

const s3Client = new S3Client(s3Config);

const saveFileS3 = async (filePath: string, filedata:ProcessingFileData): Promise<string> => {

  const bucketName :string = app.get("config.storage")["remote"]["bucketName"];

  const params = {
    Bucket: bucketName,
    Key: filedata.filename,
    Body: fs.readFileSync(filePath),
    ContentType : mime_conversion[filedata.originalmime],
  };

  logger.debug(params.ContentType)
  try {
    await s3Client.send(new PutObjectCommand(params));
    const fileUrl = `${app.get("config.storage")["remote"]["endpoint"]}/${params.Bucket}/${params.Key}`;
    logger.info(`Successfully uploaded file to ${fileUrl}`);
    return fileUrl;
  } catch (error) {
      logger.error(`Error uploading file: ${error}`);
  }
return "";
}

export { saveFileS3 };