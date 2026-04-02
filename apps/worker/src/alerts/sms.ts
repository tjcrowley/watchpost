import twilio from "twilio";
import { createLogger } from "@watchpost/logger";

const logger = createLogger("alert-sms");

export async function sendSms(to: string, body: string): Promise<void> {
  if (!process.env.TWILIO_ACCOUNT_SID) return;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const from = process.env.TWILIO_FROM ?? "";

  if (!authToken || !from) {
    logger.warn("Twilio auth token or from number not configured, skipping SMS");
    return;
  }

  logger.info({ to }, "Sending SMS alert");

  const client = twilio(accountSid, authToken);

  const message = await client.messages.create({
    to,
    from,
    body,
  });

  logger.info({ to, sid: message.sid }, "SMS sent successfully");
}
