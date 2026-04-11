import { supabase } from "@/integrations/supabase/client";

/**
 * Sends a workflow notification email via the send-notification-email edge function.
 * Non-blocking: errors are logged but don't interrupt workflow.
 */
export async function sendWorkflowNotificationEmail(params: {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  mailId: string;
  stepNumber: number;
  stepName: string;
  mailSubject: string;
  referenceNumber?: string;
  notificationType: "transition" | "pre_assignment" | "sla_alert" | "rejection";
  customMessage?: string;
}) {
  try {
    const bodyHtml = buildNotificationHtml(params);

    const { error } = await supabase.functions.invoke("send-notification-email", {
      body: {
        recipient_email: params.recipientEmail,
        recipient_name: params.recipientName,
        subject: params.subject,
        body_html: bodyHtml,
        mail_id: params.mailId,
        step_number: params.stepNumber,
        notification_type: params.notificationType,
      },
    });

    if (error) {
      console.error("Notification email failed:", error.message);
    }
  } catch (err) {
    console.error("Notification email error:", err);
  }
}

/**
 * Check if email notifications are enabled for a given step
 */
export async function isStepNotificationEnabled(stepNumber: number): Promise<boolean> {
  const { data } = await supabase
    .from("workflow_step_responsibles" as any)
    .select("notify_enabled")
    .eq("step_number", stepNumber)
    .single();

  // Default to true if no config found
  return (data as any)?.notify_enabled ?? true;
}

function buildNotificationHtml(params: {
  recipientName: string;
  stepName: string;
  stepNumber: number;
  mailSubject: string;
  referenceNumber?: string;
  notificationType: string;
  customMessage?: string;
}): string {
  const typeLabels: Record<string, string> = {
    transition: "Nouvelle tâche assignée",
    pre_assignment: "Pré-assignation par le Ministre",
    sla_alert: "⚠️ Dépassement de délai SLA",
    rejection: "Dossier renvoyé",
  };

  const title = typeLabels[params.notificationType] || "Notification ARE App";

  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f7; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background-color: #1a1a2e; padding: 24px 32px;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px;">${title}</h1>
    </div>
    <div style="padding: 32px;">
      <p style="color: #333; font-size: 16px; margin: 0 0 16px;">
        Bonjour <strong>${params.recipientName}</strong>,
      </p>
      <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
        ${params.customMessage || `Un courrier requiert votre attention à l'étape <strong>"${params.stepName}"</strong> (Étape ${params.stepNumber}).`}
      </p>
      <div style="background: #f8f9fa; border-left: 4px solid #1a1a2e; padding: 16px; border-radius: 4px; margin: 16px 0;">
        <p style="margin: 0 0 8px; color: #333; font-size: 14px;">
          <strong>Objet :</strong> ${params.mailSubject}
        </p>
        ${params.referenceNumber ? `<p style="margin: 0; color: #666; font-size: 13px;"><strong>Réf :</strong> ${params.referenceNumber}</p>` : ""}
      </div>
      <p style="color: #888; font-size: 12px; margin: 24px 0 0;">
        Cet e-mail a été envoyé automatiquement par le système ARE App.
      </p>
    </div>
  </div>
</body>
</html>`;
}
