import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export interface SendEmailPayload {
  recipient_email: string;
  subject: string;
  body_html: string;
}

export interface SendEmailResult {
  provider: string;
  provider_message_id: string | null;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function sendViaResend(
  apiKey: string,
  from: string,
  payload: SendEmailPayload
): Promise<string | null> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.recipient_email],
      subject: payload.subject,
      html: payload.body_html,
      text: htmlToPlainText(payload.body_html),
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Resend API error (${res.status}): ${bodyText}`);
  }

  try {
    const parsed = JSON.parse(bodyText) as { id?: string };
    return parsed.id ?? null;
  } catch {
    return null;
  }
}

async function sendViaSmtp(
  payload: SendEmailPayload,
  smtpHost: string,
  smtpPort: number,
  smtpUser: string,
  smtpPass: string,
  smtpFrom: string
): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: smtpHost,
      port: smtpPort,
      tls: true,
      auth: {
        username: smtpUser,
        password: smtpPass,
      },
    },
  });

  await client.send({
    from: smtpFrom,
    to: payload.recipient_email,
    subject: payload.subject,
    content: "auto",
    html: payload.body_html,
  });

  await client.close();
}

export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_FROM") || Deno.env.get("SMTP_FROM");
  const smtpHost = Deno.env.get("SMTP_HOST");
  const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
  const smtpUser = Deno.env.get("SMTP_USER");
  const smtpPass = Deno.env.get("SMTP_PASS");
  const smtpFrom = Deno.env.get("SMTP_FROM");

  if (resendKey && resendFrom) {
    const id = await sendViaResend(resendKey, resendFrom, payload);
    return { provider: "resend", provider_message_id: id };
  }

  if (smtpHost && smtpUser && smtpPass && smtpFrom) {
    await sendViaSmtp(payload, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom);
    return { provider: "smtp", provider_message_id: null };
  }

  throw new Error(
    "Email not configured. Set RESEND_API_KEY + RESEND_FROM or SMTP credentials."
  );
}
