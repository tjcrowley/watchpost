import Redis from "ioredis";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import axios from "axios";
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

const s3 = new S3Client({
  endpoint: `http://${process.env.MINIO_ENDPOINT ?? "localhost"}:${process.env.MINIO_PORT ?? "9000"}`,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "watchpost",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "changeme-minio-secret",
  },
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

interface FaceDetectionResponse {
  faces: Array<{
    bbox: [number, number, number, number];
    embedding: number[];
    quality: number;
  }>;
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

  try {
    // 1. Upload snapshot to MinIO via S3 API
    if (event.snapshot) {
      snapshotPath = `snapshots/${event.site_id}/${new Date().toISOString().split("T")[0]}/${randomUUID()}.jpg`;
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: snapshotPath,
          Body: event.snapshot,
          ContentType: "image/jpeg",
          ContentLength: event.snapshot.length,
        })
      );
      logger.debug({ path: snapshotPath }, "Snapshot uploaded to MinIO");

      // 2. POST to face sidecar with base64 image
      try {
        const detectRes = await axios.post<FaceDetectionResponse>(
          `${FACE_SIDECAR_URL}/detect`,
          { image: event.snapshot.toString("base64") },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 30_000,
          }
        );

        const detection = detectRes.data;

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
      } catch (err) {
        logger.error(err, "Face detection failed");
      }
    }

    // 4. Write detection_event row to postgres
    const embeddingStr = embedding ? `[${embedding.join(",")}]` : null;
    const reviewStatus =
      matchConfidence !== null && matchConfidence >= 0.50 && matchConfidence < 0.75
        ? "pending"
        : "pending";
    const detectionEvent = await queryOne<DetectionEvent>(
      `INSERT INTO detection_events
       (site_id, camera_id, protect_event_id, event_type, detected_at,
        snapshot_path, best_face_crop, embedding, match_subject_id,
        match_distance, match_confidence, review_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        reviewStatus,
      ]
    );

    // 5. Publish event to Redis channel events:{site_id}
    const redis = new Redis(REDIS_URL);
    try {
      await redis.publish(
        `events:${event.site_id}`,
        JSON.stringify({
          type: "detection",
          payload: detectionEvent,
          timestamp: new Date().toISOString(),
        })
      );
    } finally {
      await redis.quit();
    }

    // 6. Trigger alerts based on confidence thresholds
    if (matchSubjectId && detectionEvent && matchConfidence !== null) {
      const subject = await queryOne<Subject>(
        "SELECT * FROM subjects WHERE id = $1",
        [matchSubjectId]
      );

      if (subject && (subject.list_type === "ban" || subject.list_type === "watch")) {
        if (matchConfidence >= 0.75) {
          // High confidence: send immediate alerts
          await triggerAlerts(detectionEvent, subject, "immediate");
        } else if (matchConfidence >= 0.50) {
          // Medium confidence: mark as pending review, still record alert
          await triggerAlerts(detectionEvent, subject, "pending_review");
        }
        // Below 0.50: no alert action
      }
    }
  } catch (err) {
    // Handle errors gracefully — log and continue, never crash the worker
    logger.error(
      { err, eventId: event.protect_event_id, camera: event.camera_id },
      "Pipeline processing failed"
    );
  }
}

async function triggerAlerts(
  event: DetectionEvent,
  subject: Subject,
  mode: "immediate" | "pending_review"
): Promise<void> {
  const alertPayload = {
    event_id: event.id,
    event_type: event.event_type,
    camera_id: event.camera_id,
    detected_at: event.detected_at,
    subject_name: subject.display_name,
    list_type: subject.list_type,
    confidence: event.match_confidence,
    snapshot_path: event.snapshot_path,
    mode,
  };

  if (mode === "pending_review") {
    logger.info(
      { subject: subject.display_name, confidence: event.match_confidence },
      "Match pending review (confidence 0.50-0.75)"
    );
    // Record the alert but don't fire notifications
    await queryOne(
      `INSERT INTO alerts (detection_event_id, channel, destination, payload, status)
       VALUES ($1, 'pending_review', 'review_queue', $2, 'queued') RETURNING id`,
      [event.id, JSON.stringify(alertPayload)]
    );
    return;
  }

  // Immediate alerts (confidence >= 0.75)
  logger.info(
    { subject: subject.display_name, confidence: event.match_confidence },
    "Triggering immediate alerts"
  );

  // Webhook
  if (process.env.ALERT_WEBHOOK_URL) {
    const alert = await queryOne<{ id: string }>(
      `INSERT INTO alerts (detection_event_id, channel, destination, payload)
       VALUES ($1, 'webhook', $2, $3) RETURNING id`,
      [event.id, process.env.ALERT_WEBHOOK_URL, JSON.stringify(alertPayload)]
    );
    try {
      await sendWebhook(process.env.ALERT_WEBHOOK_URL, alertPayload);
      await query("UPDATE alerts SET status = 'sent', sent_at = now() WHERE id = $1", [
        alert!.id,
      ]);
    } catch (err) {
      logger.error(err, "Webhook alert failed");
      await query("UPDATE alerts SET status = 'failed', error = $1 WHERE id = $2", [
        String(err),
        alert!.id,
      ]);
    }
  }

  // SMS — look up destinations from alert_destinations or site config
  if (process.env.TWILIO_ACCOUNT_SID) {
    const smsDestinations = await query<{ id: string; destination: string }>(
      `SELECT id, destination FROM alert_destinations
       WHERE site_id = $1 AND channel = 'sms' AND active = true`,
      [event.site_id]
    ).catch(() => [] as { id: string; destination: string }[]);

    for (const dest of smsDestinations) {
      const alert = await queryOne<{ id: string }>(
        `INSERT INTO alerts (detection_event_id, channel, destination, payload)
         VALUES ($1, 'sms', $2, $3) RETURNING id`,
        [event.id, dest.destination, JSON.stringify(alertPayload)]
      );
      try {
        await sendSms(
          dest.destination,
          `WatchPost Alert: ${subject.display_name} (${subject.list_type}) detected. Confidence: ${((event.match_confidence ?? 0) * 100).toFixed(0)}%`
        );
        await query("UPDATE alerts SET status = 'sent', sent_at = now() WHERE id = $1", [
          alert!.id,
        ]);
      } catch (err) {
        logger.error(err, "SMS alert failed");
        await query("UPDATE alerts SET status = 'failed', error = $1 WHERE id = $2", [
          String(err),
          alert!.id,
        ]);
      }
    }
  }

  // Email — look up destinations from alert_destinations or site config
  if (process.env.SENDGRID_API_KEY) {
    const emailDestinations = await query<{ id: string; destination: string }>(
      `SELECT id, destination FROM alert_destinations
       WHERE site_id = $1 AND channel = 'email' AND active = true`,
      [event.site_id]
    ).catch(() => [] as { id: string; destination: string }[]);

    for (const dest of emailDestinations) {
      const alert = await queryOne<{ id: string }>(
        `INSERT INTO alerts (detection_event_id, channel, destination, payload)
         VALUES ($1, 'email', $2, $3) RETURNING id`,
        [event.id, dest.destination, JSON.stringify(alertPayload)]
      );
      try {
        await sendEmail(
          dest.destination,
          `WatchPost Alert: ${subject.display_name} (${subject.list_type}) detected`,
          `<h2>WatchPost Detection Alert</h2>
           <p><strong>${subject.display_name}</strong> (${subject.list_type} list) was detected.</p>
           <p>Confidence: ${((event.match_confidence ?? 0) * 100).toFixed(0)}%</p>
           <p>Camera: ${event.camera_id}</p>
           <p>Time: ${event.detected_at}</p>`
        );
        await query("UPDATE alerts SET status = 'sent', sent_at = now() WHERE id = $1", [
          alert!.id,
        ]);
      } catch (err) {
        logger.error(err, "Email alert failed");
        await query("UPDATE alerts SET status = 'failed', error = $1 WHERE id = $2", [
          String(err),
          alert!.id,
        ]);
      }
    }
  }
}
