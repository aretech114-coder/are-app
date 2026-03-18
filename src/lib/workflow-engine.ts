import { supabase } from "@/integrations/supabase/client";
import { sendWorkflowNotificationEmail, isStepNotificationEnabled } from "@/lib/workflow-notifications";

export const WORKFLOW_STEPS = [
  { step: 1, name: "Réception", role: "secretariat", description: "Scan, attribution ID, saisie métadonnées" },
  { step: 2, name: "Routage Hiérarchique", role: "ministre", description: "Dispatch: Ministre → Dircab → Dircaba" },
  { step: 3, name: "Filtrage Stratégique", role: "dircab", description: "Validation des instructions et réaffectation" },
  { step: 4, name: "Traitement", role: "conseiller_juridique", description: "Rédaction notes techniques ou réponses" },
  { step: 5, name: "Vérification", role: "dircab", description: "Vérification par le DirCab avant validation" },
  { step: 6, name: "Validation Ministre", role: "ministre", description: "Validation finale ou rejet par le Ministre" },
  { step: 7, name: "Consultation Conseillers", role: "conseiller_juridique", description: "Les conseillers consultent la validation de leur note technique" },
  { step: 8, name: "Retour & Preuve de Dépôt", role: "secretariat", description: "Retour du document avec preuve de dépôt et scan" },
  { step: 9, name: "Archivage Final", role: "secretariat", description: "Clôture définitive et transfert au dépôt central" },
] as const;

export type WorkflowStepInfo = typeof WORKFLOW_STEPS[number];

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
  /** Skip auto-assignment for dynamic steps */
  skipAutoAssign?: boolean;
  /** Explicit assignee IDs for dynamic steps (4, 7) */
  assigneeIds?: string[];
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
 * All transitions happen atomically in the database, eliminating RLS issues.
 * The RPC handles: step calculation, step 3 bypass (ministre absent),
 * step 7 skip (non note_technique), assignments, and notifications.
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

  // Send email notification (non-blocking, stays client-side)
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

/**
 * Send email notification for a workflow step transition (non-blocking).
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

    const stepInfo = getStepInfo(newStep);
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

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    superadmin: "Super Admin",
    admin: "Administrateur",
    supervisor: "Superviseur",
    agent: "Agent",
    ministre: "Ministre",
    dircab: "Directeur de Cabinet",
    dircaba: "Directeur de Cabinet Adjoint",
    conseiller_juridique: "Conseiller Juridique",
    secretariat: "Secrétariat",
  };
  return labels[role] || role;
}
