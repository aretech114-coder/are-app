import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useMailCircuitLabel(targetServiceId: string | null | undefined) {
  return useQuery({
    queryKey: ["mail-circuit-label", targetServiceId],
    queryFn: async () => {
      if (!targetServiceId) return null;
      const { data } = await supabase
        .from("services_concernes")
        .select("label")
        .eq("id", targetServiceId)
        .maybeSingle();
      return data?.label ?? null;
    },
    enabled: !!targetServiceId,
  });
}
