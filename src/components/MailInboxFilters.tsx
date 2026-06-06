import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  countInboxQuickFilters,
  INBOX_QUICK_FILTERS,
  INBOX_QUICK_FILTER_LABELS,
  type InboxQuickFilter,
  type InboxSortOrder,
} from "@/lib/mail-inbox-filters";
import { getStepLabel } from "@/lib/workflow-engine";
import type { WorkflowStep } from "@/hooks/useWorkflowSteps";

interface MailInboxFiltersProps {
  mails: any[];
  quickFilter: InboxQuickFilter;
  onQuickFilterChange: (filter: InboxQuickFilter) => void;
  stepFilter: string;
  onStepFilterChange: (step: string) => void;
  sortOrder: InboxSortOrder;
  onSortOrderChange: (order: InboxSortOrder) => void;
  activeSteps?: WorkflowStep[];
}

export function MailInboxFilters({
  mails,
  quickFilter,
  onQuickFilterChange,
  stepFilter,
  onStepFilterChange,
  sortOrder,
  onSortOrderChange,
  activeSteps = [],
}: MailInboxFiltersProps) {
  const counts = countInboxQuickFilters(mails);
  const stepsForFilter =
    activeSteps.length > 0
      ? activeSteps
      : [{ step_order: 2, name: "Traitement DG" }] as Pick<WorkflowStep, "step_order" | "name">[];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {INBOX_QUICK_FILTERS.map(({ id, label }) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={quickFilter === id ? "default" : "outline"}
            className={cn(
              "h-7 px-2.5 text-xs font-normal gap-1",
              quickFilter === id && "shadow-sm"
            )}
            onClick={() => onQuickFilterChange(id)}
          >
            {label}
            <span
              className={cn(
                "tabular-nums",
                quickFilter === id ? "opacity-90" : "text-muted-foreground"
              )}
            >
              ({counts[id]})
            </span>
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={stepFilter} onValueChange={onStepFilterChange}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Étape" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes étapes</SelectItem>
            {stepsForFilter.map((s) => (
              <SelectItem key={s.step_order} value={String(s.step_order)}>
                {getStepLabel(s.step_order)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortOrder} onValueChange={(v) => onSortOrderChange(v as InboxSortOrder)}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Tri" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Récents</SelectItem>
            <SelectItem value="oldest">Plus anciens</SelectItem>
            <SelectItem value="priority">Priorité</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export { INBOX_QUICK_FILTER_LABELS };
