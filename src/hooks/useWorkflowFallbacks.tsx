import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { UI_LABELS } from "@/lib/labels";
import { useMemo } from "react";

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
    label: "DG absent",
    description: "Le courrier est marqué « DG absent ». Le suppléant prend le relais sur cette étape.",
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

/**
 * Hook returning fallback conditions with labels/descriptions
 * interpolated from the configurable authority title.
 */
export function useFallbackConditions() {
  const { settings } = useSiteSettings();
  const authShort = settings.authority_title_short || UI_LABELS.dgShort;
  const authLong = settings.authority_title_long || UI_LABELS.dg;
  return useMemo(
    () => [
      {
        key: "ministre_absent",
        label: `${authShort} absent`,
        description: `Le courrier est marqué « ${authShort} absent ». Le suppléant prend le relais sur cette étape.`,
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
    ] as const,
    [authShort, authLong]
  );
}

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