export type InboxQuickFilter =
  | "all"
  | "new"
  | "in_progress"
  | "urgent"
  | "overdue"
  | "processed"
  | "archived";

export type InboxSortOrder = "recent" | "oldest" | "priority";

export const INBOX_QUICK_FILTERS: { id: InboxQuickFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "new", label: "Nouveaux" },
  { id: "in_progress", label: "En cours" },
  { id: "urgent", label: "Urgents" },
  { id: "overdue", label: "En retard" },
  { id: "processed", label: "Traités" },
  { id: "archived", label: "Archivés" },
];

export const INBOX_QUICK_FILTER_LABELS: Record<InboxQuickFilter, string> = {
  all: "Tous",
  new: "Nouveaux",
  in_progress: "En cours",
  urgent: "Urgents",
  overdue: "En retard",
  processed: "Traités",
  archived: "Archivés",
};

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function isMailOverdue(mail: { deadline_at?: string | null; status?: string | null }): boolean {
  if (!mail.deadline_at || mail.status === "archived") return false;
  return new Date(mail.deadline_at) < new Date();
}

export function matchesInboxQuickFilter(
  mail: {
    is_read?: boolean | null;
    status?: string | null;
    priority?: string | null;
    deadline_at?: string | null;
  },
  filter: InboxQuickFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "new":
      return !mail.is_read;
    case "in_progress":
      return mail.status === "in_progress";
    case "urgent":
      return mail.priority === "urgent";
    case "overdue":
      return isMailOverdue(mail);
    case "processed":
      return mail.status === "processed";
    case "archived":
      return mail.status === "archived";
    default:
      return true;
  }
}

export function matchesMailSearch(
  mail: {
    subject?: string | null;
    sender_name?: string | null;
    reference_number?: string | null;
    registry_reference?: string | null;
    system_reference?: string | null;
    sender_organization?: string | null;
  },
  search: string
): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    mail.subject,
    mail.sender_name,
    mail.sender_organization,
    mail.reference_number,
    mail.registry_reference,
    mail.system_reference,
  ];
  return haystack.some((v) => v?.toLowerCase().includes(q));
}

export function countInboxQuickFilters(mails: Parameters<typeof matchesInboxQuickFilter>[0][]): Record<InboxQuickFilter, number> {
  const counts = {} as Record<InboxQuickFilter, number>;
  for (const { id } of INBOX_QUICK_FILTERS) {
    counts[id] = mails.filter((m) => matchesInboxQuickFilter(m, id)).length;
  }
  return counts;
}

export function filterInboxMails<
  T extends {
    is_read?: boolean | null;
    status?: string | null;
    priority?: string | null;
    deadline_at?: string | null;
    current_step?: number | null;
    created_at?: string;
    subject?: string | null;
    sender_name?: string | null;
    reference_number?: string | null;
    registry_reference?: string | null;
    system_reference?: string | null;
    sender_organization?: string | null;
  }
>(
  mails: T[],
  options: {
    quickFilter: InboxQuickFilter;
    stepFilter: string;
    search: string;
    sortOrder: InboxSortOrder;
  }
): T[] {
  let result = mails.filter((m) => matchesInboxQuickFilter(m, options.quickFilter));

  if (options.stepFilter !== "all") {
    result = result.filter((m) => String(m.current_step ?? "") === options.stepFilter);
  }

  if (options.search.trim()) {
    result = result.filter((m) => matchesMailSearch(m, options.search));
  }

  result = [...result].sort((a, b) => {
    if (options.sortOrder === "priority") {
      const pa = PRIORITY_RANK[a.priority || "normal"] ?? 2;
      const pb = PRIORITY_RANK[b.priority || "normal"] ?? 2;
      if (pa !== pb) return pa - pb;
    }
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return options.sortOrder === "oldest" ? ta - tb : tb - ta;
  });

  return result;
}
