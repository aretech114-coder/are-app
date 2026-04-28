import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WorkflowFallback {
  id: string;
  step_id: string;
  condition_key: string;
  fallback_user_ids: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const FALLBACK_CONDITIONS = [
  {
    key: "ministre_absent",
    label: "Ministre absent",
    description: "Le courrier est marqué « Ministre absent ». Le suppléant prend le relais sur cette étape.",
  },
  {
    key: "responsible_unavailable",
    label: "Responsable principal indisponible",
    description: "Le responsable principal est marqué indisponible (absence/voyage/congé).",
  },
  {
    key: "dg_absent",
    label: "DG absent",
    description: "Le Directeur Général est indisponible. Le DGA ou un autre suppléant prend le relais.",
  },
] as const;

const KEY = ["workflow_step_fallbacks"];

export function useWorkflowFallbacks() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_step_fallbacks" as any)
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data || []) as unknown) as WorkflowFallback[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertFallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      step_id: string;
      condition_key: string;
      fallback_user_ids: string[];
      is_active?: boolean;
      created_by?: string | null;
    }) => {
      const { error } = await supabase
        .from("workflow_step_fallbacks" as any)
        .upsert(payload as any, { onConflict: "step_id,condition_key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteFallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("workflow_step_fallbacks" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}