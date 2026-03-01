import { supabase } from "@/integrations/supabase/client";

export const WORKFLOW_STEPS = [
  { step: 1, name: "Réception", role: "secretariat", description: "Scan, attribution ID, saisie métadonnées" },
  { step: 2, name: "Routage Hiérarchique", role: "ministre", description: "Dispatch: Ministre → Dircab → Dircaba" },
  { step: 3, name: "Filtrage Stratégique", role: "dircab", description: "Validation des instructions et réaffectation" },
  { step: 4, name: "Traitement", role: "conseiller_juridique", description: "Rédaction notes techniques ou réponses" },
  { step: 5, name: "Vérification", role: "dircab", description: "Vérification par le DirCab avant validation" },
  { step: 6, name: "Validation Ministre", role: "ministre", description: "Validation finale ou rejet par le Ministre" },
  { step: 7, name: "Archivage", role: "secretariat", description: "Clôture et transfert au dépôt central" },
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
    7: "bg-slate-500/10 text-slate-600 border-slate-200",
  };
  return colors[stepNumber] || "bg-muted text-muted-foreground";
}

export async function advanceWorkflow(
  mailId: string,
  currentStep: number,
  action: string,
  performedBy: string,
  notes?: string
): Promise<{ success: boolean; newStep: number; error?: string }> {
  let newStep = currentStep;
  let newStatus: string = "in_progress";

  switch (action) {
    case "approve":
      newStep = currentStep + 1;
      break;
    case "reject":
      // Step 5 or 6 rejection goes back to step 4
      if (currentStep === 5 || currentStep === 6) newStep = 4;
      else newStep = currentStep - 1;
      break;
    case "complete":
      newStep = currentStep + 1;
      break;
    case "archive":
      newStep = 7;
      newStatus = "archived";
      break;
    default:
      newStep = currentStep + 1;
  }

  if (newStep > 7) {
    newStep = 7;
    newStatus = "archived";
  }

  if (newStep === 7) {
    newStatus = "archived";
  }

  // Record the transition
  const { error: transError } = await supabase.from("workflow_transitions").insert({
    mail_id: mailId,
    from_step: currentStep,
    to_step: newStep,
    action,
    performed_by: performedBy,
    notes: notes || null,
  });

  if (transError) return { success: false, newStep: currentStep, error: transError.message };

  // Fetch SLA for new step
  const { data: slaData } = await supabase
    .from("sla_config")
    .select("default_hours")
    .eq("step_number", newStep)
    .single();

  const deadlineHours = slaData?.default_hours || 48;
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + deadlineHours);

  // Update mail
  const updateData: Record<string, any> = {
    current_step: newStep,
    status: newStatus as any,
    deadline_at: deadline.toISOString(),
  };

  if (newStep === 7) {
    updateData.workflow_completed_at = new Date().toISOString();
  }

  const { error: mailError } = await supabase
    .from("mails")
    .update(updateData)
    .eq("id", mailId);

  if (mailError) return { success: false, newStep: currentStep, error: mailError.message };

  return { success: true, newStep };
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
