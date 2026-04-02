import { createLogger } from "@watchpost/logger";

const logger = createLogger("alert-webhook");

export async function sendWebhook(
  url: string,
  payload: Record<string, unknown>
): Promise<void> {
  logger.info({ url }, "Sending webhook alert");

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
}
