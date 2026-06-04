import { supabase } from "@/integrations/supabase/client";
import { formatTransitionNotesForDisplay } from "@/lib/workflow-notes";
import { getStepLabel } from "@/lib/workflow-engine";

/** Construit un texte d'historique workflow pour le prompt IA. */
export async function buildWorkflowHistoryText(mailId: string): Promise<string> {
  const { data } = await supabase
    .from("workflow_transitions")
    .select("from_step, to_step, action, notes, created_at")
    .eq("mail_id", mailId)
    .order("created_at", { ascending: true });

  if (!data?.length) return "";

  return data
    .map((t) => {
      const lines = formatTransitionNotesForDisplay(t.notes);
      const header = `[${t.from_step != null ? getStepLabel(t.from_step) : "?"} → ${getStepLabel(t.to_step)}] ${t.action}`;
      const body = lines.length ? lines.join("\n") : t.notes || "";
      return `${header}\n${body}`.trim();
    })
    .join("\n\n---\n\n");
}
