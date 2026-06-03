import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "lucide-react";
import { UI_LABELS } from "@/lib/labels";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { DgDecisionSummary, type DgAssignmentRow } from "@/components/DgDecisionSummary";
import { parseWorkflowTransitionNotes } from "@/lib/workflow-notes";

interface Step4ContextPanelProps {
  mailId: string;
}

interface Meeting {
  title: string;
  event_date: string;
  event_time: string | null;
  end_time: string | null;
  location: string | null;
  description: string | null;
  participants: string[] | null;
}

export function Step4ContextPanel({ mailId }: Step4ContextPanelProps) {
  const { settings } = useSiteSettings();
  const [dgNotes, setDgNotes] = useState<string | null>(null);
  const [dircabOrientation, setDircabOrientation] = useState("");
  const [dircabVerification, setDircabVerification] = useState("");
  const [ministerValidation, setMinisterValidation] = useState("");
  const [dgAssignments, setDgAssignments] = useState<DgAssignmentRow[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContext();
  }, [mailId]);

  const fetchContext = async () => {
    setLoading(true);

    const [transitionsRes, assignmentsRes, meetingsRes] = await Promise.all([
      supabase
        .from("workflow_transitions")
        .select("from_step, to_step, notes, action")
        .eq("mail_id", mailId)
        .order("created_at", { ascending: true }),
      supabase
        .from("mail_assignments")
        .select("assigned_to, access_mode, status")
        .eq("mail_id", mailId)
        .eq("step_number", 4)
        .in("status", ["proposed", "pending", "completed"]),
      supabase
        .from("calendar_events")
        .select("title, event_date, event_time, end_time, location, description, participants")
        .eq("mail_id", mailId),
    ]);

    const dgTransition = transitionsRes.data?.find(
      (t) =>
        t.from_step === 2 &&
        (t.to_step === 3 || t.to_step === 4) &&
        (t.action === "approve" || t.action === "complete")
    );
    if (dgTransition?.notes) {
      setDgNotes(dgTransition.notes);
    }

    const dircabTransition = transitionsRes.data?.find(
      (t) => t.from_step === 3 && t.to_step === 4
    );
    if (dircabTransition?.notes) {
      const parsed = parseWorkflowTransitionNotes(dircabTransition.notes);
      setDircabOrientation(parsed?.annotation || dircabTransition.notes);
    }

    const verificationTransition = transitionsRes.data?.find(
      (t) => t.from_step === 5 && t.to_step === 6
    );
    if (verificationTransition?.notes) {
      const parsed = parseWorkflowTransitionNotes(verificationTransition.notes);
      setDircabVerification(parsed?.additionalNotes || parsed?.annotation || verificationTransition.notes);
    }

    const validationTransition = transitionsRes.data?.find(
      (t) => t.from_step === 6 && (t.to_step === 7 || t.to_step === 8)
    );
    if (validationTransition?.notes) {
      const parsed = parseWorkflowTransitionNotes(validationTransition.notes);
      setMinisterValidation(parsed?.annotation || validationTransition.notes);
    }

    if (assignmentsRes.data && assignmentsRes.data.length > 0) {
      const userIds = [...new Set(assignmentsRes.data.map((a) => a.assigned_to))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      const rows: DgAssignmentRow[] = assignmentsRes.data.map((a) => ({
        full_name: profiles?.find((p) => p.id === a.assigned_to)?.full_name || "Inconnu",
        access_mode: a.access_mode || "contributor",
      }));
      setDgAssignments(rows);
    }

    setMeetings(meetingsRes.data || []);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground py-2">Chargement du contexte...</div>
    );
  }

  const hasDgBlock = !!dgNotes || dgAssignments.length > 0 || meetings.length > 0;
  const hasOther =
    dircabOrientation || dircabVerification || ministerValidation;

  if (!hasDgBlock && !hasOther) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-primary">Contexte du dossier</h4>

      {hasDgBlock && (
        <div className="rounded-lg border bg-card p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Décision du {settings.authority_title_short || UI_LABELS.dgShort} (étape 2)
          </p>
          <DgDecisionSummary
            notes={dgNotes}
            assignments={dgAssignments}
            meetings={meetings}
          />
        </div>
      )}

      {dircabVerification && (
        <div className="flex gap-2.5 p-3 rounded-lg border bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
          <Navigation className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">
              Vérification du DGA (étape 5)
            </p>
            <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{dircabVerification}</p>
          </div>
        </div>
      )}

      {ministerValidation && (
        <div className="flex gap-2.5 p-3 rounded-lg border bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
          <Navigation className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">
              {UI_LABELS.dgValidation} (étape 6)
            </p>
            <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{ministerValidation}</p>
          </div>
        </div>
      )}

      {dircabOrientation && (
        <div className="flex gap-2.5 p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <Navigation className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Orientations du DGA</p>
            <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{dircabOrientation}</p>
          </div>
        </div>
      )}
    </div>
  );
}
