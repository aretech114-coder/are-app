import { supabase } from "@/integrations/supabase/client";
import { WORKFLOW_BUCKET, createSignedUrlForPath } from "@/lib/mail-storage";
import type { MailAttachmentMeta } from "@/lib/labels";
import {
  notifyMailStepRecipients,
  notifyPreAssignmentRecipients,
  type DispatchWorkflowResult,
} from "@/lib/workflow-notifications";
import { WORKFLOW_STEP_LABELS, getRoleLabel, ROLE_LABELS } from "@/lib/labels";
import { assertFileWithinUploadLimit, DEFAULT_MAX_UPLOAD_MB } from "@/lib/upload-limits";

export { getRoleLabel, ROLE_LABELS };

export const WORKFLOW_STEPS = [
  { step: 1, name: WORKFLOW_STEP_LABELS[1].name, role: "secretariat", description: WORKFLOW_STEP_LABELS[1].description },
  { step: 2, name: WORKFLOW_STEP_LABELS[2].name, role: "directeur", description: WORKFLOW_STEP_LABELS[2].description },
  { step: 3, name: WORKFLOW_STEP_LABELS[3].name, role: "dircab", description: WORKFLOW_STEP_LABELS[3].description },
  { step: 4, name: WORKFLOW_STEP_LABELS[4].name, role: "conseiller_juridique", description: WORKFLOW_STEP_LABELS[4].description },
  { step: 5, name: WORKFLOW_STEP_LABELS[5].name, role: "dircab", description: WORKFLOW_STEP_LABELS[5].description },
  { step: 6, name: WORKFLOW_STEP_LABELS[6].name, role: "directeur", description: WORKFLOW_STEP_LABELS[6].description },
  { step: 7, name: WORKFLOW_STEP_LABELS[7].name, role: "conseiller_juridique", description: WORKFLOW_STEP_LABELS[7].description },
  { step: 8, name: WORKFLOW_STEP_LABELS[8].name, role: "secretariat", description: WORKFLOW_STEP_LABELS[8].description },
  { step: 9, name: WORKFLOW_STEP_LABELS[9].name, role: "archiviste", description: WORKFLOW_STEP_LABELS[9].description },
] as const;

export type WorkflowStepInfo = typeof WORKFLOW_STEPS[number];

export async function getStepInfoFromDB(stepNumber: number): Promise<{ name: string; description: string | null } | undefined> {
  const { data } = await supabase
    .from("workflow_steps")
    .select("name, description")
    .eq("step_order", stepNumber)
    .eq("is_active", true)
    .single();

  if (data) return { name: data.name, description: data.description };

  const staticStep = WORKFLOW_STEPS.find(s => s.step === stepNumber);
  return staticStep ? { name: staticStep.name, description: staticStep.description } : undefined;
}

export function getStepInfo(stepNumber: number): WorkflowStepInfo | undefined {
  return WORKFLOW_STEPS.find(s => s.step === stepNumber);
}

export function getStepLabel(stepNumber: number): string {
  const step = getStepInfo(stepNumber);
  return step ? `Étape ${step.step}: ${step.name}` : `Étape ${stepNumber}`;
}

export function getStepColor(stepNumber: number): string {
  const colors: Record<number, string> = {
    1: "bg-blue-500/10 text-blue-600 border-blue-200",
    2: "bg-purple-500/10 text-purple-600 border-purple-200",
    3: "bg-amber-500/10 text-amber-600 border-amber-200",
    4: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    5: "bg-orange-500/10 text-orange-600 border-orange-200",
    6: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
    7: "bg-teal-500/10 text-teal-600 border-teal-200",
    8: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
    9: "bg-slate-500/10 text-slate-600 border-slate-200",
  };
  return colors[stepNumber] || "bg-muted text-muted-foreground";
}

export interface AdvanceOptions {
  skipAutoAssign?: boolean;
  assigneeIds?: string[];
  viewerIds?: string[];
}

