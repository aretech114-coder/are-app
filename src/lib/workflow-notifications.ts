import { supabase } from "@/integrations/supabase/client";
import { APP_URL } from "@/lib/constants";
import { UI_LABELS, WORKFLOW_STEP_LABELS } from "@/lib/labels";

export type WorkflowNotificationType =
  | "transition"
  | "pre_assignment"
  | "sla_alert"
  | "rejection";

interface StepNotificationConfig {
  notifyEnabled: boolean;
  subjectTemplate: string | null;
}

async function getStepName(stepNumber: number): Promise<{ name: string } | null> {
  const { data } = await supabase
    .from("workflow_steps")
    .select("name")
    .eq("step_order", stepNumber)
    .eq("is_active", true)
    .maybeSingle();

  if (data?.name) return { name: data.name };
  const fallback = WORKFLOW_STEP_LABELS[stepNumber as keyof typeof WORKFLOW_STEP_LABELS];
  return fallback ? { name: fallback.name } : null;
}

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
  notificationType: WorkflowNotificationType;
  customMessage?: string;
}) {
  try {
    const bodyHtml = buildNotificationHtml({
      recipientName: params.recipientName,
      stepName: params.stepName,
      stepNumber: params.stepNumber,
      mailSubject: params.mailSubject,
      referenceNumber: params.referenceNumber,
      notificationType: params.notificationType,
      customMessage: params.customMessage,
      mailId: params.mailId,
    });

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

export async function getStepNotificationConfig(
  stepNumber: number
): Promise<StepNotificationConfig> {
  const { data } = await supabase
    .from("workflow_step_responsibles" as any)
    .select("notify_enabled, notification_subject_template")
    .eq("step_number", stepNumber)
    .maybeSingle();

  return {
    notifyEnabled: (data as any)?.notify_enabled ?? true,
    subjectTemplate: (data as any)?.notification_subject_template ?? null,
  };
}

export async function isStepNotificationEnabled(stepNumber: number): Promise<boolean> {
  const config = await getStepNotificationConfig(stepNumber);
  return config.notifyEnabled;
}

export function formatNotificationSubject(
  template: string | null,
  vars: {
    stepName: string;
    stepNumber: number;
    mailSubject?: string;
    referenceNumber?: string;
  },
  fallback: string
): string {
  if (!template?.trim()) return fallback;
  return template
    .replace(/\{\{step_name\}\}/g, vars.stepName)
    .replace(/\{\{step_number\}\}/g, String(vars.stepNumber))
    .replace(/\{\{mail_subject\}\}/g, vars.mailSubject || "")
    .replace(/\{\{reference_number\}\}/g, vars.referenceNumber || "");
}

/**
 * Notifie par e-mail tous les assignés actifs d'une étape (contributors + viewers).
 * Complète le seul assigned_to renvoyé par advance_workflow_step.
 */
export async function notifyMailStepRecipients(
  mailId: string,
  stepNumber: number,
  action: string,
  fallbackUserId?: string | null
) {
  try {
    const config = await getStepNotificationConfig(stepNumber);
    if (!config.notifyEnabled) return;

    const stepInfo = await getStepName(stepNumber);
    if (!stepInfo) return;

    const { data: mailData } = await supabase
      .from("mails")
      .select("subject, reference_number, assigned_agent_id")
      .eq("id", mailId)
      .single();

    if (!mailData) return;

    const { data: assignments } = await supabase
      .from("mail_assignments")
      .select("assigned_to, access_mode, status")
      .eq("mail_id", mailId)
      .eq("step_number", stepNumber)
      .in("status", ["pending", "proposed"])
      .in("access_mode", ["contributor", "viewer"]);

    const recipientIds = new Set<string>();
    for (const a of assignments || []) {
      recipientIds.add(a.assigned_to);
    }
    if (fallbackUserId) recipientIds.add(fallbackUserId);
    if (mailData.assigned_agent_id) recipientIds.add(mailData.assigned_agent_id);

    if (recipientIds.size === 0) return;

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", [...recipientIds]);

    const isRejection = action === "reject";
    const notificationType: WorkflowNotificationType = isRejection ? "rejection" : "transition";
    const defaultSubject = isRejection
      ? `🔙 Dossier renvoyé — ${stepInfo.name}`
      : `📬 Courrier en attente — ${stepInfo.name}`;

    const subject = formatNotificationSubject(
      config.subjectTemplate,
      {
        stepName: stepInfo.name,
        stepNumber,
        mailSubject: mailData.subject,
        referenceNumber: mailData.reference_number,
      },
      defaultSubject
    );

    await Promise.all(
      (profiles || [])
        .filter((p) => p.email)
        .map((p) => {
          const assignment = assignments?.find((a) => a.assigned_to === p.id);
          const isViewer = assignment?.access_mode === "viewer";
          const customMessage = isViewer
            ? `Un courrier vous est transmis en copie lecture seule à l'étape « ${stepInfo.name} ».`
            : undefined;

          return sendWorkflowNotificationEmail({
            recipientEmail: p.email!,
            recipientName: p.full_name || "Utilisateur",
            subject,
            mailId,
            stepNumber,
            stepName: stepInfo.name,
            mailSubject: mailData.subject,
            referenceNumber: mailData.reference_number,
            notificationType,
            customMessage,
          });
        })
    );
  } catch (err) {
    console.error("notifyMailStepRecipients error:", err);
  }
}

/**
 * Pré-assignation étape 2 → e-mails aux futurs assignés (step 4 proposed/pending).
 */
export async function notifyPreAssignmentRecipients(mailId: string) {
  try {
    const config = await getStepNotificationConfig(4);
    if (!config.notifyEnabled) return;

    const stepInfo = await getStepName(4);
    if (!stepInfo) return;

    const { data: mailData } = await supabase
      .from("mails")
      .select("subject, reference_number")
      .eq("id", mailId)
      .single();

    if (!mailData) return;

    const { data: assignments } = await supabase
      .from("mail_assignments")
      .select("assigned_to, access_mode")
      .eq("mail_id", mailId)
      .eq("step_number", 4)
      .in("status", ["proposed", "pending"]);

    if (!assignments?.length) return;

    const userIds = [...new Set(assignments.map((a) => a.assigned_to))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    const subject = formatNotificationSubject(
      config.subjectTemplate,
      {
        stepName: stepInfo.name,
        stepNumber: 4,
        mailSubject: mailData.subject,
        referenceNumber: mailData.reference_number,
      },
      `📋 ${UI_LABELS.preAssignmentByDg} — ${stepInfo.name}`
    );

    await Promise.all(
      (profiles || [])
        .filter((p) => p.email)
        .map((p) => {
          const mode = assignments.find((a) => a.assigned_to === p.id)?.access_mode;
          return sendWorkflowNotificationEmail({
            recipientEmail: p.email!,
            recipientName: p.full_name || "Utilisateur",
            subject,
            mailId,
            stepNumber: 4,
            stepName: stepInfo.name,
            mailSubject: mailData.subject,
            referenceNumber: mailData.reference_number,
            notificationType: "pre_assignment",
            customMessage:
              mode === "viewer"
                ? "Le Directeur général vous a mis en copie lecture seule sur ce courrier (pré-assignation)."
                : "Le Directeur général vous a pré-assigné ce courrier pour traitement futur.",
          });
        })
    );
  } catch (err) {
    console.error("notifyPreAssignmentRecipients error:", err);
  }
}

function buildNotificationHtml(params: {
  recipientName: string;
  stepName: string;
  stepNumber: number;
  mailSubject: string;
  referenceNumber?: string;
  notificationType: string;
  customMessage?: string;
  mailId: string;
}): string {
  const typeLabels: Record<string, string> = {
    transition: "Nouvelle tâche assignée",
    pre_assignment: UI_LABELS.preAssignmentByDg,
    sla_alert: "⚠️ Dépassement de délai SLA",
    rejection: "Dossier renvoyé",
  };

  const title = typeLabels[params.notificationType] || "Notification ARE App";
  const inboxUrl = `${APP_URL}/inbox?mail=${params.mailId}`;

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
      <a href="${inboxUrl}" style="display: inline-block; margin: 16px 0; padding: 12px 24px; background-color: #1a1a2e; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
        Voir le courrier
      </a>
      <p style="color: #888; font-size: 12px; margin: 24px 0 0;">
        Cet e-mail a été envoyé automatiquement par le système ARE App.
      </p>
    </div>
  </div>
</body>
</html>`;
}
