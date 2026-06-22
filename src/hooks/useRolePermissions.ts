import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface RolePermissionRow {
  resource_key: string;
  action: string;
  is_allowed: boolean;
}

export function useRolePermissions() {
  const { role } = useAuth();

  const { data: matrix = [], isLoading } = useQuery({
    queryKey: ["role-permissions", role],
    queryFn: async (): Promise<RolePermissionRow[]> => {
      if (!role || role === "superadmin") return [];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("resource_key, action, is_allowed")
        .eq("role", role);
      if (error) {
        console.warn("role_permissions unavailable (migration AA ?):", error.message);
        return [];
      }
      return data ?? [];
    },
    enabled: !!role && role !== "superadmin",
    staleTime: 60_000,
  });

  const can = useCallback(
    (resource: string, action: string): boolean => {
      if (!role) return false;
      if (role === "superadmin") return true;
      const row = matrix.find((r) => r.resource_key === resource && r.action === action);
      if (row) return row.is_allowed;
      // Fallback legacy : permission absente → autoriser (pas de régression)
      return true;
    },
    [role, matrix]
  );

  return { can, loading: isLoading, role };
}