interface AdvanceResult {
  success: boolean;
  newStep: number;
  assignedTo?: string | null;
  ministreAbsent?: boolean;
  error?: string;
  notifications?: DispatchWorkflowResult;
}

export async function advanceWorkflow(
  mailId: string,
  currentStep: number,
  action: string,
  performedBy: string,
  notes?: string,
  options?: AdvanceOptions
): Promise<AdvanceResult> {
  const { data, error } = await supabase.rpc(
    'advance_workflow_step' as any,
    {
      _mail_id: mailId,
      _action: action,
      _performed_by: performedBy,
      _notes: notes || null,
      _skip_auto_assign: options?.skipAutoAssign || false,
      _assignee_ids: options?.assigneeIds || null,
      _viewer_ids: options?.viewerIds || null,
    } as any
  );

  if (error) {
    return { success: false, newStep: currentStep, error: error.message };
  }

  const result = data as any;
  if (!result?.success) {
    return { success: false, newStep: currentStep, error: result?.error || 'Erreur inconnue' };
  }

  const newStep = result.new_step as number;
  const assignedTo = result.assigned_to as string | null;

  let notifications = await notifyMailStepRecipients(mailId, newStep, action, assignedTo);

  if (
    currentStep === 2 &&
    ((options?.assigneeIds?.length ?? 0) > 0 || (options?.viewerIds?.length ?? 0) > 0)
  ) {
    const preAssignment = await notifyPreAssignmentRecipients(mailId);
    notifications = mergeDispatchResults(notifications, preAssignment);
  }

  return {
    success: true,
    newStep,
    assignedTo,
    ministreAbsent: result.ministre_absent,
    notifications,
  };
}

const DEFAULT_MAIL_STATUSES = ["pending", "in_progress"] as const;

export async function listMyMails(statuses?: string[]): Promise<any[]> {
  const statusList = statuses ?? [...DEFAULT_MAIL_STATUSES];
  const { data, error } = await (supabase as any).rpc("list_my_mails", {
    _statuses: statusList,
  });
  if (error) {
    console.error("list_my_mails RPC failed:", error.message);
    throw new Error(
      error.message.includes("Could not find the function")
        ? "Fonction list_my_mails absente — appliquez les migrations SQL workflow sur Supabase."
        : `Impossible de charger vos courriers : ${error.message}`
    );
  }
  return (data as any[]) || [];
}

export interface Step4TreatmentResult {
  success: boolean;
  allCompleted?: boolean;
  remaining?: number;
  newStep?: number;
  advanced?: boolean;
  error?: string;
  notifications?: DispatchWorkflowResult;
}

