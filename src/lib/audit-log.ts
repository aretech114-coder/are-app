import { supabase } from "@/integrations/supabase/client";

export type AuditCategory = "workflow" | "registry" | "user" | "email" | "system";

export type AuditEvent = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  category: AuditCategory;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  source: string;
  ip_address: string | null;
  user_agent: string | null;
};

export type AuditDatePreset = "7d" | "30d" | "90d" | "all";

export type AuditFilters = {
  datePreset: AuditDatePreset;
  category: AuditCategory | "all";
  action: string;
  actorUserId: string;
  search: string;
};

export const AUDIT_CATEGORIES: { value: AuditCategory; label: string }[] = [
  { value: "workflow", label: "Workflow" },
  { value: "registry", label: "Registre" },
  { value: "user", label: "Utilisateurs" },
  { value: "email", label: "E-mails" },
  { value: "system", label: "Système" },
];

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "mail.register": "Enregistrement courrier",
  "mail.update": "Modification registre",
  "mail.lock": "Verrouillage registre",
  "workflow.transition": "Transition workflow",
  "assignment.create": "Assignation",
  "assignment.reassign": "Réassignation registre",
  "user.create": "Création utilisateur",
  "user.update": "Modification utilisateur",
  "user.delete": "Suppression utilisateur",
  "user.role_change": "Changement de rôle",
  "user.impersonate": "Impersonation",
  "email.sent": "E-mail envoyé",
  "email.failed": "Échec e-mail",
  "system.role_create": "Création rôle",
};

export const ACTIONS_BY_CATEGORY: Record<AuditCategory, string[]> = {
  workflow: ["workflow.transition", "assignment.create"],
  registry: ["mail.register", "mail.update", "mail.lock", "assignment.reassign"],
  user: ["user.create", "user.update", "user.delete", "user.role_change", "user.impersonate"],
  email: ["email.sent", "email.failed"],
  system: ["system.role_create"],
};

export function getActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function getCategoryLabel(category: string): string {
  return AUDIT_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function formatAuditSummary(event: AuditEvent): string {
  return event.summary?.trim() || getActionLabel(event.action);
}

function dateFromPreset(preset: AuditDatePreset): string | null {
  if (preset === "all") return null;
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function fetchAuditEvents(
  filters: AuditFilters,
  page: number,
  pageSize: number
): Promise<{ events: AuditEvent[]; total: number }> {
  let query = supabase
    .from("audit_events")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  const fromDate = dateFromPreset(filters.datePreset);
  if (fromDate) {
    query = query.gte("created_at", fromDate);
  }

  if (filters.category !== "all") {
    query = query.eq("category", filters.category);
  }

  if (filters.action) {
    query = query.eq("action", filters.action);
  }

  if (filters.actorUserId) {
    query = query.eq("actor_user_id", filters.actorUserId);
  }

  const search = filters.search.trim();
  if (search) {
    const pattern = `%${search.replace(/%/g, "\\%")}%`;
    query = query.or(`summary.ilike.${pattern},actor_email.ilike.${pattern}`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return {
    events: (data ?? []) as AuditEvent[],
    total: count ?? 0,
  };
}

export async function fetchAuditEventsForExport(
  filters: AuditFilters,
  limit = 1000
): Promise<AuditEvent[]> {
  let query = supabase
    .from("audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  const fromDate = dateFromPreset(filters.datePreset);
  if (fromDate) {
    query = query.gte("created_at", fromDate);
  }

  if (filters.category !== "all") {
    query = query.eq("category", filters.category);
  }

  if (filters.action) {
    query = query.eq("action", filters.action);
  }

  if (filters.actorUserId) {
    query = query.eq("actor_user_id", filters.actorUserId);
  }

  const search = filters.search.trim();
  if (search) {
    const pattern = `%${search.replace(/%/g, "\\%")}%`;
    query = query.or(`summary.ilike.${pattern},actor_email.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AuditEvent[];
}

export function auditEventsToCsv(events: AuditEvent[]): string {
  const header = [
    "Date",
    "Acteur",
    "Email acteur",
    "Rôle acteur",
    "Catégorie",
    "Action",
    "Résumé",
    "Type entité",
    "ID entité",
    "Source",
  ];

  const rows = events.map((e) => [
    e.created_at,
    e.actor_user_id ?? "",
    e.actor_email ?? "",
    e.actor_role ?? "",
    getCategoryLabel(e.category),
    getActionLabel(e.action),
    e.summary,
    e.entity_type ?? "",
    e.entity_id ?? "",
    e.source,
  ]);

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  return [header, ...rows].map((row) => row.map((cell) => escape(String(cell))).join(",")).join("\n");
}
