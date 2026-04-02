import { Client } from "minio";

let client: Client | null = null;

export function getMinioClient(): Client {
  if (!client) {
    client = new Client({
      endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
      port: parseInt(process.env.MINIO_PORT ?? "9000", 10),
      useSSL: false,
      accessKey: process.env.MINIO_ACCESS_KEY ?? "watchpost",
      secretKey: process.env.MINIO_SECRET_KEY ?? "changeme-minio-secret",
    });
  }
  return client;
}

const BUCKET = process.env.MINIO_BUCKET ?? "watchpost";

export async function ensureBucket(): Promise<void> {
  const mc = getMinioClient();
  const exists = await mc.bucketExists(BUCKET);
  if (!exists) {
    await mc.makeBucket(BUCKET);
  }
}

export async function uploadBuffer(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const mc = getMinioClient();
  await mc.putObject(BUCKET, key, buffer, buffer.length, {
    "Content-Type": contentType,
  });
  return key;
}

export async function getPresignedUrl(
  key: string,
  expirySeconds = 3600
): Promise<string> {
  const mc = getMinioClient();
  return mc.presignedGetObject(BUCKET, key, expirySeconds);
}
