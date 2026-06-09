import { supabase } from "@/integrations/supabase/client";
import { UI_LABELS } from "@/lib/labels";
import {
  applyNotificationTemplate,
  buildEmailFromStepTemplates,
  formatNotificationSubject,
  getDefaultNotificationBody,
  getDefaultNotificationSubject,
} from "@/lib/notification-template";

export type WorkflowNotificationType =
  | "transition"
  | "pre_assignment"
  | "sla_alert"
  | "rejection";

interface StepNotificationConfig {
  notifyEnabled: boolean;
  subjectTemplate: string | null;
  bodyTemplate: string | null;
  bodyViewerTemplate: string | null;
}

async function getStepName(stepNumber: number): Promise<{ name: string } | null> {
  const { data } = await supabase
    .from("workflow_steps")
    .select("name")
    .eq("step_order", stepNumber)
    .eq("is_active", true)
    .maybeSingle();

  if (data?.name) return { name: data.name };
  return { name: `Étape ${stepNumber}` };
}

export async function sendWorkflowNotificationEmail(params: {
  recipientUserId: string;
  recipientName: string;
  subject: string;
  bodyHtml: string;
  mailId: string;
  stepNumber: number;
  notificationType: WorkflowNotificationType;
}): Promise<{ ok: boolean; error?: string; recipient?: string; provider?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-notification-email", {
      body: {
        recipient_user_id: params.recipientUserId,
        recipient_name: params.recipientName,
        subject: params.subject,
        body_html: params.bodyHtml,
        mail_id: params.mailId,
        step_number: params.stepNumber,
        notification_type: params.notificationType,
      },
    });

    if (error) {
      console.error("Notification email failed:", error.message);
      return { ok: false, error: error.message };
    }

    if (data?.error) {
      console.error("Notification email rejected:", data.error, params);
      return { ok: false, error: data.error };
    }

    if (!data?.success) {
      return { ok: false, error: "Réponse inattendue du serveur e-mail" };
    }

    return {
      ok: true,
      recipient: data.recipient,
      provider: data.provider,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("Notification email error:", message, params);
    return { ok: false, error: message };
  }
}

export async function getStepNotificationConfig(
  stepNumber: number
): Promise<StepNotificationConfig> {
  const { data } = await supabase
    .from("workflow_step_responsibles" as any)
    .select(
      "notify_enabled, notification_subject_template, notification_body_template, notification_body_viewer_template"
    )
    .eq("step_number", stepNumber)
    .maybeSingle();

  return {
    notifyEnabled: (data as any)?.notify_enabled ?? true,
    subjectTemplate: (data as any)?.notification_subject_template ?? null,
    bodyTemplate: (data as any)?.notification_body_template ?? null,
    bodyViewerTemplate: (data as any)?.notification_body_viewer_template ?? null,
  };
}

export async function isStepNotificationEnabled(stepNumber: number): Promise<boolean> {
  const config = await getStepNotificationConfig(stepNumber);
  return config.notifyEnabled;
}

const TYPE_TITLES: Record<string, string> = {
  transition: "Nouvelle tâche assignée",
  pre_assignment: UI_LABELS.preAssignmentByDg,
  sla_alert: "Dépassement de délai SLA",
  rejection: "Dossier renvoyé",
};

