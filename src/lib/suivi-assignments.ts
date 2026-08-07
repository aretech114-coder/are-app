import { supabase } from "@/integrations/supabase/client";

export type SuiviTreatmentLabel = "Traité" | "En cours" | "En retard" | "Proposé";

export type SuiviAssigneeRow = {
  mail_id: string;
  assigned_to: string;
  full_name: string;
  access_mode: string;
  assignment_status: string;
  assigned_at: string | null;
  completed_at: string | null;
  contribution_status: string | null;
  processed_at: string | null;
  treatment_label: SuiviTreatmentLabel;
  is_overdue: boolean;
  overdue_hours: number;
};

type AssignmentRaw = {
  id: string;
  mail_id: string;
  assigned_to: string;
  step_number: number;
  access_mode: string | null;
  status: string | null;
  created_at: string | null;
  completed_at: string | null;
};

type ContributionRaw = {
  mail_id: string;
  user_id: string;
  step_number: number;
  status: string | null;
  processed_at: string | null;
};

const DEFAULT_SLA_HOURS = 48;

export async function fetchSlaHoursByStep(): Promise<Record<number, number>> {
  const { data, error } = await supabase
    .from("sla_config")
    .select("step_number, default_hours");
  if (error) {
    console.error("fetchSlaHoursByStep:", error.message);
    return {};
  }
  const map: Record<number, number> = {};
  for (const row of data ?? []) {
    map[row.step_number] = row.default_hours ?? DEFAULT_SLA_HOURS;
  }
  return map;
}

export async function fetchAssignmentsForMails(mailIds: string[]): Promise<AssignmentRaw[]> {
  if (mailIds.length === 0) return [];
  const { data, error } = await (supabase as any)
    .from("mail_assignments")
    .select("id, mail_id, assigned_to, step_number, access_mode, status, created_at, completed_at")
    .in("mail_id", mailIds)
    .eq("access_mode", "contributor");
  if (error) {
    console.error("fetchAssignmentsForMails:", error.message);
    return [];
  }
  return (data ?? []) as AssignmentRaw[];
}

export async function fetchContributionsForMails(mailIds: string[]): Promise<ContributionRaw[]> {
  if (mailIds.length === 0) return [];
  const { data, error } = await (supabase as any)
    .from("mail_contributions")
    .select("mail_id, user_id, step_number, status, processed_at")
    .in("mail_id", mailIds);
  if (error) {
    console.error("fetchContributionsForMails:", error.message);
    return [];
  }
  return (data ?? []) as ContributionRaw[];
}

async function fetchProfileNames(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  if (error) {
    console.error("fetchProfileNames:", error.message);
    return map;
  }
  for (const p of data ?? []) {
    map.set(p.id, p.full_name || "—");
  }
  return map;
}

export function isAssigneeTreated(
  assignmentStatus: string | null | undefined,
  contributionStatus: string | null | undefined
): boolean {
  if (assignmentStatus === "completed") return true;
  if (contributionStatus === "submitted") return true;
  return false;
}

export function computeAssigneeOverdue(
  assignedAt: string | null | undefined,
  slaHours: number,
  treated: boolean,
  nowMs: number = Date.now()
): { is_overdue: boolean; overdue_hours: number } {
  if (treated || !assignedAt) return { is_overdue: false, overdue_hours: 0 };
  const start = new Date(assignedAt).getTime();
  if (!Number.isFinite(start)) return { is_overdue: false, overdue_hours: 0 };
  const due = start + slaHours * 60 * 60 * 1000;
  if (nowMs <= due) return { is_overdue: false, overdue_hours: 0 };
  return {
    is_overdue: true,
    overdue_hours: Math.max(0, Math.floor((nowMs - due) / (1000 * 60 * 60))),
  };
}

export function resolveTreatmentLabel(
  assignmentStatus: string | null | undefined,
  contributionStatus: string | null | undefined,
  isOverdue: boolean
): SuiviTreatmentLabel {
  if (isAssigneeTreated(assignmentStatus, contributionStatus)) return "Traité";
  if (assignmentStatus === "proposed") return isOverdue ? "En retard" : "Proposé";
  if (isOverdue) return "En retard";
  return "En cours";
}

export function buildAssigneeViewsForMail(
  mailId: string,
  currentStep: number,
  assignments: AssignmentRaw[],
  contributions: ContributionRaw[],
  profileNames: Map<string, string>,
  slaHoursByStep: Record<number, number>,
  nowMs: number = Date.now()
): SuiviAssigneeRow[] {
  const stepAssignments = assignments
    .filter((a) => a.mail_id === mailId && a.step_number === currentStep)
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });

  const slaHours = slaHoursByStep[currentStep] ?? DEFAULT_SLA_HOURS;

  return stepAssignments.map((a) => {
    const contrib = contributions.find(
      (c) =>
        c.mail_id === mailId &&
        c.user_id === a.assigned_to &&
        c.step_number === currentStep
    );
    const treated = isAssigneeTreated(a.status, contrib?.status);
    const overdue = computeAssigneeOverdue(a.created_at, slaHours, treated, nowMs);
    return {
      mail_id: mailId,
      assigned_to: a.assigned_to,
      full_name: profileNames.get(a.assigned_to) || "—",
      access_mode: a.access_mode || "contributor",
      assignment_status: a.status || "pending",
      assigned_at: a.created_at,
      completed_at: a.completed_at,
      contribution_status: contrib?.status ?? null,
      processed_at: contrib?.processed_at ?? null,
      treatment_label: resolveTreatmentLabel(a.status, contrib?.status, overdue.is_overdue),
      is_overdue: overdue.is_overdue,
      overdue_hours: overdue.overdue_hours,
    };
  });
}

/** Batch enrich: map mail_id → assignees of that mail's current_step. */
export async function enrichMailsWithAssignees(
  mails: Array<{ id: string; current_step?: number | null }>
): Promise<Record<string, SuiviAssigneeRow[]>> {
  const result: Record<string, SuiviAssigneeRow[]> = {};
  if (mails.length === 0) return result;

  const mailIds = mails.map((m) => m.id);
  const [assignments, contributions, slaHoursByStep] = await Promise.all([
    fetchAssignmentsForMails(mailIds),
    fetchContributionsForMails(mailIds),
    fetchSlaHoursByStep(),
  ]);

  const userIds = [...new Set(assignments.map((a) => a.assigned_to))];
  const profileNames = await fetchProfileNames(userIds);
  const nowMs = Date.now();

  for (const mail of mails) {
    const step = mail.current_step || 1;
    result[mail.id] = buildAssigneeViewsForMail(
      mail.id,
      step,
      assignments,
      contributions,
      profileNames,
      slaHoursByStep,
      nowMs
    );
  }

  return result;
}

export function mailHasAssignee(
  mailId: string,
  userId: string,
  assigneesByMailId: Record<string, SuiviAssigneeRow[]>
): boolean {
  return (assigneesByMailId[mailId] ?? []).some((a) => a.assigned_to === userId);
}

export function maxCollaboratorOverdueHours(
  assignees: SuiviAssigneeRow[] | undefined
): number {
  if (!assignees?.length) return 0;
  return Math.max(0, ...assignees.map((a) => (a.is_overdue ? a.overdue_hours : 0)));
}

export function anyCollaboratorOverdue(assignees: SuiviAssigneeRow[] | undefined): boolean {
  return (assignees ?? []).some((a) => a.is_overdue);
}
