import { supabase } from "@/integrations/supabase/client";
import { WORKFLOW_BUCKET, createSignedUrlForPath } from "@/lib/mail-storage";
import type { MailAttachmentMeta } from "@/lib/labels";
import { sendWorkflowNotificationEmail, isStepNotificationEnabled } from "@/lib/workflow-notifications";
import { WORKFLOW_STEP_LABELS, getRoleLabel, ROLE_LABELS } from "@/lib/labels";

export { getRoleLabel, ROLE_LABELS };

// ── Static fallback (kept for backward compatibility) ──
export const WORKFLOW_STEPS = [
  { step: 1, name: WORKFLOW_STEP_LABELS[1].name, role: "secretariat", description: WORKFLOW_STEP_LABELS[1].description },
  { step: 2, name: WORKFLOW_STEP_LABELS[2].name, role: "directeur", description: WORKFLOW_STEP_LABELS[2].description },
  { step: 3, name: WORKFLOW_STEP_LABELS[3].name, role: "dircab", description: WORKFLOW_STEP_LABELS[3].description },
  { step: 4, name: WORKFLOW_STEP_LABELS[4].name, role: "conseiller_juridique", description: WORKFLOW_STEP_LABELS[4].description },
  { step: 5, name: WORKFLOW_STEP_LABELS[5].name, role: "dircab", description: WORKFLOW_STEP_LABELS[5].description },
  { step: 6, name: WORKFLOW_STEP_LABELS[6].name, role: "directeur", description: WORKFLOW_STEP_LABELS[6].description },
  { step: 7, name: WORKFLOW_STEP_LABELS[7].name, role: "conseiller_juridique", description: WORKFLOW_STEP_LABELS[7].description },
  { step: 8, name: WORKFLOW_STEP_LABELS[8].name, role: "secretariat", description: WORKFLOW_STEP_LABELS[8].description },
  { step: 9, name: WORKFLOW_STEP_LABELS[9].name, role: "secretariat", description: WORKFLOW_STEP_LABELS[9].description },
] as const;

export type WorkflowStepInfo = typeof WORKFLOW_STEPS[number];

// ── Dynamic DB-aware helpers ──

/** Fetch step info from DB, fallback to static */
export async function getStepInfoFromDB(stepNumber: number): Promise<{ name: string; description: string | null } | undefined> {
  const { data } = await supabase
    .from("workflow_steps")
    .select("name, description")
    .eq("step_order", stepNumber)
    .eq("is_active", true)
    .single();

  if (data) return { name: data.name, description: data.description };

  // Fallback to static
  const staticStep = WORKFLOW_STEPS.find(s => s.step === stepNumber);
  return staticStep ? { name: staticStep.name, description: staticStep.description } : undefined;
}

// ── Static helpers (still used across UI) ──

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

// ── Advance workflow ──

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
}

/**
 * Advance the workflow by calling the SECURITY DEFINER RPC.
 * The RPC now reads workflow_steps dynamically for step calculation and skip conditions.
 */
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

  if (assignedTo) {
    sendStepEmailNotification(newStep, assignedTo, mailId, action).catch(console.error);
  }

  return {
    success: true,
    newStep,
    assignedTo,
    ministreAbsent: result.ministre_absent,
  };
}

const DEFAULT_MAIL_STATUSES = ["pending", "in_progress"] as const;

/** Mails visible to current user (RLS + can_access_mail). Falls back to direct query if RPC unavailable. */
export async function listMyMails(statuses?: string[]) {
  const statusList = statuses ?? [...DEFAULT_MAIL_STATUSES];
  const { data, error } = await supabase.rpc("list_my_mails", {
    _statuses: statusList,
  });
  if (!error) return data || [];

  const { data: rows, error: queryError } = await supabase
    .from("mails")
    .select("*")
    .in("status", statusList)
    .order("created_at", { ascending: false });
  if (queryError) throw queryError;
  return rows ?? [];
}

export interface Step4TreatmentResult {
  success: boolean;
  allCompleted?: boolean;
  remaining?: number;
  newStep?: number;
  advanced?: boolean;
  error?: string;
}

/** Atomic step-4 treatment submission (contribution + assignment + optional auto-advance). */
export async function submitStep4Treatment(
  mailId: string,
  body: string | null,
  attachmentUrls: { url: string; name?: string }[] = [],
  notes?: string
): Promise<Step4TreatmentResult> {
  const { data, error } = await supabase.rpc("submit_step4_treatment", {
    _mail_id: mailId,
    _body: body,
    _attachment_urls: attachmentUrls,
    _notes: notes ?? null,
  } as any);

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as Record<string, unknown>;
  if (!result?.success) {
    return { success: false, error: (result?.error as string) || "Erreur inconnue" };
  }

  return {
    success: true,
    allCompleted: result.all_completed as boolean | undefined,
    remaining: result.remaining as number | undefined,
    newStep: result.new_step as number | undefined,
    advanced: result.advanced as boolean | undefined,
  };
}

export interface Step7AckResult {
  success: boolean;
  allAcknowledged?: boolean;
  remaining?: number;
  newStep?: number;
  advanced?: boolean;
  error?: string;
}

/** Atomic step-7 acknowledgement (assignment + optional auto-advance). */
export async function submitStep7Acknowledgement(
  mailId: string,
  notes?: string
): Promise<Step7AckResult> {
  const { data, error } = await supabase.rpc("submit_step7_acknowledgement", {
    _mail_id: mailId,
    _notes: notes ?? null,
  } as any);

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as Record<string, unknown>;
  if (!result?.success) {
    return { success: false, error: (result?.error as string) || "Erreur inconnue" };
  }

  return {
    success: true,
    allAcknowledged: result.all_acknowledged as boolean | undefined,
    remaining: result.remaining as number | undefined,
    newStep: result.new_step as number | undefined,
    advanced: result.advanced as boolean | undefined,
  };
}

/** Upload a workflow attachment to mail-documents bucket. */
export async function uploadMailDocument(
  mailId: string,
  file: File,
  subfolder: "annotations" | "treatments" = "treatments"
): Promise<Pick<MailAttachmentMeta, "url" | "name" | "path" | "bucket">> {
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

/**
 * Send email notification — now uses dynamic DB step info.
 */
async function sendStepEmailNotification(
  newStep: number,
  assignedTo: string,
  mailId: string,
  action: string
) {
  try {
    const emailEnabled = await isStepNotificationEnabled(newStep);
    if (!emailEnabled) return;

    const stepInfo = await getStepInfoFromDB(newStep);
    if (!stepInfo) return;

    const [{ data: recipientProfile }, { data: mailData }] = await Promise.all([
      supabase.from("profiles").select("full_name, email").eq("id", assignedTo).single(),
      supabase.from("mails").select("subject, reference_number").eq("id", mailId).single(),
    ]);

    if (!recipientProfile?.email || !mailData) return;

    const isRejection = action === "reject";
    await sendWorkflowNotificationEmail({
      recipientEmail: recipientProfile.email,
      recipientName: recipientProfile.full_name || "Utilisateur",
      subject: `${isRejection ? "🔙 Dossier renvoyé" : "📬 Courrier en attente"} — ${stepInfo.name}`,
      mailId,
      stepNumber: newStep,
      stepName: stepInfo.name,
      mailSubject: mailData.subject,
      referenceNumber: mailData.reference_number,
      notificationType: isRejection ? "rejection" : "transition",
    });
  } catch (err) {
    console.error("Email notification error (non-blocking):", err);
  }
}