function resolveAccessMode(
  assignment: { access_mode: string } | undefined,
  isDefaultAssignee: boolean
): "contributor" | "viewer" | "default" {
  if (assignment?.access_mode === "viewer") return "viewer";
  if (assignment?.access_mode === "contributor") return "contributor";
  if (isDefaultAssignee) return "default";
  return "contributor";
}

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
      .in("access_mode", ["contributor", "viewer", "custodian"]);

    const recipientIds = new Set<string>();
    for (const a of assignments || []) {
      recipientIds.add(a.assigned_to);
    }
    if (fallbackUserId) recipientIds.add(fallbackUserId);
    if (mailData.assigned_agent_id) recipientIds.add(mailData.assigned_agent_id);

    if (recipientIds.size === 0) {
      console.warn("[notifyMailStepRecipients] Aucun destinataire pour", { mailId, stepNumber, action });
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", [...recipientIds]);

    const profileById = new Map((profiles || []).map((p) => [p.id, p]));

    const assigneeNames = (profiles || [])
      .map((p) => p.full_name || p.email || "Utilisateur")
      .join(", ");

    const isRejection = action === "reject";
    const notificationType: WorkflowNotificationType = isRejection ? "rejection" : "transition";
    const fallbackSubject = isRejection
      ? `Dossier renvoyé — ${stepInfo.name}`
      : `Courrier en attente — ${stepInfo.name}`;

    const results = await Promise.all(
      [...recipientIds].map(async (userId) => {
        const p = profileById.get(userId);
        const assignment = assignments?.find((a) => a.assigned_to === userId);
        const isDefaultOnly =
          !assignment &&
          (userId === fallbackUserId || userId === mailData.assigned_agent_id);
        const accessMode = resolveAccessMode(assignment, isDefaultOnly);

        const { subject, bodyHtml } = buildEmailFromStepTemplates({
          stepNumber,
          stepName: stepInfo.name,
          subjectTemplate: config.subjectTemplate,
          bodyTemplate: config.bodyTemplate,
          bodyViewerTemplate: config.bodyViewerTemplate,
          notificationType,
          recipientName: p?.full_name || "Utilisateur",
          recipientEmail: p?.email || "",
          mailSubject: mailData.subject,
          referenceNumber: mailData.reference_number ?? undefined,
          mailId,
          accessMode,
          assigneesList: assigneeNames,
          assigneesCount: recipientIds.size,
          fallbackTitle: TYPE_TITLES[notificationType] || "Notification ARE App",
          fallbackSubject: formatNotificationSubject(
            config.subjectTemplate,
            {
              stepName: stepInfo.name,
              stepNumber,
              mailSubject: mailData.subject,
              referenceNumber: mailData.reference_number ?? undefined,
            },
            fallbackSubject
          ),
        });

        return sendWorkflowNotificationEmail({
          recipientUserId: userId,
          recipientName: p?.full_name || "Utilisateur",
          subject,
          bodyHtml,
          mailId,
          stepNumber,
          notificationType,
        });
      })
    );

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      console.error(
        `[notifyMailStepRecipients] ${failed.length}/${results.length} e-mails en échec`,
        failed
      );
    } else {
      console.info(
        `[notifyMailStepRecipients] ${results.length} e-mail(s) envoyé(s) — étape ${stepNumber}`
      );
    }
  } catch (err) {
    console.error("notifyMailStepRecipients error:", err);
  }
}

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

    const assigneeNames = (profiles || [])
      .map((p) => p.full_name || p.email || "Utilisateur")
      .join(", ");

    await Promise.all(
      userIds.map(async (userId) => {
        const p = (profiles || []).find((profile) => profile.id === userId);
        const mode = assignments.find((a) => a.assigned_to === userId)?.access_mode;
        const accessMode: "contributor" | "viewer" =
          mode === "viewer" ? "viewer" : "contributor";

        const { subject, bodyHtml } = buildEmailFromStepTemplates({
          stepNumber: 4,
          stepName: stepInfo.name,
          subjectTemplate: config.subjectTemplate,
          bodyTemplate: config.bodyTemplate,
          bodyViewerTemplate: config.bodyViewerTemplate,
          notificationType: "pre_assignment",
          recipientName: p?.full_name || "Utilisateur",
          recipientEmail: p?.email || "",
          mailSubject: mailData.subject,
          referenceNumber: mailData.reference_number ?? undefined,
          mailId,
          accessMode,
          assigneesList: assigneeNames,
          assigneesCount: userIds.length,
          fallbackTitle: UI_LABELS.preAssignmentByDg,
          fallbackSubject: formatNotificationSubject(
            config.subjectTemplate,
            {
              stepName: stepInfo.name,
              stepNumber: 4,
              mailSubject: mailData.subject,
              referenceNumber: mailData.reference_number ?? undefined,
            },
            `${UI_LABELS.preAssignmentByDg} — ${stepInfo.name}`
          ),
        });

        return sendWorkflowNotificationEmail({
          recipientUserId: userId,
          recipientName: p?.full_name || "Utilisateur",
          subject,
          bodyHtml,
          mailId,
          stepNumber: 4,
          notificationType: "pre_assignment",
        });
      })
    );
  } catch (err) {
    console.error("notifyPreAssignmentRecipients error:", err);
  }
}

// Re-export for WorkflowPage editor preview consistency
export { applyNotificationTemplate, getDefaultNotificationSubject, getDefaultNotificationBody };
