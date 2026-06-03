import { MessageSquare, Users, Eye, CalendarDays, FileText, StickyNote } from "lucide-react";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { UI_LABELS } from "@/lib/labels";
import {
  parseWorkflowTransitionNotes,
  type ParsedWorkflowNotes,
} from "@/lib/workflow-notes";
import { Badge } from "@/components/ui/badge";

export interface DgAssignmentRow {
  full_name: string;
  access_mode: string;
}

interface DgDecisionSummaryProps {
  notes?: string | null;
  parsed?: ParsedWorkflowNotes | null;
  assignments?: DgAssignmentRow[];
  meetings?: {
    title: string;
    event_date: string;
    event_time: string | null;
    location: string | null;
    participants?: string[] | null;
  }[];
  compact?: boolean;
}

function splitNames(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function DgDecisionSummary({
  notes,
  parsed: parsedProp,
  assignments = [],
  meetings = [],
  compact = false,
}: DgDecisionSummaryProps) {
  const parsed = parsedProp ?? parseWorkflowTransitionNotes(notes);
  if (!parsed && assignments.length === 0 && meetings.length === 0) return null;

  const contributors = assignments.filter(
    (a) => a.access_mode === "contributor" || a.access_mode === "custodian"
  );
  const viewers = assignments.filter((a) => a.access_mode === "viewer");
  const namesFromNotes = splitNames(parsed?.assigneeNames ?? null);

  const pad = compact ? "p-2.5" : "p-3";

  return (
    <div className={`space-y-2.5 ${compact ? "text-sm" : ""}`}>
      {parsed?.annotation && (
        <section className={`rounded-lg border bg-amber-50/60 dark:bg-amber-950/25 border-amber-200/80 ${pad}`}>
          <div className="flex gap-2 items-start">
            <MessageSquare className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                {UI_LABELS.dgAnnotation}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words">{parsed.annotation}</p>
            </div>
          </div>
        </section>
      )}

      {parsed?.attachmentUrl && (
        <section className={`rounded-lg border bg-muted/40 ${pad}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Document joint par le {UI_LABELS.dgShort}
              </p>
            </div>
            <AttachmentViewer url={parsed.attachmentUrl} inline />
          </div>
        </section>
      )}

      {(contributors.length > 0 || namesFromNotes.length > 0) && (
        <section className={`rounded-lg border ${pad}`}>
          <div className="flex gap-2 items-start">
            <Users className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold mb-1.5">Assignés au traitement</p>
              <div className="flex flex-wrap gap-1.5">
                {contributors.length > 0
                  ? contributors.map((p, i) => (
                      <Badge key={i} variant="secondary" className="font-normal">
                        {p.full_name}
                      </Badge>
                    ))
                  : namesFromNotes.map((name, i) => (
                      <Badge key={i} variant="secondary" className="font-normal">
                        {name}
                      </Badge>
                    ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {viewers.length > 0 && (
        <section className={`rounded-lg border border-dashed ${pad}`}>
          <div className="flex gap-2 items-start">
            <Eye className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold mb-1.5">Copie lecture seule</p>
              <div className="flex flex-wrap gap-1.5">
                {viewers.map((p, i) => (
                  <Badge key={i} variant="outline" className="font-normal">
                    {p.full_name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {(meetings.length > 0 || parsed?.rdvLine) && (
        <section className={`rounded-lg border bg-green-50/50 dark:bg-green-950/20 border-green-200/70 ${pad}`}>
          <div className="flex gap-2 items-start">
            <CalendarDays className="h-4 w-4 text-green-700 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-xs font-semibold text-green-800 dark:text-green-300">
                Rendez-vous planifié
              </p>
              {parsed?.rdvLine && (
                <p className="text-sm text-muted-foreground">{parsed.rdvLine}</p>
              )}
              {meetings.map((m, i) => (
                <div key={i} className="text-sm">
                  <p className="font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.event_date}
                    {m.event_time ? ` · ${m.event_time}` : ""}
                    {m.location ? ` · ${m.location}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {parsed?.additionalNotes && (
        <section className={`rounded-lg border bg-muted/30 ${pad}`}>
          <div className="flex gap-2 items-start">
            <StickyNote className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold mb-1">Notes supplémentaires</p>
              <p className="whitespace-pre-wrap break-words">{parsed.additionalNotes}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
