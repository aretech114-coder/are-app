import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotificationPayload {
  recipient_email: string;
  recipient_name: string;
  subject: string;
  body_html: string;
  mail_id?: string;
  step_number?: number;
  notification_type?: "transition" | "pre_assignment" | "sla_alert" | "rejection";
}

async function sendViaResend(
  apiKey: string,
  from: string,
  payload: NotificationPayload
): Promise<void> {
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
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Resend API error (${res.status}): ${errBody}`);
  }
}

async function sendViaSmtp(
  payload: NotificationPayload,
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === supabaseServiceKey;

    if (!isServiceRole) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const payload: NotificationPayload = await req.json();

    if (!payload.recipient_email || !payload.subject || !payload.body_html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: recipient_email, subject, body_html" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM") || Deno.env.get("SMTP_FROM");
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const smtpFrom = Deno.env.get("SMTP_FROM");

    let provider = "unknown";

    if (resendKey && resendFrom) {
      await sendViaResend(resendKey, resendFrom, payload);
      provider = "resend";
    } else if (smtpHost && smtpUser && smtpPass && smtpFrom) {
      await sendViaSmtp(payload, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom);
      provider = "smtp";
    } else {
      return new Response(
        JSON.stringify({
          error:
            "Email not configured. Set RESEND_API_KEY + RESEND_FROM (recommended) or SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `Email sent via ${provider} to ${payload.recipient_email} — type: ${payload.notification_type || "transition"}`
    );

    return new Response(
      JSON.stringify({ success: true, recipient: payload.recipient_email, provider }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Email send error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
