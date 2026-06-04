import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DgAssignmentRow } from "@/components/DgDecisionSummary";
import { parseWorkflowTransitionNotes } from "@/lib/workflow-notes";

export interface WorkflowMeeting {
  title: string;
  event_date: string;
  event_time: string | null;
  end_time: string | null;
  location: string | null;
  description: string | null;
  participants: string[] | null;
}

export interface MailWorkflowContext {
  dgNotes: string | null;
  dircabOrientation: string;
  dircabVerification: string;
  ministerValidation: string;
  dgAssignments: DgAssignmentRow[];
  meetings: WorkflowMeeting[];
  loading: boolean;
}

const emptyContext: MailWorkflowContext = {
  dgNotes: null,
  dircabOrientation: "",
  dircabVerification: "",
  ministerValidation: "",
  dgAssignments: [],
  meetings: [],
  loading: true,
};

export function useMailWorkflowContext(mailId: string | undefined): MailWorkflowContext {
  const [ctx, setCtx] = useState<MailWorkflowContext>(emptyContext);

  useEffect(() => {
    if (!mailId) {
      setCtx({ ...emptyContext, loading: false });
      return;
    }

    let cancelled = false;

    const fetchContext = async () => {
      setCtx((prev) => ({ ...prev, loading: true }));

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

      if (cancelled) return;

      let dgNotes: string | null = null;
      let dircabOrientation = "";
      let dircabVerification = "";
      let ministerValidation = "";
      let dgAssignments: DgAssignmentRow[] = [];
      const meetings = (meetingsRes.data || []) as WorkflowMeeting[];

      const dgTransition = transitionsRes.data?.find(
        (t) =>
          t.from_step === 2 &&
          (t.to_step === 3 || t.to_step === 4) &&
          (t.action === "approve" || t.action === "complete")
      );
      if (dgTransition?.notes) {
        dgNotes = dgTransition.notes;
      }

      const dircabTransition = transitionsRes.data?.find(
        (t) => t.from_step === 3 && t.to_step === 4
      );
      if (dircabTransition?.notes) {
        const parsed = parseWorkflowTransitionNotes(dircabTransition.notes);
        dircabOrientation = parsed?.annotation || dircabTransition.notes;
      }

      const verificationTransition = transitionsRes.data?.find(
        (t) => t.from_step === 5 && t.to_step === 6
      );
      if (verificationTransition?.notes) {
        const parsed = parseWorkflowTransitionNotes(verificationTransition.notes);
        dircabVerification =
          parsed?.additionalNotes || parsed?.annotation || verificationTransition.notes;
      }

      const validationTransition = transitionsRes.data?.find(
        (t) => t.from_step === 6 && (t.to_step === 7 || t.to_step === 8)
      );
      if (validationTransition?.notes) {
        const parsed = parseWorkflowTransitionNotes(validationTransition.notes);
        ministerValidation = parsed?.annotation || validationTransition.notes;
      }

      if (assignmentsRes.data && assignmentsRes.data.length > 0) {
        const userIds = [...new Set(assignmentsRes.data.map((a) => a.assigned_to))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);

        if (!cancelled) {
          dgAssignments = assignmentsRes.data.map((a) => ({
            full_name: profiles?.find((p) => p.id === a.assigned_to)?.full_name || "Inconnu",
            access_mode: a.access_mode || "contributor",
          }));
        }
      }

      if (!cancelled) {
        setCtx({
          dgNotes,
          dircabOrientation,
          dircabVerification,
          ministerValidation,
          dgAssignments,
          meetings,
          loading: false,
        });
      }
    };

    fetchContext();
    return () => {
      cancelled = true;
    };
  }, [mailId]);

  return ctx;
}
