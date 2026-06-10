import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AuditCategory = "workflow" | "registry" | "user" | "email" | "system";

export interface AuditEventInput {
  actor_user_id?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  action: string;
  category: AuditCategory;
  entity_type?: string | null;
  entity_id?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}

export async function logAuditEvent(
  adminClient: SupabaseClient,
  event: AuditEventInput
): Promise<void> {
  try {
    const { error } = await adminClient.rpc("log_audit_event", {
      _actor_user_id: event.actor_user_id ?? null,
      _actor_email: event.actor_email ?? null,
      _actor_role: event.actor_role ?? null,
      _action: event.action,
      _category: event.category,
      _entity_type: event.entity_type ?? null,
      _entity_id: event.entity_id ?? null,
      _summary: event.summary,
      _metadata: event.metadata ?? {},
      _source: "edge_function",
      _ip_address: event.ip_address ?? null,
      _user_agent: event.user_agent ?? null,
      _created_at: null,
    });

    if (error) {
      console.error("[audit] log_audit_event failed:", error.message);
    }
  } catch (err) {
    console.error("[audit] unexpected error:", err);
  }
}

export function requestMeta(req: Request): { ip_address: string | null; user_agent: string | null } {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  return {
    ip_address: ip || null,
    user_agent: req.headers.get("user-agent"),
  };
}
