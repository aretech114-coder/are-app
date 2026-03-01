import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, MessageSquare, CalendarDays, Navigation } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Step4ContextPanelProps {
  mailId: string;
}

interface AssignedPerson {
  full_name: string;
  instructions: string | null;
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
  const [ministerAnnotation, setMinisterAnnotation] = useState("");
  const [dircabOrientation, setDircabOrientation] = useState("");
  const [assignedPersons, setAssignedPersons] = useState<AssignedPerson[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContext();
  }, [mailId]);

  const fetchContext = async () => {
    setLoading(true);

    // Fetch all transitions for this mail in parallel
    const [transitionsRes, assignmentsRes, meetingsRes] = await Promise.all([
      supabase
        .from("workflow_transitions")
        .select("from_step, to_step, notes, action")
        .eq("mail_id", mailId)
        .order("created_at", { ascending: true }),
      supabase
        .from("mail_assignments")
        .select("assigned_to, instructions, status")
        .eq("mail_id", mailId)
        .eq("step_number", 4),
      supabase
        .from("calendar_events")
        .select("title, event_date, event_time, end_time, location, description, participants")
        .eq("mail_id", mailId),
    ]);

    // Extract minister annotation (step 2 → 3)
    const ministerTransition = transitionsRes.data?.find(
      (t) => t.from_step === 2 && t.to_step === 3
    );
    if (ministerTransition?.notes) {
      // Extract just the annotation text from the formatted notes
      const match = ministerTransition.notes.match(/📝 Annotation:\s*(.+?)(?:\n|$)/);
      setMinisterAnnotation(match ? match[1].trim() : ministerTransition.notes);
    }

    // Extract DirCab orientation (step 3 → 4)
    const dircabTransition = transitionsRes.data?.find(
      (t) => t.from_step === 3 && t.to_step === 4
    );
    if (dircabTransition?.notes) {
      const match = dircabTransition.notes.match(/📝 Annotation:\s*(.+?)(?:\n|$)/);
      setDircabOrientation(match ? match[1].trim() : dircabTransition.notes);
    }

    // Fetch assigned person names
    if (assignmentsRes.data && assignmentsRes.data.length > 0) {
      const userIds = assignmentsRes.data.map((a) => a.assigned_to);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      const persons: AssignedPerson[] = assignmentsRes.data.map((a) => ({
        full_name: profiles?.find((p) => p.id === a.assigned_to)?.full_name || "Inconnu",
        instructions: a.instructions,
      }));
      setAssignedPersons(persons);
    }

    setMeetings(meetingsRes.data || []);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground py-2">Chargement du contexte...</div>
    );
  }

  const hasContent = ministerAnnotation || dircabOrientation || assignedPersons.length > 0 || meetings.length > 0;
  if (!hasContent) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-primary">Contexte du dossier</h4>

      {/* Minister annotation */}
      {ministerAnnotation && (
        <div className="flex gap-2.5 p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Annotation du Ministre</p>
            <p className="text-sm mt-0.5 whitespace-pre-wrap">{ministerAnnotation}</p>
          </div>
        </div>
      )}

      {/* DirCab orientation */}
      {dircabOrientation && (
        <div className="flex gap-2.5 p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <Navigation className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Orientations du DirCab</p>
            <p className="text-sm mt-0.5 whitespace-pre-wrap">{dircabOrientation}</p>
          </div>
        </div>
      )}

      {/* Assigned persons */}
      {assignedPersons.length > 0 && (
        <div className="flex gap-2.5 p-3 rounded-lg border bg-muted/30">
          <Users className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold">Personnes assignées</p>
            <ul className="mt-1 space-y-0.5">
              {assignedPersons.map((p, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{p.full_name}</span>
                  {p.instructions && (
                    <span className="text-muted-foreground ml-1">— {p.instructions}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Scheduled meetings */}
      {meetings.length > 0 && (
        <div className="flex gap-2.5 p-3 rounded-lg border bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
          <CalendarDays className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-green-700 dark:text-green-300">Réunion(s) prévue(s)</p>
            <ul className="mt-1 space-y-1.5">
              {meetings.map((m, i) => (
                <li key={i} className="text-sm">
                  <p className="font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(m.event_date), "dd MMMM yyyy", { locale: fr })}
                    {m.event_time && ` à ${m.event_time}`}
                    {m.end_time && ` — ${m.end_time}`}
                    {m.location && ` • ${m.location}`}
                  </p>
                  {m.participants && m.participants.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Participants : {m.participants.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
