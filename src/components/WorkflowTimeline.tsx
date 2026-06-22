import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStepLabel } from "@/lib/workflow-engine";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRight, Check, XCircle, RotateCcw } from "lucide-react";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { AttachmentDownloadButton } from "@/components/AttachmentDownloadButton";
import {
  formatTransitionNotesForDisplay,
  parseWorkflowTransitionNotes,
} from "@/lib/workflow-notes";
import type { WorkflowStep } from "@/hooks/useWorkflowSteps";
import { getDisplayStepLabel, getVisualWorkflowStepNumber } from "@/lib/workflow-display";

interface Transition {
  id: string;
  from_step: number | null;
  to_step: number;
  action: string;
  notes: string | null;
  created_at: string;
  performed_by: string;
}

interface WorkflowTimelineProps {
  mailId: string;
  activeSteps?: WorkflowStep[];
  groupByStep?: boolean;
  allowDownload?: boolean;
}

export function WorkflowTimeline({
  mailId,
  activeSteps = [],
  groupByStep = false,
  allowDownload = false,
}: WorkflowTimelineProps) {
  const [transitions, setTransitions] = useState<Transition[]>([]);

  useEffect(() => {
    supabase
      .from("workflow_transitions")
      .select("*")
      .eq("mail_id", mailId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setTransitions(data || []));
  }, [mailId]);

  const actionIcon = (action: string) => {
    switch (action) {
      case "approve":
      case "complete":
        return <Check className="h-3 w-3" />;
      case "reject":
        return <XCircle className="h-3 w-3" />;
      case "reassign":
        return <RotateCcw className="h-3 w-3" />;
      default:
        return <ArrowRight className="h-3 w-3" />;
    }
  };

  const actionLabel = (action: string) => {
    const labels: Record<string, string> = {
      approve: "Approuvé",
      reject: "Rejeté",
      complete: "Complété",
      reassign: "Réaffecté",
      escalate: "Escaladé",
      archive: "Archivé",
      skip: "Étape ignorée",
    };
    return labels[action] || action;
  };

  if (transitions.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Aucune transition enregistrée</p>;
  }

  const renderTransition = (t: Transition) => {
    const parsed = parseWorkflowTransitionNotes(t.notes);
    const lines = formatTransitionNotesForDisplay(t.notes);
    const stepLabel =
      activeSteps.length > 0 && t.from_step != null
        ? getDisplayStepLabel(activeSteps, t.from_step)
        : getStepLabel(t.from_step ?? t.to_step);

    return (
      <div key={t.id} className="flex items-start gap-3 text-xs">
        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
          {actionIcon(t.action)}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">
            {actionLabel(t.action)}
            {t.from_step != null && ` — ${stepLabel}`}
            {" → "}
            {activeSteps.length > 0
              ? getDisplayStepLabel(activeSteps, t.to_step)
              : getStepLabel(t.to_step)}
          </p>
          {lines.length > 0 && (
            <ul className="text-muted-foreground space-y-0.5 list-none">
              {lines.map((line, i) => (
                <li key={i} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          )}
          {parsed?.attachmentUrl && (
            <div className="pt-1 flex items-center gap-1">
              <AttachmentViewer url={parsed.attachmentUrl} inline />
              {allowDownload && (
                <AttachmentDownloadButton url={parsed.attachmentUrl} variant="ghost" size="icon" />
              )}
            </div>
          )}
          <p className="text-muted-foreground">
            {format(new Date(t.created_at), "dd MMM yyyy à HH:mm", { locale: fr })}
          </p>
        </div>
      </div>
    );
  };

  if (groupByStep && activeSteps.length > 0) {
    const byStep = new Map<number, Transition[]>();
    for (const t of transitions) {
      const key = t.from_step ?? t.to_step;
      if (!byStep.has(key)) byStep.set(key, []);
      byStep.get(key)!.push(t);
    }
    const orderedKeys = [...byStep.keys()].sort((a, b) => a - b);

    return (
      <div className="space-y-4">
        {orderedKeys.map((stepKey) => {
          const visual =
            stepKey === 1 ? 1 : getVisualWorkflowStepNumber(activeSteps, stepKey);
          const stepName =
            activeSteps.find((s) => s.step_order === stepKey)?.name ||
            getStepLabel(stepKey);
          return (
            <div key={stepKey} className="rounded-lg border bg-background/50 p-2.5 space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                É{visual} — {stepName}
              </p>
              <div className="space-y-3">{byStep.get(stepKey)!.map(renderTransition)}</div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transitions.map((t) => {
        const parsed = parseWorkflowTransitionNotes(t.notes);
        const lines = formatTransitionNotesForDisplay(t.notes);

        return (
          <div key={t.id} className="flex items-start gap-3 text-xs">
            <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
              {actionIcon(t.action)}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium">
                {actionLabel(t.action)} —{" "}
                {t.from_step != null && `${getStepLabel(t.from_step)} → `}
                {getStepLabel(t.to_step)}
              </p>
              {lines.length > 0 && (
                <ul className="text-muted-foreground space-y-0.5 list-none">
                  {lines.map((line, i) => (
                    <li key={i} className="break-words">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
              {parsed?.attachmentUrl && (
                <div className="pt-1 flex items-center gap-1">
                  <AttachmentViewer url={parsed.attachmentUrl} inline />
                  {allowDownload && (
                    <AttachmentDownloadButton url={parsed.attachmentUrl} variant="ghost" size="icon" />
                  )}
                </div>
              )}
              <p className="text-muted-foreground">
                {format(new Date(t.created_at), "dd MMM yyyy à HH:mm", { locale: fr })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
