import { supabase } from "@/integrations/supabase/client";

type AssignmentMode = "default_user" | "default_user_with_fallback" | "dynamic_by_previous_step";

export interface WorkflowStepResponsible {
  id: string;
  step_number: number;
  assignment_mode: AssignmentMode;
  default_user_id: string | null;
  fallback_step_number: number | null;
  is_active: boolean;
  created_by: string | null;
}

export interface AssignableUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

const STEP_FALLBACK_ROLES: Record<number, string[]> = {
  2: ["ministre", "dircab", "dircaba", "admin", "superadmin"],
  3: ["dircab", "dircaba", "admin", "superadmin"],
  5: ["dircab", "dircaba", "admin", "superadmin"],
  6: ["ministre", "dircab", "admin", "superadmin"],
  8: ["secretariat", "admin", "superadmin"],
  9: ["secretariat", "admin", "superadmin"],
};

export async function resolveWorkflowStepAssignee(stepNumber: number, mailId?: string | null): Promise<string | null> {
  const { data: resolvedByConfig, error: rpcError } = await supabase.rpc(
    "resolve_step_assignee" as any,
    {
      _step_number: stepNumber,
      _mail_id: mailId ?? null,
    } as any,
  );

  if (!rpcError && resolvedByConfig) {
    return resolvedByConfig as string;
  }

  const fallbackRoles = STEP_FALLBACK_ROLES[stepNumber] || [];
  if (fallbackRoles.length === 0) return null;

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", fallbackRoles as any);

  if (!roleRows?.length) return null;

  for (const role of fallbackRoles) {
    const selected = roleRows.find((row) => row.role === role);
    if (selected) return selected.user_id;
  }

  return roleRows[0]?.user_id ?? null;
}

export async function fetchWorkflowStepResponsibles(): Promise<WorkflowStepResponsible[]> {
  const { data, error } = await supabase
    .from("workflow_step_responsibles" as any)
    .select("*")
    .order("step_number", { ascending: true });

  if (error) throw error;
  return (data || []) as WorkflowStepResponsible[];
}

export async function upsertWorkflowStepResponsible(config: {
  step_number: number;
  assignment_mode: AssignmentMode;
  default_user_id: string | null;
  fallback_step_number?: number | null;
  created_by?: string | null;
}) {
  const payload = {
    step_number: config.step_number,
    assignment_mode: config.assignment_mode,
    default_user_id: config.default_user_id,
    fallback_step_number: config.fallback_step_number ?? null,
    created_by: config.created_by ?? null,
    is_active: true,
  };

  const { error } = await supabase
    .from("workflow_step_responsibles" as any)
    .upsert(payload, { onConflict: "step_number" });

  if (error) throw error;
}

export async function fetchWorkflowAssignableUsers(): Promise<AssignableUser[]> {
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .neq("role", "superadmin" as any);

  if (rolesError) throw rolesError;
  if (!roles?.length) return [];

  const userIds = [...new Set(roles.map((r) => r.user_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  if (profilesError) throw profilesError;

  return (profiles || []).map((profile) => ({
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    role: roles.find((r) => r.user_id === profile.id)?.role || "agent",
  }));
}
