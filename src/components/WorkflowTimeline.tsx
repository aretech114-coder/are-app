import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStepLabel } from "@/lib/workflow-engine";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRight, Check, XCircle, RotateCcw } from "lucide-react";

interface Transition {
  id: string;
  from_step: number | null;
  to_step: number;
  action: string;
  notes: string | null;
  created_at: string;
  performed_by: string;
}

export function WorkflowTimeline({ mailId }: { mailId: string }) {
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
      case "approve": case "complete": return <Check className="h-3 w-3" />;
      case "reject": return <XCircle className="h-3 w-3" />;
      case "reassign": return <RotateCcw className="h-3 w-3" />;
      default: return <ArrowRight className="h-3 w-3" />;
    }
  };

  const actionLabel = (action: string) => {
    const labels: Record<string, string> = {
      approve: "Approuvé", reject: "Rejeté", complete: "Complété",
      reassign: "Réaffecté", escalate: "Escaladé", archive: "Archivé",
    };
    return labels[action] || action;
  };

  if (transitions.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Aucune transition enregistrée</p>;
  }

  return (
    <div className="space-y-2">
      {transitions.map((t) => (
        <div key={t.id} className="flex items-start gap-3 text-xs">
          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
            {actionIcon(t.action)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {actionLabel(t.action)} — {t.from_step != null && `${getStepLabel(t.from_step)} → `}{getStepLabel(t.to_step)}
            </p>
            {t.notes && <p className="text-muted-foreground mt-0.5">{t.notes}</p>}
            <p className="text-muted-foreground mt-0.5">
              {format(new Date(t.created_at), "dd MMM yyyy à HH:mm", { locale: fr })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
