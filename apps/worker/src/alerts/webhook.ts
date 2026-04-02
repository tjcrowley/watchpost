import { createLogger } from "@watchpost/logger";

const logger = createLogger("alert-webhook");

export interface AlertPayload {
  event_id: string;
  event_type: string;
  camera_id: string;
  detected_at: string;
  subject_name: string;
  list_type: string;
  confidence: number | null;
  snapshot_path?: string | null;
  mode?: string;
  [key: string]: unknown;
}

export async function sendWebhook(
  url: string,
  payload: AlertPayload | Record<string, unknown>
): Promise<void> {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1_000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info({ url, attempt }, "Sending webhook alert");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "WatchPost/1.0",
        },
        body: JSON.stringify({
          source: "watchpost",
          ...payload,
          sent_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }

      logger.info({ url, status: response.status }, "Webhook sent successfully");
      return;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        logger.error({ err, url, attempts: MAX_RETRIES }, "Webhook failed after all retries");
        throw err;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { err, url, attempt, retryInMs: delay },
        "Webhook attempt failed, retrying..."
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
