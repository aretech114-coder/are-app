import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  canAccessWorkflowTracking,
  fetchWorkflowTrackingGrants,
  type AppRole,
} from "@/lib/workflow-tracking";

export function useWorkflowTrackingAccess() {
  const { role } = useAuth();

  const grantsQuery = useQuery({
    queryKey: ["workflow-tracking-grants"],
    queryFn: fetchWorkflowTrackingGrants,
    staleTime: 60_000,
  });

  const grantedRoles = (grantsQuery.data ?? []) as AppRole[];
  const hasGlobalTracking = canAccessWorkflowTracking(role, grantedRoles);

  return {
    grantedRoles,
    hasGlobalTracking,
    loading: grantsQuery.isLoading,
    refetchGrants: grantsQuery.refetch,
  };
}
