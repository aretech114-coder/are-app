import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SubAssignment {
  id: string;
  parent_assignment_id: string;
  mail_id: string;
  sub_assigned_by: string;
  sub_assigned_to: string;
  status: "pending" | "submitted" | "validated" | "rejected";
  submission_notes: string | null;
  validation_notes: string | null;
  parent_deadline_at: string | null;
  created_at: string;
  submitted_at: string | null;
  validated_at: string | null;
  sub_assigned_to_profile?: { full_name: string | null; email: string };
  sub_assigned_by_profile?: { full_name: string | null; email: string };
}

export function useSubAssignments(mailId: string) {
  return useQuery({
    queryKey: ["sub_assignments", mailId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mail_sub_assignments")
        .select("*")
        .eq("mail_id", mailId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      // Enrichir avec profils
      const userIds = new Set<string>();
      (data || []).forEach((s) => {
        userIds.add(s.sub_assigned_by);
        userIds.add(s.sub_assigned_to);
      });
      if (userIds.size === 0) return [] as SubAssignment[];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", Array.from(userIds));

      const profMap = new Map((profiles || []).map((p) => [p.id, p]));
      return (data || []).map((s) => ({
        ...s,
        sub_assigned_to_profile: profMap.get(s.sub_assigned_to),
        sub_assigned_by_profile: profMap.get(s.sub_assigned_by),
      })) as SubAssignment[];
    },
    enabled: !!mailId,
  });
}

export function useCreateSubAssignments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      mailId: string;
      parentAssignmentId: string;
      subAssignedBy: string;
      subAssignedToIds: string[];
      parentDeadlineAt: string | null;
      instructions?: string;
    }) => {
      const rows = params.subAssignedToIds.map((uid) => ({
        mail_id: params.mailId,
        parent_assignment_id: params.parentAssignmentId,
        sub_assigned_by: params.subAssignedBy,
        sub_assigned_to: uid,
        parent_deadline_at: params.parentDeadlineAt,
        submission_notes: params.instructions || null,
        status: "pending" as const,
      }));
      const { error } = await supabase.from("mail_sub_assignments").insert(rows);
      if (error) throw error;

      // Notifications
      const notifs = params.subAssignedToIds.map((uid) => ({
        user_id: uid,
        title: "Nouvelle sous-assignation",
        message: "Vous avez été délégué pour traiter une partie d'un courrier.",
        mail_id: params.mailId,
      }));
      await supabase.from("notifications").insert(notifs);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["sub_assignments", vars.mailId] });
      toast.success("Sous-assignation(s) créée(s)");
    },
    onError: (e: any) => toast.error(e.message || "Erreur lors de la sous-assignation"),
  });
}

export function useSubmitSubAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; mailId: string; notes: string }) => {
      const { error } = await supabase
        .from("mail_sub_assignments")
        .update({
          status: "submitted",
          submission_notes: params.notes,
          submitted_at: new Date().toISOString(),
        })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["sub_assignments", vars.mailId] });
      toast.success("Contribution soumise au délégant");
    },
    onError: (e: any) => toast.error(e.message || "Erreur lors de la soumission"),
  });
}

export function useValidateSubAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      mailId: string;
      decision: "validated" | "rejected";
      notes?: string;
    }) => {
      const { error } = await supabase
        .from("mail_sub_assignments")
        .update({
          status: params.decision,
          validation_notes: params.notes || null,
          validated_at: new Date().toISOString(),
        })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["sub_assignments", vars.mailId] });
      toast.success(vars.decision === "validated" ? "Contribution validée" : "Contribution rejetée");
    },
    onError: (e: any) => toast.error(e.message || "Erreur"),
  });
}

export function useDeleteSubAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; mailId: string }) => {
      const { error } = await supabase.from("mail_sub_assignments").delete().eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["sub_assignments", vars.mailId] });
      toast.success("Sous-assignation supprimée");
    },
    onError: (e: any) => toast.error(e.message || "Erreur"),
  });
}
