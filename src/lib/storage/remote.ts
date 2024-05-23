import fs from 'fs';
import path from 'path';
import config from "config";
import AWS from 'aws-sdk';

function initializeS3(): AWS.S3 {
  return new AWS.S3({
    endpoint: config.get("storage.remote.endpoint"),
    accessKeyId: config.get("storage.remote.accessKeyId"),
    secretAccessKey: config.get("storage.remote.secretAccessKey"),
    region: config.get("storage.remote.region"),
    s3ForcePathStyle: config.get("storage.remote.s3ForcePathStyle"),
    signatureVersion: config.get("storage.remote.signatureVersion"),
  });
}

const saveFileS3 = async (filePath: string): Promise<string> => {

  const s3 = initializeS3();
  const bucketName = 'test'; 
  const fileKey = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath);

  const params = {
    Bucket: bucketName,
    Key: fileKey,
    Body: fileContent,
    ContentType : 'image/webp', //TESTING TODO MIME
  };

  try {
        const result = await s3.upload(params).promise();
        const fileUrl = `${config.get("storage.remote.endpoint")}/${bucketName}/${fileKey}`;
        console.log(`Archivo subido exitosamente a ${fileUrl}`);
        return fileUrl;
  } catch (error) {
        console.error(`Error subiendo archivo: ${error}`);
  }
  return "";
}

export { saveFileS3 };