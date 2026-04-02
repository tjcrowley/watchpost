import { query, queryOne } from "../db/client.js";
import { createLogger } from "@watchpost/logger";
import type { DetectionEvent, MatchResult } from "@watchpost/types";

const logger = createLogger("detection-service");

const FACE_SIDECAR_URL = process.env.FACE_SIDECAR_URL ?? "http://face-sidecar:5500";
const MATCH_THRESHOLD = parseFloat(process.env.MATCH_THRESHOLD ?? "0.4");

export interface ProcessDetectionInput {
  site_id: string;
  camera_id: string;
  protect_event_id: string;
  event_type: string;
  detected_at: string;
  snapshot: Buffer;
}

export async function processDetection(input: ProcessDetectionInput): Promise<DetectionEvent | null> {
  logger.info({ event_type: input.event_type, camera_id: input.camera_id }, "Processing detection");

  // 1. Send snapshot to face sidecar for detection
  const detectRes = await fetch(`${FACE_SIDECAR_URL}/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: input.snapshot,
  });

  if (!detectRes.ok) {
    logger.error({ status: detectRes.status }, "Face detection failed");
    return null;
  }

  const detection = (await detectRes.json()) as {
    faces: Array<{ embedding: number[]; quality: number; bbox: number[] }>;
  };

  if (detection.faces.length === 0) {
    logger.debug("No faces detected in snapshot");
    // Still record the event without face data
    const event = await queryOne<DetectionEvent>(
      `INSERT INTO detection_events (site_id, camera_id, protect_event_id, event_type, detected_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.site_id, input.camera_id, input.protect_event_id, input.event_type, input.detected_at]
    );
    return event;
  }

  // Use the highest quality face
  const bestFace = detection.faces.reduce((a, b) => (a.quality > b.quality ? a : b));
  const embeddingStr = `[${bestFace.embedding.join(",")}]`;

  // 2. Search for matches in pgvector
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
    [embeddingStr, input.site_id]
  );

  const match = matches.length > 0 && matches[0].distance <= MATCH_THRESHOLD ? matches[0] : null;

  // 3. Insert detection event
  const event = await queryOne<DetectionEvent>(
    `INSERT INTO detection_events
     (site_id, camera_id, protect_event_id, event_type, detected_at,
      embedding, match_subject_id, match_distance, match_confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.site_id,
      input.camera_id,
      input.protect_event_id,
      input.event_type,
      input.detected_at,
      embeddingStr,
      match?.subject_id ?? null,
      match?.distance ?? null,
      match ? 1 - match.distance : null,
    ]
  );

  if (match) {
    logger.info(
      { subject: match.display_name, list_type: match.list_type, distance: match.distance },
      "Face match found"
    );
  }

  return event;
}
