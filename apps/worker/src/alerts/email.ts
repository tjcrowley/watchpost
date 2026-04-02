import sgMail from "@sendgrid/mail";
import { createLogger } from "@watchpost/logger";

const logger = createLogger("alert-email");

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) return;

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  logger.info({ to }, "Sending email alert");

  await sgMail.send({
    to,
    from: { email: "alerts@watchpost.local", name: "WatchPost Alerts" },
    subject,
    html,
  });

  logger.info({ to }, "Email sent successfully");
}
