import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type TrackingMail = Database["public"]["Tables"]["mails"]["Row"];

export const TRACKING_BASE_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "secretariat",
  "dg",
  "directeur",
];

/** Rôles direction avec vue restreinte `list_my_mails` (hors pilotage global natif). */
export const SUIVI_RESTRICTED_ROLES: AppRole[] = [
  "ministre",
  "directeur",
  "dircab",
  "dircaba",
  "autorite_1",
  "autorite_2",
  "autorite_3",
  "autorite_4",
  "dga",
];

export const DEFAULT_TRACKING_STATUSES = ["pending", "in_progress", "processed"] as const;

export interface TrackingFilters {
  statuses?: string[];
  step?: number | null;
  priority?: string | null;
  overdueOnly?: boolean;
  search?: string | null;
}

export interface TrackingSummary {
  total: number;
  overdue: number;
  urgent: number;
  by_step: Record<string, number>;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
}

export interface TrackingPageResult {
  mails: TrackingMail[];
  total: number;
}

function rpcFilters(filters: TrackingFilters) {
  return {
    _statuses: filters.statuses ?? [...DEFAULT_TRACKING_STATUSES],
    _step: filters.step ?? null,
    _priority: filters.priority ?? null,
    _overdue_only: filters.overdueOnly ?? false,
    _search: filters.search?.trim() || null,
  };
}

export function canAccessWorkflowTracking(
  role: string | null | undefined,
  grantedRoles: AppRole[] = []
): boolean {
  if (!role) return false;
  if (TRACKING_BASE_ROLES.includes(role as AppRole)) return true;
  return grantedRoles.includes(role as AppRole);
}

export function canAccessSuiviPage(
  role: string | null | undefined,
  grantedRoles: AppRole[] = []
): boolean {
  if (!role) return false;
  if (canAccessWorkflowTracking(role, grantedRoles)) return true;
  if (role === "superadmin" || role === "admin") return true;
  return SUIVI_RESTRICTED_ROLES.includes(role as AppRole);
}

export function canSeeSuiviNav(
  role: string | null | undefined,
  grantedRoles: AppRole[] = []
): boolean {
  return canAccessSuiviPage(role, grantedRoles);
}

export async function fetchWorkflowTrackingGrants(): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from("workflow_tracking_role_grants")
    .select("role");

  if (error) {
    console.error("fetchWorkflowTrackingGrants failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => row.role);
}

export async function grantWorkflowTrackingRole(role: AppRole): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("workflow_tracking_role_grants").upsert({
    role,
    granted_by: userData.user?.id ?? null,
  });

  if (error) throw error;
}

export async function revokeWorkflowTrackingRole(role: AppRole): Promise<void> {
  const { error } = await supabase
    .from("workflow_tracking_role_grants")
    .delete()
    .eq("role", role);

  if (error) throw error;
}

export async function fetchTrackingMails(
  filters: TrackingFilters,
  page: number,
  pageSize: number
): Promise<TrackingPageResult> {
  const offset = Math.max(0, (page - 1) * pageSize);
  const params = rpcFilters(filters);

  const [listRes, countRes] = await Promise.all([
    supabase.rpc("list_workflow_tracking_mails", {
      ...params,
      _limit: pageSize,
      _offset: offset,
    }),
    supabase.rpc("count_workflow_tracking_mails", params),
  ]);

  if (listRes.error) {
    console.error("list_workflow_tracking_mails failed:", listRes.error.message);
    throw listRes.error;
  }
  if (countRes.error) {
    console.error("count_workflow_tracking_mails failed:", countRes.error.message);
    throw countRes.error;
  }

  return {
    mails: (listRes.data ?? []) as TrackingMail[],
    total: Number(countRes.data ?? 0),
  };
}

export async function fetchTrackingSummary(
  filters: TrackingFilters
): Promise<TrackingSummary> {
  const { data, error } = await supabase.rpc("get_workflow_tracking_summary", rpcFilters(filters));

  if (error) {
    console.error("get_workflow_tracking_summary failed:", error.message);
    throw error;
  }

  const raw = (data ?? {}) as Partial<TrackingSummary>;
  return {
    total: raw.total ?? 0,
    overdue: raw.overdue ?? 0,
    urgent: raw.urgent ?? 0,
    by_step: raw.by_step ?? {},
    by_status: raw.by_status ?? {},
    by_priority: raw.by_priority ?? {},
  };
}
