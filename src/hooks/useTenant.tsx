import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

interface Tenant {
  id: string;
  name: string;
  domain: string | null;
  is_active: boolean;
  settings: any;
}

export function useTenant() {
  const { profile, role } = useAuth();
  const tenantId = profile?.tenant_id || null;
  const [tenant, setTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setTenant(null);
      return;
    }
    supabase
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .single()
      .then(({ data }) => setTenant(data || null));
  }, [tenantId]);

  /**
   * Apply tenant filter to a Supabase query builder.
   * If user has no tenant, returns the query unchanged (backward compatible).
   */
  function applyTenantFilter<T extends { eq: (col: string, val: string) => T }>(
    query: T
  ): T {
    if (tenantId) {
      return query.eq("tenant_id", tenantId);
    }
    return query;
  }

  const isSuperAdmin = role === "superadmin";

  return {
    tenantId,
    tenant,
    applyTenantFilter,
    /** SuperAdmins can see all tenants' data */
    shouldFilterByTenant: !!tenantId && !isSuperAdmin,
  };
}
