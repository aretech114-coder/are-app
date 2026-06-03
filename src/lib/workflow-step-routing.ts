import { supabase } from "@/integrations/supabase/client";

export type WorkflowRoutingContext = {
  /** Toutes les étapes actives (ordre croissant) */
  activeStepOrders: number[];
  /** Étape 1 encore active dans la config */
  step1Active: boolean;
  /** Première étape active (ex. 2 si étape 1 désactivée) */
  firstActiveStep: number;
  /** Étape cible après enregistissement : première active ≥ 2, sinon première active */
  routingStep: number;
};

/** Lit la config workflow_steps pour déterminer le bypass des étapes désactivées. */
export async function getWorkflowRoutingContext(): Promise<WorkflowRoutingContext> {
  const { data, error } = await supabase
    .from("workflow_steps")
    .select("step_order, is_active")
    .order("step_order", { ascending: true });

  if (error) throw error;

  const activeStepOrders = (data || [])
    .filter((s) => s.is_active)
    .map((s) => s.step_order);

  const firstActiveStep = activeStepOrders[0] ?? 2;
  const routingStep =
    activeStepOrders.find((o) => o >= 2) ?? firstActiveStep;
  const step1Active = activeStepOrders.includes(1);

  return {
    activeStepOrders,
    step1Active,
    firstActiveStep,
    routingStep,
  };
}
