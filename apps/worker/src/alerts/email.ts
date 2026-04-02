import { createLogger } from "@watchpost/logger";

const logger = createLogger("alert-email");

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? "";

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  if (!SENDGRID_API_KEY) {
    logger.warn("SendGrid not configured, skipping email");
    return;
  }

  logger.info({ to: options.to }, "Sending email alert");

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: options.to }] }],
      from: { email: "alerts@watchpost.local", name: "WatchPost Alerts" },
      subject: options.subject,
      content: [
        { type: "text/plain", value: options.text },
        ...(options.html ? [{ type: "text/html", value: options.html }] : []),
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SendGrid email failed: ${response.status} ${error}`);
  }

  logger.info({ to: options.to }, "Email sent successfully");
}
