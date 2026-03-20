import nodemailer from 'nodemailer';
import { sentEmailRepository } from '@/repositories';
import { logActivity } from '@/lib/audit-log';
import { generateId } from '@/lib/utils';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.ionos.com';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const HOURLY_LIMIT = 500;
const BULK_THRESHOLD = 100;
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 3000;

interface SendResult {
  success: boolean;
  provider?: string;
  error?: string;
  sent?: number;
  failed?: number;
  queued?: number;
}

function createTransport(port: number, usePool = false) {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    ...(usePool && {
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
      rateDelta: 1000,
      rateLimit: 10,
    }),
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendEmail(
  to: string[],
  subject: string,
  htmlBody: string,
  sentBy: string,
  from?: string,
): Promise<SendResult> {
  if (!SMTP_USER || !SMTP_PASS) {
    return { success: false, error: 'SMTP credentials not configured' };
  }

  const hourlyCount = await sentEmailRepository.countLastHourByProvider('ionos');
  if (hourlyCount + to.length > HOURLY_LIMIT) {
    return {
      success: false,
      error: `Hourly email limit would be exceeded (${hourlyCount} sent in last hour, ${to.length} requested, limit ${HOURLY_LIMIT}/hr)`,
    };
  }

  const fromAddress = from || SMTP_USER;

  // For large sends (>100), fire-and-forget with background batching
  if (to.length > BULK_THRESHOLD) {
    sendInBatches(to, subject, htmlBody, sentBy, fromAddress);
    return { success: true, provider: 'ionos', sent: 0, queued: to.length };
  }

  // For smaller sends, wait for completion and return results
  return sendDirect(to, subject, htmlBody, sentBy, fromAddress);
}

async function trySendMail(
  transport: nodemailer.Transporter,
  fromAddress: string,
  recipient: string,
  subject: string,
  htmlBody: string,
) {
  await transport.sendMail({
    from: fromAddress,
    to: recipient,
    subject,
    html: htmlBody,
  });
}

async function sendDirect(
  recipients: string[],
  subject: string,
  htmlBody: string,
  sentBy: string,
  fromAddress: string,
): Promise<SendResult> {
  let transport = createTransport(587);
  let currentPort = 587;
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    for (const recipient of recipients) {
      try {
        try {
          await trySendMail(transport, fromAddress, recipient, subject, htmlBody);
        } catch (primaryErr) {
          // If port 587 fails, fall back to 465
          if (currentPort === 587) {
            transport.close();
            transport = createTransport(465);
            currentPort = 465;
            await trySendMail(transport, fromAddress, recipient, subject, htmlBody);
          } else {
            throw primaryErr;
          }
        }

        await sentEmailRepository.create({
          to: recipient,
          subject,
          body: htmlBody,
          provider: 'ionos',
          status: 'sent',
          sentBy,
        });

        sent++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        errors.push(`${recipient}: ${errorMessage}`);

        await sentEmailRepository.create({
          to: recipient,
          subject,
          body: htmlBody,
          provider: 'ionos',
          status: 'failed',
          error: errorMessage,
          sentBy,
        });

        failed++;
      }
    }
  } finally {
    transport.close();
  }

  logActivity({
    userEmail: sentBy,
    action: 'create',
    entityType: 'Email',
    entityId: generateId(),
    entityLabel: subject,
    description: `Batch email: ${sent} sent, ${failed} failed out of ${recipients.length} recipients`,
  });

  if (failed > 0 && sent === 0) {
    return { success: false, error: errors.join('; '), sent, failed };
  }

  return {
    success: true,
    provider: 'ionos',
    sent,
    failed,
    ...(errors.length > 0 && { error: errors.join('; ') }),
  };
}

async function sendInBatches(
  allRecipients: string[],
  subject: string,
  htmlBody: string,
  sentBy: string,
  fromAddress: string,
): Promise<SendResult> {
  let totalSent = 0;
  let totalFailed = 0;
  const allErrors: string[] = [];

  for (let i = 0; i < allRecipients.length; i += BATCH_SIZE) {
    const batch = allRecipients.slice(i, i + BATCH_SIZE);
    const result = await sendDirect(batch, subject, htmlBody, sentBy, fromAddress);
    totalSent += result.sent || 0;
    totalFailed += result.failed || 0;
    if (result.error) allErrors.push(result.error);

    // Delay between batches to avoid SMTP rate limits
    if (i + BATCH_SIZE < allRecipients.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  logActivity({
    userEmail: sentBy,
    action: 'create',
    entityType: 'Email',
    entityId: generateId(),
    entityLabel: subject,
    description: `Bulk email complete: ${totalSent} sent, ${totalFailed} failed out of ${allRecipients.length} recipients`,
  });

  if (totalFailed > 0 && totalSent === 0) {
    return { success: false, error: allErrors.join('; '), sent: totalSent, failed: totalFailed };
  }

  return {
    success: true,
    provider: 'ionos',
    sent: totalSent,
    failed: totalFailed,
    ...(allErrors.length > 0 && { error: allErrors.join('; ') }),
  };
}
