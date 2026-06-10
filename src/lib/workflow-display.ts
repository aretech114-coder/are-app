import type { WorkflowStep } from "@/hooks/useWorkflowSteps";

const DG_ROLES = new Set(["directeur", "ministre", "dg", "autorite_1"]);

export function isDgRole(role: string | null | undefined): boolean {
  return !!role && DG_ROLES.has(role);
}

/** Numéro visuel É1, É2… parmi les étapes actives uniquement. */
export function getActiveStepIndex(
  activeSteps: WorkflowStep[],
  stepOrder: number
): number | null {
  const idx = activeSteps.findIndex((s) => s.step_order === stepOrder);
  return idx >= 0 ? idx + 1 : null;
}

/** Numéro visuel workflow (É1 = réception ; É2 = 1re étape active). */
export function getVisualWorkflowStepNumber(
  activeSteps: WorkflowStep[],
  stepOrder: number
): number {
  const idx = activeSteps.findIndex((s) => s.step_order === stepOrder);
  return idx >= 0 ? idx + 2 : stepOrder;
}

export function getDisplayStepLabel(
  activeSteps: WorkflowStep[],
  stepOrder: number
): string {
  const visual = getVisualWorkflowStepNumber(activeSteps, stepOrder);
  const step = activeSteps.find((s) => s.step_order === stepOrder);
  if (step) {
    return `É${visual} — ${step.name}`;
  }
  return `Étape ${stepOrder}`;
}

/** Afficher un bloc lié à une étape workflow (masque 3, 5, 7 si inactives). */
export function shouldShowWorkflowBlock(
  stepOrder: number,
  currentStep: number,
  activeSteps: WorkflowStep[]
): boolean {
  const isActive = activeSteps.some((s) => s.step_order === stepOrder);
  if (!isActive) return false;
  return currentStep >= stepOrder;
}

/** Masquer la carte « Traitement DG » redondante quand le DG traite à l'étape 2. */
export function shouldHideDgSummaryCard(
  currentStep: number,
  role: string | null | undefined
): boolean {
  return currentStep === 2 && isDgRole(role);
}

/**
 * Panneau contributions : DG dès l'étape 2 ; tous les collaborateurs assignés dès l'étape 4
 * (contributors + viewers voient les traitements soumis des uns et des autres).
 */
export function shouldShowContributionsPanel(
  currentStep: number,
  role: string | null | undefined,
  hasWorkflowTrackingAccess?: boolean
): boolean {
  if (hasWorkflowTrackingAccess && currentStep >= 4) return true;
  if (isDgRole(role) && currentStep >= 2) return true;
  return currentStep >= 4;
}

/** Brouillons visibles : DG voit tout ; les autres ne voient que le leur. */
export function filterVisibleContributions<
  T extends { status: string; user_id: string }
>(
  contributions: T[],
  opts: { showAllDrafts?: boolean; currentUserId?: string | null }
): T[] {
  const { showAllDrafts = false, currentUserId } = opts;
  return contributions.filter(
    (c) =>
      c.status === "submitted" ||
      showAllDrafts ||
      (!!currentUserId && c.user_id === currentUserId)
  );
}

export const statusLabels: Record<string, string> = {
  pending: "En attente",
  in_progress: "En cours",
  processed: "Traité",
  archived: "Archivé",
};

export const priorityLabels: Record<string, string> = {
  low: "Faible",
  normal: "Normal",
  high: "Élevée",
  urgent: "Urgent",
};

/** Types IA disponibles par étape workflow. */
export const AI_OPTIONS_BY_STEP: Record<
  number,
  { value: string; label: string }[]
> = {
  2: [
    { value: "resume", label: "Résumé du dossier" },
    { value: "note_orientation", label: "Note d'orientation" },
  ],
  4: [
    { value: "note_technique", label: "Note technique" },
    { value: "resume", label: "Résumé" },
  ],
  6: [
    { value: "resume", label: "Résumé validation" },
    { value: "note_orientation", label: "Note d'orientation" },
  ],
  8: [
    { value: "accuse_reception", label: "Accusé de réception" },
    { value: "resume", label: "Résumé retour" },
  ],
};

export const AI_OPTIONS_RECEPTION = [
  { value: "accuse_reception", label: "Accueil / accusé de réception" },
  { value: "resume", label: "Résumé" },
];

export function getAiOptionsForStep(currentStep: number) {
  if (currentStep <= 1) return AI_OPTIONS_RECEPTION;
  return AI_OPTIONS_BY_STEP[currentStep] ?? [
    { value: "resume", label: "Résumé" },
    { value: "note_technique", label: "Note technique" },
    { value: "accuse_reception", label: "Accusé de réception" },
  ];
}