export async function submitStep4Treatment(
  mailId: string,
  body: string | null,
  attachmentUrls: { url: string; name?: string }[] = [],
  notes?: string
): Promise<Step4TreatmentResult> {
  const { data, error } = await (supabase as any).rpc("submit_step4_treatment", {
    _mail_id: mailId,
    _body: body,
    _attachment_urls: attachmentUrls,
    _notes: notes ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as Record<string, unknown>;
  if (!result?.success) {
    return { success: false, error: (result?.error as string) || "Erreur inconnue" };
  }

  let notifications: DispatchWorkflowResult | undefined;
  if (result.advanced && typeof result.new_step === "number") {
    const assignedTo =
      typeof result.assigned_to === "string" ? result.assigned_to : null;
    notifications = await notifyMailStepRecipients(
      mailId,
      result.new_step as number,
      "complete",
      assignedTo
    );
  }

  return {
    success: true,
    allCompleted: result.all_completed as boolean | undefined,
    remaining: result.remaining as number | undefined,
    newStep: result.new_step as number | undefined,
    advanced: result.advanced as boolean | undefined,
    notifications,
  };
}

export interface Step7AckResult {
  success: boolean;
  allAcknowledged?: boolean;
  remaining?: number;
  newStep?: number;
  advanced?: boolean;
  error?: string;
  notifications?: DispatchWorkflowResult;
}

export async function submitStep7Acknowledgement(
  mailId: string,
  notes?: string
): Promise<Step7AckResult> {
  const { data, error } = await (supabase as any).rpc("submit_step7_acknowledgement", {
    _mail_id: mailId,
    _notes: notes ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as Record<string, unknown>;
  if (!result?.success) {
    return { success: false, error: (result?.error as string) || "Erreur inconnue" };
  }

  let notifications: DispatchWorkflowResult | undefined;
  if (result.advanced && typeof result.new_step === "number") {
    const assignedTo =
      typeof result.assigned_to === "string" ? result.assigned_to : null;
    notifications = await notifyMailStepRecipients(
      mailId,
      result.new_step as number,
      "complete",
      assignedTo
    );
  }

  return {
    success: true,
    allAcknowledged: result.all_acknowledged as boolean | undefined,
    remaining: result.remaining as number | undefined,
    newStep: result.new_step as number | undefined,
    advanced: result.advanced as boolean | undefined,
    notifications,
  };
}

export type MailDocumentSubfolder =
  | "annotations"
  | "treatments"
  | "validations"
  | "deposits";

export function mailDocumentSubfolderForStep(step: number): MailDocumentSubfolder {
  if (step === 4) return "treatments";
  if (step === 6) return "validations";
  if (step === 8) return "deposits";
  return "annotations";
}

export async function uploadMailDocument(
  mailId: string,
  file: File,
  subfolder: MailDocumentSubfolder = "treatments",
  maxUploadMb: number = DEFAULT_MAX_UPLOAD_MB
): Promise<Pick<MailAttachmentMeta, "url" | "name" | "path" | "bucket">> {
  assertFileWithinUploadLimit(file, maxUploadMb);

  const sanitizedName = file.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
  const filePath = `${subfolder}/${mailId}/${Date.now()}_${sanitizedName}`;
  const { error: uploadErr } = await supabase.storage
    .from(WORKFLOW_BUCKET)
    .upload(filePath, file);
  if (uploadErr) throw uploadErr;

  const url = await createSignedUrlForPath(WORKFLOW_BUCKET, filePath);
  if (!url) throw new Error("Impossible de générer l'URL du fichier");

  return { url, name: file.name, path: filePath, bucket: WORKFLOW_BUCKET };
}

function mergeDispatchResults(
  a: DispatchWorkflowResult,
  b: DispatchWorkflowResult
): DispatchWorkflowResult {
  return {
    success: a.success && b.success,
    sent: a.sent + b.sent,
    failed: a.failed + b.failed,
    skipped: a.skipped + b.skipped,
    recipients: [...a.recipients, ...b.recipients],
    error: a.error || b.error,
    warning: a.warning || b.warning,
  };
}

/** Affiche un toast si des e-mails workflow ont échoué après avancement. */
export function formatNotificationFailureMessage(notifications?: DispatchWorkflowResult): string | null {
  if (!notifications) return null;
  if (notifications.error) return notifications.error;
  if (notifications.failed > 0) {
    return `Courrier avancé, mais ${notifications.failed} e-mail(s) n'ont pas pu être envoyés. Consultez Intégrations → Notifications workflow.`;
  }
  const noEmailRecipients = notifications.recipients?.filter((r) => r.skip_reason === "no_email") ?? [];
  if (noEmailRecipients.length > 0) {
    const names = noEmailRecipients
      .map((r) => r.recipient_name || "Utilisateur")
      .join(", ");
    return `Notification e-mail impossible : ${names} n'a pas d'e-mail dans son profil.`;
  }
  if (notifications.warning === "no_recipients") {
    return "Courrier avancé, mais aucun destinataire e-mail n'a été trouvé pour cette étape.";
  }
  return null;
}

/** Message de succès après enregistrement registre si au moins un e-mail est parti. */
export function formatRegistrationEmailSuccess(
  notifications?: DispatchWorkflowResult,
  stepNumber?: number
): string | null {
  if (!notifications || notifications.sent <= 0) return null;
  return `E-mail de notification envoyé au responsable de l'étape ${stepNumber ?? "—"}.`;
}
