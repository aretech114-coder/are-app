import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WorkflowStep {
  id: string;
  step_order: number;
  name: string;
  description: string | null;
  is_active: boolean;
  conditions: Record<string, any>;
  responsible_role: string | null;
  action_labels: Record<string, any>;
  assignment_mode: string;
  color_class: string;
  created_at: string | null;
  updated_at: string | null;
}

const WORKFLOW_STEPS_KEY = ["workflow_steps"];

async function fetchWorkflowSteps(): Promise<WorkflowStep[]> {
  const { data, error } = await supabase
    .from("workflow_steps")
    .select("*")
    .order("step_order", { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as WorkflowStep[];
}

export function useWorkflowSteps() {
  return useQuery({
    queryKey: WORKFLOW_STEPS_KEY,
    queryFn: fetchWorkflowSteps,
    staleTime: 30_000,
  });
}

/** Only active steps, in order */
export function useActiveWorkflowSteps() {
  const query = useWorkflowSteps();
  const activeSteps = query.data?.filter((s) => s.is_active) ?? [];
  return { ...query, data: activeSteps };
}

/** Get step info by step_order */
export function getStepFromList(steps: WorkflowStep[], stepOrder: number) {
  return steps.find((s) => s.step_order === stepOrder);
}

/** Get color class for a step from the dynamic list */
export function getStepColorFromList(steps: WorkflowStep[], stepOrder: number): string {
  const step = getStepFromList(steps, stepOrder);
  return step?.color_class || "bg-muted text-muted-foreground";
}

// ── Mutations ──

export function useUpdateWorkflowStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string } & Partial<Omit<WorkflowStep, "id">>) => {
      const { id, ...updates } = payload;
      const { error } = await supabase
        .from("workflow_steps")
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKFLOW_STEPS_KEY }),
  });
}

export function useCreateWorkflowStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      step_order: number;
      name: string;
      description?: string;
      responsible_role?: string;
      assignment_mode?: string;
      color_class?: string;
      conditions?: Record<string, any>;
    }) => {
      const { error } = await supabase
        .from("workflow_steps")
        .insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKFLOW_STEPS_KEY }),
  });
}

export function useDeleteWorkflowStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("workflow_steps")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKFLOW_STEPS_KEY }),
  });
}

export function useReorderWorkflowSteps() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { id: string; step_order: number }[]) => {
      // Sequential updates to avoid unique constraint conflicts
      // First set all to negative values, then set final values
      for (let i = 0; i < updates.length; i++) {
        const { error } = await supabase
          .from("workflow_steps")
          .update({ step_order: -(i + 1000) } as any)
          .eq("id", updates[i].id);
        if (error) throw error;
      }
      for (const u of updates) {
        const { error } = await supabase
          .from("workflow_steps")
          .update({ step_order: u.step_order } as any)
          .eq("id", u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKFLOW_STEPS_KEY }),
  });
}
