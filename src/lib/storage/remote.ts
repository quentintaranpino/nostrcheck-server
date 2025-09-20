import fs from 'fs';
import { S3Client, S3ClientConfig, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FileData } from '../../interfaces/media.js';
import { logger } from '../logger.js';
import { getMimeType } from '../media.js';
import { getConfig } from '../config/core.js';

const s3Config: S3ClientConfig = {
  endpoint: getConfig(null, ["storage", "remote", "endpoint"]),
  credentials: {
    accessKeyId: getConfig(null, ["storage", "remote", "accessKeyId"]),
    secretAccessKey: getConfig(null, ["storage", "remote", "secretAccessKey"]),
  },
  region: getConfig(null, ["storage", "remote", "region"]),
  forcePathStyle: getConfig(null, ["storage", "remote", "s3ForcePathStyle"]),
};

const s3Client = new S3Client(s3Config);

const saveRemoteFile = async (filePath: string, filedata:FileData): Promise<boolean> => {

  const bucketName : string = getConfig(null, ["storage", "remote", "bucketName"]);

  const params = {
    Bucket: bucketName,
    Key: filedata.filename,
    Body: fs.readFileSync(filePath),
    ContentType : await getMimeType(filedata.originalmime,true),
  };

  try {
    await s3Client.send(new PutObjectCommand(params));
    const fileUrl = `${getConfig(null, ["storage", "remote", "endpoint"])}/${params.Bucket}/${params.Key}`;
          logger.info(`saveRemoteFile - Successfully uploaded file to ${fileUrl}`);
    return true;
  } catch (error) {
    logger.error(`saveRemoteFile - Error uploading file: ${filedata.filename} to remote server: ${getConfig(null, ["storage","remote", "endpoint"])}/${bucketName} with error: ${error}`);
  }

  return false;
}

const getRemoteFile = async (filename: string): Promise<string> => {
  
  const bucketName : string = getConfig(null, ["storage", "remote", "bucketName"]);

  const params = {
    Bucket: bucketName,
    Key: filename,
  };

  try {
    await s3Client.send(new HeadObjectCommand(params));
  } catch (error) {
    logger.error(`getRemoteFile - File does not exist: ${error}`);
    return "";
  }

  try {
    const url = await getSignedUrl(s3Client, new GetObjectCommand(params), { expiresIn: 60 });
    return url;
  } catch (error) {
    logger.error(`getRemoteFile - Error generating signed URL: ${error}`);
  }

  return "";
}

const deleteRemoteFile = async (filename: string): Promise<boolean> => {
    
  const bucketName : string = getConfig(null, ["storage", "remote", "bucketName"]);

  const params = {
    Bucket: bucketName,
    Key: filename,
  };

  try {
    await s3Client.send(new DeleteObjectCommand(params));
    logger.debug(`deleteRemoteFile - Successfully deleted file from remote storage server: ${filename}`);
    return true;
  } catch (error) {
    logger.error(`deleteRemoteFile - Error deleting file from remote server: ${error}`);
  }

  return false;
}

export { saveRemoteFile, getRemoteFile, deleteRemoteFile };