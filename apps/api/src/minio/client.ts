import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = process.env.MINIO_BUCKET ?? "watchpost";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
    client = new S3Client({
      endpoint: endpoint.startsWith("http") ? endpoint : `http://${endpoint}`,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? "watchpost",
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? "changeme-minio-secret",
      },
    });
  }
  return client;
}

/** Upload a buffer to MinIO, returns the object key. */
export async function uploadBuffer(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  return key;
}

/** Generate a presigned GET URL with 1-hour expiry. */
export async function getPresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(getClient(), command, { expiresIn: 3600 });
}
