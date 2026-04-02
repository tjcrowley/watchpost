import Redis from "ioredis";
import { Client as MinioClient } from "minio";
import { query, queryOne } from "@watchpost/db";
import { createLogger } from "@watchpost/logger";
import { sendWebhook } from "../alerts/webhook.js";
import { sendSms } from "../alerts/sms.js";
import { sendEmail } from "../alerts/email.js";
import type { DetectionEvent, Subject } from "@watchpost/types";
import { randomUUID } from "node:crypto";

const logger = createLogger("pipeline");

const FACE_SIDECAR_URL = process.env.FACE_SIDECAR_URL ?? "http://face-sidecar:5500";
const MATCH_THRESHOLD = parseFloat(process.env.MATCH_THRESHOLD ?? "0.4");
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
  port: parseInt(process.env.MINIO_PORT ?? "9000", 10),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY ?? "watchpost",
  secretKey: process.env.MINIO_SECRET_KEY ?? "changeme-minio-secret",
});

const BUCKET = process.env.MINIO_BUCKET ?? "watchpost";

export interface PipelineEvent {
  site_id: string;
  camera_id: string;
  protect_event_id: string;
  event_type: string;
  detected_at: string;
  snapshot: Buffer | null;
}

export async function processEvent(event: PipelineEvent): Promise<void> {
  logger.info(
    { type: event.event_type, camera: event.camera_id },
    "Processing pipeline event"
  );

  let snapshotPath: string | null = null;
  let bestFaceCrop: string | null = null;
  let embedding: number[] | null = null;
  let matchSubjectId: string | null = null;
  let matchDistance: number | null = null;
  let matchConfidence: number | null = null;

  // 1. Store snapshot in MinIO
  if (event.snapshot) {
    snapshotPath = `snapshots/${event.site_id}/${new Date().toISOString().split("T")[0]}/${randomUUID()}.jpg`;
    await minio.putObject(BUCKET, snapshotPath, event.snapshot, event.snapshot.length, {
      "Content-Type": "image/jpeg",
    });

    // 2. Send to face sidecar for detection
    try {
      const detectRes = await fetch(`${FACE_SIDECAR_URL}/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: event.snapshot,
      });

      if (detectRes.ok) {
        const detection = (await detectRes.json()) as {
          faces: Array<{
            bbox: [number, number, number, number];
            embedding: number[];
            quality: number;
          }>;
        };

        if (detection.faces.length > 0) {
          // Use highest quality face
          const bestFace = detection.faces.reduce((a, b) =>
            a.quality > b.quality ? a : b
          );
          embedding = bestFace.embedding;

          // 3. Search pgvector for matches
          const embeddingStr = `[${embedding.join(",")}]`;
          const matches = await query<{
            subject_id: string;
            distance: number;
            display_name: string;
            list_type: string;
          }>(
            `SELECT fe.subject_id, s.display_name, s.list_type,
                    fe.embedding <=> $1::vector AS distance
             FROM face_enrollments fe
             JOIN subjects s ON fe.subject_id = s.id
             WHERE s.site_id = $2 AND s.active = true
             ORDER BY fe.embedding <=> $1::vector
             LIMIT 1`,
            [embeddingStr, event.site_id]
          );

          if (matches.length > 0 && matches[0].distance <= MATCH_THRESHOLD) {
            matchSubjectId = matches[0].subject_id;
            matchDistance = matches[0].distance;
            matchConfidence = 1 - matches[0].distance;
            logger.info(
              {
                subject: matches[0].display_name,
                list_type: matches[0].list_type,
                confidence: matchConfidence,
              },
              "Face match found"
            );
          }
        }
      }
    } catch (err) {
      logger.error(err, "Face detection failed");
    }
  }

  // 4. Insert detection event
  const embeddingStr = embedding ? `[${embedding.join(",")}]` : null;
  const detectionEvent = await queryOne<DetectionEvent>(
    `INSERT INTO detection_events
     (site_id, camera_id, protect_event_id, event_type, detected_at,
      snapshot_path, best_face_crop, embedding, match_subject_id,
      match_distance, match_confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      event.site_id,
      event.camera_id,
      event.protect_event_id,
      event.event_type,
      event.detected_at,
      snapshotPath,
      bestFaceCrop,
      embeddingStr,
      matchSubjectId,
      matchDistance,
      matchConfidence,
    ]
  );

  // 5. Publish to Redis for real-time dashboard
  const redis = new Redis(REDIS_URL);
  await redis.publish(
    "watchpost:events",
    JSON.stringify({
      type: "detection",
      payload: detectionEvent,
      timestamp: new Date().toISOString(),
    })
  );
  await redis.quit();

  // 6. Trigger alerts if there's a match on ban/watch list
  if (matchSubjectId && detectionEvent) {
    const subject = await queryOne<Subject>(
      "SELECT * FROM subjects WHERE id = $1",
      [matchSubjectId]
    );

    if (subject && (subject.list_type === "ban" || subject.list_type === "watch")) {
      await triggerAlerts(detectionEvent, subject);
    }
  }
}

async function triggerAlerts(event: DetectionEvent, subject: Subject): Promise<void> {
  const alertPayload = {
    event_id: event.id,
    event_type: event.event_type,
    camera_id: event.camera_id,
    detected_at: event.detected_at,
    subject_name: subject.display_name,
    list_type: subject.list_type,
    confidence: event.match_confidence,
  };

  // Webhook
  if (process.env.ALERT_WEBHOOK_URL) {
    const alert = await queryOne<{ id: string }>(
      `INSERT INTO alerts (detection_event_id, channel, destination, payload)
       VALUES ($1, 'webhook', $2, $3) RETURNING id`,
      [event.id, process.env.ALERT_WEBHOOK_URL, JSON.stringify(alertPayload)]
    );
    try {
      await sendWebhook(process.env.ALERT_WEBHOOK_URL, alertPayload);
      await query("UPDATE alerts SET status = 'sent', sent_at = now() WHERE id = $1", [alert!.id]);
    } catch (err) {
      await query("UPDATE alerts SET status = 'failed', error = $1 WHERE id = $2", [
        String(err),
        alert!.id,
      ]);
    }
  }

  // SMS
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_FROM) {
    // In production, look up SMS destinations from a config table
    logger.info("SMS alerting configured but no destinations set");
  }

  // Email
  if (process.env.SENDGRID_API_KEY) {
    // In production, look up email destinations from a config table
    logger.info("Email alerting configured but no destinations set");
  }
}
