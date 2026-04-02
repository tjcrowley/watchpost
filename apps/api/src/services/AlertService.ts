import { query, queryOne } from "../db/client.js";
import { getQueue } from "@watchpost/db";
import { createLogger } from "@watchpost/logger";
import type { DetectionEvent, Alert } from "@watchpost/types";

const logger = createLogger("alert-service");

export interface AlertTarget {
  channel: "webhook" | "sms" | "email";
  destination: string;
}

export async function createAlert(
  event: DetectionEvent,
  targets: AlertTarget[]
): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const queue = await getQueue();

  for (const target of targets) {
    const payload = {
      event_id: event.id,
      event_type: event.event_type,
      camera_id: event.camera_id,
      detected_at: event.detected_at,
      match_subject_id: event.match_subject_id,
      match_confidence: event.match_confidence,
    };

    const alert = await queryOne<Alert>(
      `INSERT INTO alerts (detection_event_id, channel, destination, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [event.id, target.channel, target.destination, JSON.stringify(payload)]
    );

    if (alert) {
      alerts.push(alert);

      // Enqueue for async delivery
      await queue.send(`alert-${target.channel}`, {
        alert_id: alert.id,
        channel: target.channel,
        destination: target.destination,
        payload,
      });

      logger.info({ alert_id: alert.id, channel: target.channel }, "Alert enqueued");
    }
  }

  return alerts;
}

export async function markAlertSent(alertId: string): Promise<void> {
  await query(
    "UPDATE alerts SET status = 'sent', sent_at = now() WHERE id = $1",
    [alertId]
  );
}

export async function markAlertFailed(alertId: string, error: string): Promise<void> {
  await query(
    "UPDATE alerts SET status = 'failed', error = $1 WHERE id = $2",
    [error, alertId]
  );
}
