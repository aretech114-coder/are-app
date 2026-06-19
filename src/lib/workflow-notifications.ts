import { supabase } from "@/integrations/supabase/client";
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
  | "rejection"
  | "register";

export type NotificationTriggerSource =
  | "registration"
  | "workflow_advance"
  | "reassign"
  | "admin_test"
  | "sla_checker";

export interface DispatchRecipientResult {
  recipient_user_id: string;
  recipient_email: string | null;
  recipient_name?: string;
  access_mode?: string;
  status: "sent" | "failed" | "skipped";
  skip_reason?: string;
  error_message?: string;
  provider?: string;
  provider_message_id?: string | null;
}

export interface DispatchWorkflowResult {
  success: boolean;
  dry_run?: boolean;
  notify_enabled?: boolean;
  sent: number;
  failed: number;
  skipped: number;
  recipients: DispatchRecipientResult[];
  warning?: string;
  error?: string;
}

export interface DispatchWorkflowParams {
  mail_id: string;
  step_number: number;
  notification_type: WorkflowNotificationType;
  action?: string;
  fallback_user_id?: string | null;
  trigger_source: NotificationTriggerSource;
  dry_run?: boolean;
  force_send?: boolean;
}

export async function dispatchWorkflowNotifications(
  params: DispatchWorkflowParams
): Promise<DispatchWorkflowResult> {
  try {
    const { data, error } = await supabase.functions.invoke("dispatch-workflow-notifications", {
      body: params,
    });

    if (error) {
      console.error("dispatch-workflow-notifications failed:", error.message);
      return {
        success: false,
        sent: 0,
        failed: 0,
        skipped: 0,
        recipients: [],
        error: error.message,
      };
    }

    if (data?.error) {
      return {
        success: false,
        sent: 0,
        failed: 0,
        skipped: 0,
        recipients: [],
        error: data.error,
      };
    }

    return {
      success: data?.success ?? data?.failed === 0,
      dry_run: data?.dry_run,
      notify_enabled: data?.notify_enabled,
      sent: data?.sent ?? 0,
      failed: data?.failed ?? 0,
      skipped: data?.skipped ?? 0,
      recipients: data?.recipients ?? [],
      warning: data?.warning,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("dispatchWorkflowNotifications error:", message);
    return {
      success: false,
      sent: 0,
      failed: 0,
      skipped: 0,
      recipients: [],
      error: message,
    };
  }
}

export async function notifyMailStepRecipients(
  mailId: string,
  stepNumber: number,
  action: string,
  fallbackUserId?: string | null
): Promise<DispatchWorkflowResult> {
  const notificationType: WorkflowNotificationType =
    action === "reject" ? "rejection" : "transition";

  return dispatchWorkflowNotifications({
    mail_id: mailId,
    step_number: stepNumber,
    notification_type: notificationType,
    action,
    fallback_user_id: fallbackUserId ?? null,
    trigger_source: "workflow_advance",
  });
}

export async function notifyRegistrationStep(
  mailId: string,
  stepNumber: number,
  assigneeId?: string | null
): Promise<DispatchWorkflowResult> {
  return dispatchWorkflowNotifications({
    mail_id: mailId,
    step_number: stepNumber,
    notification_type: "register",
    trigger_source: "registration",
    fallback_user_id: assigneeId ?? null,
  });
}

export async function notifyPreAssignmentRecipients(
  mailId: string
): Promise<DispatchWorkflowResult> {
  return dispatchWorkflowNotifications({
    mail_id: mailId,
    step_number: 4,
    notification_type: "pre_assignment",
    trigger_source: "workflow_advance",
  });
}

export async function notifyReassignStep(
  mailId: string,
  stepNumber: number,
  assigneeId: string
): Promise<DispatchWorkflowResult> {
  return dispatchWorkflowNotifications({
    mail_id: mailId,
    step_number: stepNumber,
    notification_type: "transition",
    trigger_source: "reassign",
    fallback_user_id: assigneeId,
  });
}

export { applyNotificationTemplate, getDefaultNotificationSubject, getDefaultNotificationBody };
