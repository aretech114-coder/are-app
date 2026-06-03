import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  advanceWorkflow,
  getStepInfo,
  submitStep4Treatment,
  submitStep7Acknowledgement,
  uploadMailDocument,
} from "@/lib/workflow-engine";
import { supabase } from "@/integrations/supabase/client";
import { compressFile, formatFileSize } from "@/lib/file-compressor";
import { useAuth } from "@/hooks/useAuth";
import { useActiveWorkflowSteps } from "@/hooks/useWorkflowSteps";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { MailRegistrationSheet } from "@/components/MailRegistrationSheet";
import { toast } from "sonner";
import { CheckCircle, XCircle, ArrowRight, Archive, Send, Upload, Users, FileText, AlertTriangle, CalendarIcon, Clock, MapPin, Reply } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getRoleLabel, UI_LABELS } from "@/lib/labels";
import { fetchWorkflowAssignableUsers } from "@/lib/workflow-assignment";
import { DgDecisionSummary, type DgAssignmentRow } from "@/components/DgDecisionSummary";
import { useMailContributions } from "@/hooks/useMailContributions";
import { MailContributionsPanel } from "@/components/MailContributionsPanel";

interface WorkflowActionsProps {
  mailId: string;
  currentStep: number;
  onAdvanced: () => void;
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export function WorkflowActions({ mailId, currentStep, onAdvanced }: WorkflowActionsProps) {
  const { user, role } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  const [action, setAction] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [annotation, setAnnotation] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [myAssignmentCompleted, setMyAssignmentCompleted] = useState(false);
  const [isLastPendingAssignee, setIsLastPendingAssignee] = useState(false);
  const [hasActiveAssignment, setHasActiveAssignment] = useState(false);
  const [hasCustodianAccess, setHasCustodianAccess] = useState(false);
  const [isDefaultResponsible, setIsDefaultResponsible] = useState(false);
  const [isInterimAssignee, setIsInterimAssignee] = useState(false);

  // Multi-assignment state
  const [assignableUsers, setAssignableUsers] = useState<UserProfile[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedViewers, setSelectedViewers] = useState<string[]>([]);
  const { contributions, fetchContributions } = useMailContributions(mailId, 4);
  const [step4AssigneeCount, setStep4AssigneeCount] = useState(0);

  const isDgRole =
    role === "directeur" || role === "ministre" || role === "dg" || role === "autorite_1";

  // Step 4: treatment type
  const [treatmentType, setTreatmentType] = useState<string>("");
  const [treatmentContent, setTreatmentContent] = useState("");

  // Step 2: RDV / Meeting scheduling
  // Step 2: RDV / Meeting scheduling
  const [scheduleRdv, setScheduleRdv] = useState(false);
  const [rdvDate, setRdvDate] = useState<Date>();
  const [rdvTime, setRdvTime] = useState("");
  const [rdvEndTime, setRdvEndTime] = useState("");
  const [rdvLocation, setRdvLocation] = useState("");
  const [rdvTitle, setRdvTitle] = useState("");
  const [rdvDescription, setRdvDescription] = useState("");

  // Step 8: AR generation
  const [arContent, setArContent] = useState("");
  const [arLoading, setArLoading] = useState(false);
  const [mailData, setMailData] = useState<any>(null);

  // Reply creation (sortant) — bouton optionnel selon config étape
  const [showReplySheet, setShowReplySheet] = useState(false);
  const [replyParentMail, setReplyParentMail] = useState<any>(null);
  const { data: activeSteps = [] } = useActiveWorkflowSteps();
  const { settings } = useSiteSettings();
  const authShort = settings.authority_title_short || UI_LABELS.dgShort;
  const authLong = settings.authority_title_long || UI_LABELS.dg;

  const stepInfo = getStepInfo(currentStep);

  const currentStepConfig = activeSteps.find((s) => s.step_order === currentStep);

  // Dynamic permission: workflow_steps is the source of truth.
  // A user can act on the current step if ANY of:
  //   - role is admin/superadmin
  //   - their role is in responsible_roles[]
  //   - their user_id is in responsible_user_ids[]
  //   - they have an active mail_assignments row on this mail + step
  const canAct = (() => {
    if (!role || !user) return false;
    if (role === "admin" || role === "superadmin") return true;
    if (currentStepConfig?.responsible_roles?.includes(role)) return true;
    if (currentStepConfig?.responsible_user_ids?.includes(user.id)) return true;
    if (hasActiveAssignment) return true;
    if (hasCustodianAccess && currentStep >= 2 && currentStep <= 6) return true;
    if (isDefaultResponsible) return true;
    if (isInterimAssignee && currentStep >= 2 && currentStep <= 6) return true;
    if (isDgRole && currentStep >= 2 && currentStep <= 6) return true;
    return false;
  })();

  // Detect any active assignment for the current user at the current step
  useEffect(() => {
    if (!user || !mailId || !currentStep) {
      setHasActiveAssignment(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("mail_assignments")
        .select("id, access_mode")
        .eq("mail_id", mailId)
        .eq("step_number", currentStep)
        .eq("assigned_to", user.id)
        .in("status", ["pending", "proposed", "submitted"]);
      if (!cancelled) {
        setHasActiveAssignment(!!data && data.some((a) => a.access_mode === "contributor"));
      }
    })();
    return () => { cancelled = true; };
  }, [user, mailId, currentStep]);

  // Custodian (intérim step 2) + intérimaire via assigned_agent_id
  useEffect(() => {
    if (!user || !mailId) {
      setHasCustodianAccess(false);
      setIsInterimAssignee(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: custodianRows }, { data: mailRow }] = await Promise.all([
        supabase
          .from("mail_assignments")
          .select("id")
          .eq("mail_id", mailId)
          .eq("assigned_to", user.id)
          .eq("access_mode", "custodian")
          .limit(1),
        supabase
          .from("mails")
          .select("ministre_absent, assigned_agent_id")
          .eq("id", mailId)
          .maybeSingle(),
      ]);
      if (!cancelled) {
        setHasCustodianAccess(!!custodianRows && custodianRows.length > 0);
        setIsInterimAssignee(
          !!mailRow?.ministre_absent && mailRow.assigned_agent_id === user.id
        );
      }
    })();
    return () => { cancelled = true; };
  }, [user, mailId]);

  // Default responsible for current step
  useEffect(() => {
    if (!user || !currentStep) {
      setIsDefaultResponsible(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("workflow_step_responsibles")
        .select("id")
        .eq("step_number", currentStep)
        .eq("is_active", true)
        .eq("default_user_id", user.id)
        .limit(1);
      if (!cancelled) setIsDefaultResponsible(!!data && data.length > 0);
    })();
    return () => { cancelled = true; };
  }, [user, currentStep]);

  const canCreateReply = !!currentStepConfig?.allow_reply_creation && canAct;

  // Charger le mail courant pour pré-remplir la réponse
  useEffect(() => {
    if (canCreateReply && !replyParentMail) {
      supabase
        .from("mails")
        .select("id, reference_number, sender_name, sender_organization, subject")
        .eq("id", mailId)
        .single()
        .then(({ data }) => {
          if (data) setReplyParentMail(data);
        });
    }
  }, [canCreateReply, mailId, replyParentMail]);

  // Minister annotation from step 2 (visible at step 3)
  const [dgStep2Context, setDgStep2Context] = useState<{
    notes: string | null;
    assignments: DgAssignmentRow[];
    meetings: { title: string; event_date: string; event_time: string | null; location: string | null }[];
  } | null>(null);

  // Check if current user already completed their step 4 or step 7 (acknowledgement)
  useEffect(() => {
    if ((currentStep === 4 || currentStep === 7) && user) {
      const checkStep = currentStep;
      (async () => {
        // Fetch all assignments for this step
        const { data: allAssignments } = await supabase
          .from("mail_assignments")
          .select("assigned_to, status")
          .eq("mail_id", mailId)
          .eq("step_number", checkStep);

        if (!allAssignments) return;

        const myAssignment = allAssignments.find(a => a.assigned_to === user.id);
        if (!myAssignment) return;

        if (currentStep === 4) {
          setMyAssignmentCompleted(myAssignment.status === "completed");
        } else if (currentStep === 7) {
          setMyAssignmentCompleted(myAssignment.status === "acknowledged");
        }

        // Check if I'm the last pending assignee
        const doneStatuses = currentStep === 4 ? ["completed"] : ["acknowledged"];
        const pendingOthers = allAssignments.filter(
          a => a.assigned_to !== user.id && !doneStatuses.includes(a.status)
        );
        setIsLastPendingAssignee(pendingOthers.length === 0);
      })();
    }
  }, [currentStep, mailId, user]);

  useEffect(() => {
    if (currentStep !== 4 || !mailId) {
      setStep4AssigneeCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("mail_assignments")
        .select("id", { count: "exact", head: true })
        .eq("mail_id", mailId)
        .eq("step_number", 4)
        .eq("access_mode", "contributor");
      if (!cancelled) setStep4AssigneeCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [currentStep, mailId, contributions.length]);

  // Fetch mail data for step 8
  useEffect(() => {
    if (currentStep === 8 || (showDialog && currentStep === 8)) {
      supabase.from("mails").select("*").eq("id", mailId).single().then(({ data }) => {
        if (data) {
          setMailData(data);
          if (data.ai_draft) setArContent(data.ai_draft);
        }
      });
    }
  }, [currentStep, mailId, showDialog]);

  // Fetch assignable users when dialog opens for steps that need assignment
  useEffect(() => {
    if (showDialog && (currentStep === 2 || currentStep === 3 || currentStep === 5 || currentStep === 6)) {
      fetchAssignableUsers();
    }
    if (showDialog && currentStep === 3) {
      fetchDgStep2Context();
      fetchProposedAssignees();
    }
    if (showDialog && currentStep === 5) {
      fetchProposedAssignees();
    }
  }, [showDialog, currentStep]);

  const fetchDgStep2Context = async () => {
    const [transRes, assignRes, meetRes] = await Promise.all([
      supabase
        .from("workflow_transitions")
        .select("notes, to_step")
        .eq("mail_id", mailId)
        .eq("from_step", 2)
        .in("to_step", [3, 4])
        .eq("action", "approve")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("mail_assignments")
        .select("assigned_to, access_mode")
        .eq("mail_id", mailId)
        .eq("step_number", 4)
        .in("status", ["proposed", "pending"]),
      supabase
        .from("calendar_events")
        .select("title, event_date, event_time, location")
        .eq("mail_id", mailId),
    ]);

    const notes = transRes.data?.notes ?? null;
    let assignments: DgAssignmentRow[] = [];
    if (assignRes.data?.length) {
      const ids = assignRes.data.map((a) => a.assigned_to);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      assignments = assignRes.data.map((a) => ({
        full_name: profiles?.find((p) => p.id === a.assigned_to)?.full_name || "Inconnu",
        access_mode: a.access_mode || "contributor",
      }));
    }

    setDgStep2Context({
      notes,
      assignments,
      meetings: meetRes.data || [],
    });
  };

  const fetchAssignableUsers = async () => {
    try {
      if (currentStep === 2) {
        const users = await fetchWorkflowAssignableUsers();
        setAssignableUsers(users);
        return;
      }

      const targetRoles = ["conseiller_juridique", "dircab", "dircaba", "agent", "daf", "dt", "dg", "dga"];
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", targetRoles as any);

      if (rolesError) throw rolesError;
      if (!roles?.length) {
        setAssignableUsers([]);
        return;
      }

      const roleByUser = new Map<string, string>();
      for (const row of roles) {
        if (!roleByUser.has(row.user_id)) roleByUser.set(row.user_id, String(row.role));
      }

      const userIds = [...roleByUser.keys()];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      const merged = (profiles || [])
        .map((p) => ({
          id: p.id,
          full_name: p.full_name || p.email || "Utilisateur",
          email: p.email,
          role: roleByUser.get(p.id) || "",
        }))
        .sort((a, b) =>
          a.full_name.localeCompare(b.full_name, "fr", { sensitivity: "base" })
        );
      setAssignableUsers(merged);
    } catch {
      setAssignableUsers([]);
      toast.error("Impossible de charger la liste des utilisateurs assignables.");
    }
  };

  const fetchProposedAssignees = async () => {
    const { data } = await supabase
      .from("mail_assignments")
      .select("assigned_to")
      .eq("mail_id", mailId)
      .eq("step_number", 4)
      .in("status", ["proposed", "pending"]);
    if (data && data.length > 0) {
      setSelectedAssignees(data.map(a => a.assigned_to));
    }
  };

  const toggleAssignee = (userId: string) => {
    setSelectedAssignees(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleViewer = (userId: string) => {
    setSelectedViewers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Determine available actions based on current step
  const getActions = () => {
    const stepLabels = (currentStepConfig?.action_labels || {}) as Record<string, string>;
    const iconFor: Record<string, typeof CheckCircle> = {
      approve: CheckCircle,
      complete: Send,
      acknowledge: CheckCircle,
      reject: XCircle,
      archive: Archive,
    };
    const variantFor: Record<string, "default" | "destructive" | "outline"> = {
      reject: "destructive",
      archive: "outline",
    };

    // Step 4: contributors submit "complete"; DG can dg_advance
    if (currentStep === 4) {
      const actions: { key: string; label: string; icon: typeof CheckCircle; variant: "default" | "destructive" | "outline" }[] = [];
      if (hasActiveAssignment) {
        actions.push({
          key: "complete",
          label: stepLabels.complete || "Soumettre mon traitement",
          icon: Send,
          variant: "default",
        });
      }
      if (isDgRole) {
        actions.push({
          key: "dg_advance",
          label: "Valider (DG) — passer à l'étape suivante",
          icon: ArrowRight,
          variant: "default",
        });
      }
      if (actions.length > 0) return actions;
    }

    // Step 7: acknowledgement only for assigned conseillers
    if (currentStep === 7 && hasActiveAssignment) {
      return [{
        key: "acknowledge",
        label: stepLabels.acknowledge || "Confirmer la consultation",
        icon: CheckCircle,
        variant: "default",
      }];
    }

    const actions: { key: string; label: string; icon: typeof CheckCircle; variant: "default" | "destructive" | "outline" }[] = [];

    if (currentStepConfig) {
      const configuredKeys = Object.keys(stepLabels);
      if (configuredKeys.length > 0) {
        configuredKeys.forEach((key) => {
          actions.push({
            key,
            label: stepLabels[key] || key,
            icon: iconFor[key] || ArrowRight,
            variant: variantFor[key] || "default",
          });
        });
      } else {
        const maxOrder = Math.max(...activeSteps.map((s) => s.step_order), 0);
        const isFinal = currentStep === maxOrder;
        if (isFinal) {
          actions.push({ key: "archive", label: "Archiver définitivement", icon: Archive, variant: "outline" });
        } else {
          const prevStep = [...activeSteps].reverse().find((s) => s.step_order < currentStep);
          const nextStep = activeSteps.find((s) => s.step_order > currentStep);
          actions.push({
            key: "approve",
            label: nextStep ? `Approuver → ${nextStep.name}` : "Approuver & Transmettre",
            icon: ArrowRight,
            variant: "default",
          });
          actions.push({
            key: "reject",
            label: prevStep ? `Renvoyer à : ${prevStep.name}` : "Rejeter",
            icon: XCircle,
            variant: "destructive",
          });
        }
      }
    }

    return actions;
  };

  const handleAction = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Upload attachment if provided (step 4 uploads handled in treatment RPC block)
      let annotationAttachmentUrl: string | null = null;
      if (attachmentFile && currentStep !== 4) {
        const { file: compressedFile, originalSize, compressedSize, wasCompressed } = await compressFile(attachmentFile);
        if (wasCompressed) {
          toast.info(`Fichier compressé : ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}`);
        }
        const sanitizedName = compressedFile.name
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .replace(/_+/g, "_");
        const filePath = `annotations/${mailId}/${Date.now()}_${sanitizedName}`;
        const { error: uploadErr } = await supabase.storage.from("mail-documents").upload(filePath, compressedFile);
        if (uploadErr) {
          const msg = uploadErr.message || "";
          if (/row-level security/i.test(msg)) {
            throw new Error(
              "Impossible de joindre le fichier : votre rôle n'a pas les droits d'upload (directeur/DG). Appliquez la migration SQL 20260601120000 sur Supabase."
            );
          }
          throw uploadErr;
        }
        const { data: urlData } = await supabase.storage.from("mail-documents").createSignedUrl(filePath, 60 * 60 * 24 * 365);
        annotationAttachmentUrl = urlData?.signedUrl || null;
      }

      // Build full notes
      const noteParts = [
        annotation && `📝 Annotation: ${annotation}`,
        annotationAttachmentUrl && `📎 Document joint: ${annotationAttachmentUrl}`,
        selectedAssignees.length > 0 && `👥 Personnes assignées: ${selectedAssignees.map(id => assignableUsers.find(u => u.id === id)?.full_name).filter(Boolean).join(", ")}`,
        treatmentType && `📄 Type de document: ${treatmentType === "note_technique" ? "Note Technique" : "Accusé de Réception"}`,
        treatmentContent && `📋 Contenu:\n${treatmentContent}`,
        notes && `💬 Notes: ${notes}`,
        scheduleRdv && rdvDate && `📅 RDV planifié: ${format(rdvDate, "dd/MM/yyyy", { locale: fr })}${rdvTime ? ` à ${rdvTime}` : ""}${rdvLocation ? ` — Lieu: ${rdvLocation}` : ""}`,
      ].filter(Boolean).join("\n");

      // For step 6 rejection, override to go back to step 4
      let effectiveAction = action;
      if (currentStep === 6 && action === "reject") {
        effectiveAction = "reject";
      }

      if (action === "dg_advance") {
        const result = await advanceWorkflow(mailId, currentStep, "dg_advance", user.id, noteParts || notes, {
          assigneeIds: selectedAssignees.length > 0 ? selectedAssignees : undefined,
        });
        if (result.success) {
          toast.success(`Courrier avancé à l'étape ${result.newStep}`);
          setShowDialog(false);
          resetForm();
          onAdvanced();
        } else {
          toast.error(result.error || "Erreur lors de l'avancement");
        }
        setLoading(false);
        return;
      }

      // STEP 4: atomic RPC (contribution + assignment + optional auto-advance)
      if (currentStep === 4 && action === "complete") {
        let treatmentAttachments: { url: string; name?: string }[] = [];
        if (attachmentFile) {
          const { file: compressedFile, originalSize, compressedSize, wasCompressed } =
            await compressFile(attachmentFile);
          if (wasCompressed) {
            toast.info(`Fichier compressé : ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}`);
          }
          try {
            treatmentAttachments = [await uploadMailDocument(mailId, compressedFile, "treatments")];
          } catch (uploadErr: any) {
            const msg = uploadErr?.message || "";
            if (/row-level security/i.test(msg)) {
              throw new Error(
                "Impossible de joindre le fichier : droits d'upload insuffisants. Appliquez la migration Storage sur Supabase."
              );
            }
            throw uploadErr;
          }
        }

        const result = await submitStep4Treatment(
          mailId,
          treatmentContent || null,
          treatmentAttachments,
          noteParts || notes || undefined
        );

        if (!result.success) {
          toast.error(result.error || "Erreur lors de la soumission");
        } else if (result.allCompleted) {
          toast.success(
            result.newStep
              ? `Tous les conseillers ont soumis — dossier avancé à l'étape ${result.newStep}`
              : "Tous les conseillers ont soumis — dossier avancé à l'étape 5"
          );
        } else {
          toast.success(
            `Traitement soumis ! En attente de ${result.remaining ?? 0} autre(s) conseiller(s).`
          );
        }

        setShowDialog(false);
        resetForm();
        onAdvanced();
        setLoading(false);
        return;
      }

      // STEP 7: atomic RPC acknowledgement
      if (currentStep === 7 && action === "acknowledge") {
        const result = await submitStep7Acknowledgement(
          mailId,
          noteParts || notes || undefined
        );

        if (!result.success) {
          toast.error(result.error || "Erreur");
        } else if (result.allAcknowledged) {
          toast.success(
            result.newStep
              ? `Tous les conseillers ont confirmé — dossier avancé à l'étape ${result.newStep}`
              : "Tous les conseillers ont confirmé — dossier avancé à l'étape suivante"
          );
        } else {
          toast.success(
            `Consultation confirmée ! En attente de ${result.remaining ?? 0} autre(s) conseiller(s).`
          );
        }

        setShowDialog(false);
        resetForm();
        onAdvanced();
        setLoading(false);
        return;
      }

      // STEP 8 COMPLETE: Use RPC to advance to step 9 (archive)
      if (currentStep === 8 && action === "complete") {
        const result = await advanceWorkflow(mailId, currentStep, "complete", user.id, noteParts || "Preuve de dépôt ajoutée.");
        if (result.success) {
          toast.success("Preuve de dépôt ajoutée — dossier archivé avec succès");
        } else {
          toast.error(result.error || "Erreur lors de l'archivage");
        }
        setShowDialog(false);
        resetForm();
        onAdvanced();
        setLoading(false);
        return;
      }

      // Build advance options: pass assignee IDs for dynamic steps (step 3 → step 4)
      // Also handle step 5 reassignment (DGA modifies step 4 assignees before approve/reject)
      const assigneeIds = ([2, 3, 5].includes(currentStep) && selectedAssignees.length > 0)
        ? selectedAssignees
        : undefined;
      const viewerIds =
        currentStep === 2 && selectedViewers.length > 0 ? selectedViewers : undefined;

      const result = await advanceWorkflow(mailId, currentStep, effectiveAction, user.id, noteParts || notes, {
        assigneeIds,
        viewerIds,
      });

      if (result.success) {
        // Step 2 proposed assignments handled atomically by advance_workflow_step RPC
        // No more client-side direct updates to mails.current_step

        // Save calendar event if RDV was scheduled
        if (scheduleRdv && rdvDate && user) {
          const participants = selectedAssignees.map(id => assignableUsers.find(u => u.id === id)?.full_name).filter(Boolean) as string[];
          const participantIds = selectedAssignees;
          await supabase.from("calendar_events").insert({
            mail_id: mailId,
            title: rdvTitle || "RDV — Courrier",
            description: rdvDescription || annotation || null,
            event_date: format(rdvDate, "yyyy-MM-dd"),
            event_time: rdvTime || null,
            end_time: rdvEndTime || null,
            location: rdvLocation || null,
            participants,
            participant_ids: participantIds,
            created_by: user.id,
          } as any);
        }

        toast.success(`Courrier avancé à l'étape ${result.newStep}`);
        setShowDialog(false);
        resetForm();
        onAdvanced();
      } else {
        toast.error(result.error || "Erreur lors de la transition");
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNotes("");
    setAnnotation("");
    setAttachmentFile(null);
    setSelectedAssignees([]);
    setSelectedViewers([]);
    setTreatmentType("");
    setTreatmentContent("");
    setDgStep2Context(null);
    setScheduleRdv(false);
    setRdvDate(undefined);
    setRdvTime("");
    setRdvEndTime("");
    setRdvLocation("");
    setRdvTitle("");
    setRdvDescription("");
    setArContent("");
    setArLoading(false);
    setMailData(null);
  };

  const actions = getActions();
  if (actions.length === 0 || !canAct) return null;

  // If this conseiller already submitted at step 4 or acknowledged at step 7
  if (currentStep === 4 && myAssignmentCompleted) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle className="h-4 w-4 text-success" />
        <span>Votre traitement a été soumis. En attente des autres conseillers.</span>
      </div>
    );
  }
  if (currentStep === 7 && myAssignmentCompleted) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle className="h-4 w-4 text-success" />
        <span>Consultation confirmée. En attente des autres conseillers.</span>
      </div>
    );
  }

  const showAnnotation = currentStep === 2 || currentStep === 3 || currentStep === 6;
  const showAssignment = currentStep === 2 || currentStep === 3 || currentStep === 5;
  const showAttachment = currentStep === 2 || currentStep === 3 || currentStep === 4 || currentStep === 8;
  const showTreatment = currentStep === 4;

  const roleLabel = (slug: string) => getRoleLabel(slug);

  const dialogTitle: Record<number, string> = {
    2: UI_LABELS.dgAnnotation,
    3: "Filtrage & Confirmation — DGA",
    4: "Traitement du dossier — Conseiller",
    5: "Vérification — DGA",
    6: UI_LABELS.dgValidation,
    7: "Consultation — Conseiller",
    8: "Retour & Preuve de Dépôt — Secrétariat",
    9: "Archivage Final",
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canCreateReply && (
          <Button
            variant="outline"
            size="sm"
            className="border-primary/40 text-primary hover:bg-primary/10 w-full sm:w-auto"
            onClick={() => setShowReplySheet(true)}
          >
            <Reply className="h-4 w-4 mr-1" />
            Créer une réponse
          </Button>
        )}
        {actions.map((a) => (
          <Button
            key={a.key}
            variant={a.variant}
            size="sm"
            onClick={() => {
              setAction(a.key);
              setShowDialog(true);
            }}
          >
            <a.icon className="h-4 w-4 mr-1" />
            {a.label}
          </Button>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) resetForm(); }}>
        <DialogContent className="w-[min(96vw,52rem)] max-w-[52rem] max-h-[90vh] overflow-y-auto overflow-x-hidden flex flex-col gap-0 p-6 sm:p-8">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {dialogTitle[currentStep] || "Confirmer l'action"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 min-w-0 flex-1 py-2">
            <p className="text-sm text-muted-foreground">
              Étape actuelle : <strong>{stepInfo?.name}</strong>
            </p>

            {(currentStep === 2 || currentStep === 4 || currentStep === 6) && (
              <MailContributionsPanel
                contributions={contributions}
                assigneeCount={currentStep === 4 ? step4AssigneeCount : undefined}
                title={
                  isDgRole
                    ? "Contributions des assignés (temps réel)"
                    : "Contributions au traitement"
                }
                showDrafts={isDgRole}
              />
            )}

            {currentStep === 4 && step4AssigneeCount > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {step4AssigneeCount} personne(s) assignée(s) à ce traitement
              </p>
            )}

            {/* Step 4: Treatment type and content */}
            {showTreatment && action === "complete" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Type de document à produire</Label>
                  <Select value={treatmentType} onValueChange={setTreatmentType}>
                    <SelectTrigger><SelectValue placeholder="Sélectionnez le type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="note_technique">
                        <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Note Technique</span>
                      </SelectItem>
                      <SelectItem value="accuse_reception">
                        <span className="flex items-center gap-1.5"><Send className="h-3.5 w-3.5" /> Accusé de Réception</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Contenu du document
                  </Label>
                  <Textarea
                    placeholder="Rédigez votre note technique ou accusé de réception ici..."
                    value={treatmentContent}
                    onChange={(e) => setTreatmentContent(e.target.value)}
                    rows={8}
                    className="min-h-[200px]"
                  />
                </div>
              </>
            )}

            {/* Step 8: Accusé de réception generation and proof of deposit */}
            {currentStep === 8 && (
              <div className="space-y-4">
                {mailData?.mail_type === "accuse_reception" || mailData?.mail_type === "accusé_reception" ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Accusé de Réception
                      </Label>
                      {!arContent && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={arLoading}
                          onClick={async () => {
                            setArLoading(true);
                            try {
                              // Fetch full workflow history for context
                              const { data: transitions } = await supabase
                                .from("workflow_transitions")
                                .select("from_step, to_step, notes, action, performed_by")
                                .eq("mail_id", mailId)
                                .order("created_at", { ascending: true });

                              // Fetch performer names
                              const performerIds = [...new Set(transitions?.map(t => t.performed_by) || [])];
                              const { data: profiles } = performerIds.length > 0
                                ? await supabase.from("profiles").select("id, full_name").in("id", performerIds)
                                : { data: [] };
                              const nameMap = new Map((profiles || []).map(p => [p.id, p.full_name] as [string, string]));

                              // Build chronological workflow summary
                              const workflowSummary = transitions?.map(t => {
                                const performer = nameMap.get(t.performed_by) || "Système";
                                return `[Étape ${t.from_step} → ${t.to_step}] (${performer}) Action: ${t.action}${t.notes ? `\n${t.notes}` : ""}`;
                              }).join("\n\n") || "";

                              const { data, error } = await supabase.functions.invoke("ai-assistant", {
                                body: {
                                  type: "accuse_reception",
                                  subject: mailData?.subject,
                                  description: mailData?.description,
                                  senderName: mailData?.sender_name,
                                  senderOrganization: mailData?.sender_organization,
                                  senderAddress: mailData?.sender_address,
                                  referenceNumber: mailData?.reference_number,
                                  attachmentUrl: mailData?.attachment_url,
                                  workflowHistory: workflowSummary,
                                  aiDraft: mailData?.ai_draft,
                                },
                              });
                              if (error) throw error;
                              const content = data?.content || "";
                              setArContent(content);
                              await supabase.from("mails").update({ ai_draft: content } as any).eq("id", mailId);
                              toast.success("Accusé de réception généré");
                            } catch (e: any) {
                              toast.error("Erreur: " + (e.message || "Impossible de générer"));
                            } finally {
                              setArLoading(false);
                            }
                          }}
                        >
                          {arLoading ? "Génération..." : "Générer l'accusé"}
                        </Button>
                      )}
                    </div>

                    {arContent ? (
                      <div className="space-y-2">
                        <div className="border rounded-lg p-4 bg-card text-sm whitespace-pre-wrap max-h-64 overflow-auto">
                          {arContent}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const printWindow = window.open("", "_blank");
                              if (printWindow) {
                                const escapeHtml = (s: string) => s
                                  .replace(/&/g, '&amp;')
                                  .replace(/</g, '&lt;')
                                  .replace(/>/g, '&gt;')
                                  .replace(/"/g, '&quot;');
                                const safeRef = escapeHtml(mailData?.reference_number || "");
                                const safeContent = escapeHtml(arContent).replace(/\n/g, "<br/>");
                                printWindow.document.write(`
                                   <html>
                                     <head>
                                       <title>Accusé de Réception — ${safeRef}</title>
                                       <style>
                                         body { font-family: 'Times New Roman', serif; padding: 40px 60px; line-height: 1.6; }
                                         .ref { font-size: 12px; color: #666; margin-bottom: 20px; }
                                         .content { white-space: pre-wrap; }
                                       </style>
                                     </head>
                                     <body>
                                       <div class="ref">Réf: ${safeRef}</div>
                                       <div class="content">${safeContent}</div>
                                     </body>
                                   </html>
                                 `);
                                printWindow.document.close();
                                printWindow.print();
                              }
                            }}
                          >
                            🖨️ Imprimer sur papier en-tête
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(arContent);
                              toast.success("Copié dans le presse-papiers");
                            }}
                          >
                            Copier
                          </Button>
                        </div>
                      </div>
                    ) : arLoading ? (
                      <div className="flex items-center justify-center py-6 text-muted-foreground">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent mr-2" />
                        Génération de l'accusé de réception...
                      </div>
                    ) : null}

                    <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        <strong>📋 Instructions :</strong> Imprimez l'accusé de réception sur papier en-tête, 
                        faites-le signer, puis joignez la preuve de dépôt signée ci-dessous avant de confirmer.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <p className="text-sm text-muted-foreground">
                      📄 Ce courrier n'est pas de type "Accusé de Réception". 
                      Joignez la preuve de dépôt ci-dessous pour finaliser.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 5/6: Show rejection warning */}
            {(currentStep === 5 || currentStep === 6) && action === "reject" && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Rejet du dossier</p>
                  <p className="text-xs text-muted-foreground">
                    Le dossier sera renvoyé à l'étape 4 (Traitement) pour correction par les conseillers assignés.
                  </p>
                </div>
              </div>
            )}

            {currentStep === 3 && dgStep2Context?.notes && (
              <div className="rounded-lg border bg-muted/30 p-3 min-w-0">
                <p className="text-xs font-semibold text-primary mb-2">
                  Rappel — décision du {UI_LABELS.dgShort}
                </p>
                <DgDecisionSummary
                  notes={dgStep2Context.notes}
                  assignments={dgStep2Context.assignments}
                  meetings={dgStep2Context.meetings}
                  compact
                />
              </div>
            )}

            {/* Annotation field */}
            {showAnnotation && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {currentStep === 2 ? `Annotation / Instructions du ${UI_LABELS.dgShort}` : currentStep === 6 ? "Commentaire de validation" : "Notes du DGA"}
                </Label>
                <Textarea
                  placeholder={
                    currentStep === 2
                      ? UI_LABELS.dgInstructions
                      : currentStep === 6
                        ? UI_LABELS.dgValidationComment
                        : "Observations du DGA sur les assignations..."
                  }
                  value={annotation}
                  onChange={(e) => setAnnotation(e.target.value)}
                  rows={4}
                />
              </div>
            )}

            {/* Step 2: RDV / Meeting scheduling */}
            {currentStep === 2 && (
              <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={scheduleRdv}
                    onCheckedChange={(checked) => setScheduleRdv(!!checked)}
                  />
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Planifier un RDV / Réunion pour ce courrier
                  </span>
                </label>

                {scheduleRdv && (
                  <div className="space-y-3 pl-6 animate-fade-in">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Titre du RDV</Label>
                      <Input
                        placeholder="Ex: Audience avec le Directeur Général..."
                        value={rdvTitle}
                        onChange={(e) => setRdvTitle(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <Label className="text-sm flex items-center gap-1">
                          <CalendarIcon className="h-3 w-3" /> Date
                        </Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !rdvDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {rdvDate ? format(rdvDate, "dd MMM yyyy", { locale: fr }) : "Choisir une date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={rdvDate}
                              onSelect={setRdvDate}
                              disabled={(date) => date < new Date()}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-sm flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Heure de début
                        </Label>
                        <Input
                          type="time"
                          value={rdvTime}
                          onChange={(e) => setRdvTime(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <Label className="text-sm flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Heure de fin
                        </Label>
                        <Input
                          type="time"
                          value={rdvEndTime}
                          onChange={(e) => setRdvEndTime(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-sm flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> Lieu
                        </Label>
                        <Input
                          placeholder="Salle de réunion, bureau..."
                          value={rdvLocation}
                          onChange={(e) => setRdvLocation(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm">Description / Ordre du jour</Label>
                      <Textarea
                        placeholder="Points à aborder lors de la réunion..."
                        value={rdvDescription}
                        onChange={(e) => setRdvDescription(e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Attachment */}
            {showAttachment && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  Joindre un document
                </Label>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {attachmentFile ? (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="truncate">{attachmentFile.name}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setAttachmentFile(null); }}>
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Cliquez pour sélectionner un fichier</p>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>
            )}

            {/* Multi-assignment */}
            {showAssignment && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {currentStep === 2 ? UI_LABELS.assignForTreatment : currentStep === 5 ? "Modifier les assignés (étape traitement)" : "Confirmer / Modifier les assignations"}
                </Label>
                {assignableUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Chargement des utilisateurs...</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-auto border rounded-lg p-2">
                    {assignableUsers.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 p-2 rounded hover:bg-accent/50 cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selectedAssignees.includes(u.id)}
                          onCheckedChange={() => toggleAssignee(u.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.full_name}</p>
                          {currentStep !== 2 && (
                            <p className="text-xs text-muted-foreground">{roleLabel(u.role)}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {selectedAssignees.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedAssignees.length} personne(s) sélectionnée(s)
                  </p>
                )}
              </div>
            )}

            {showAssignment && currentStep === 2 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Mettre en copie (lecture seule)
                </Label>
                <div className="space-y-1 max-h-36 overflow-auto border rounded-lg p-2 border-dashed">
                  {assignableUsers.map((u) => (
                    <label
                      key={`viewer-${u.id}`}
                      className="flex items-center gap-2 p-2 rounded hover:bg-accent/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedViewers.includes(u.id)}
                        onCheckedChange={() => toggleViewer(u.id)}
                        disabled={selectedAssignees.includes(u.id)}
                      />
                      <span className="text-sm truncate">{u.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* General notes */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Notes supplémentaires</Label>
              <Textarea
                placeholder="Notes ou instructions (optionnel)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 flex-col-reverse sm:flex-row gap-2 sm:gap-2 pt-4 border-t mt-2">
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => { setShowDialog(false); resetForm(); }}
            >
              Annuler
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleAction}
              disabled={loading || (showTreatment && action === "complete" && (!treatmentType || !treatmentContent)) || (currentStep === 8 && !attachmentFile)}
              variant={action === "reject" ? "destructive" : "default"}
            >
              {loading ? "En cours..." : action === "reject" ? "Confirmer le rejet" : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canCreateReply && (
        <MailRegistrationSheet
          open={showReplySheet}
          onOpenChange={setShowReplySheet}
          direction="sortant"
          parentMail={replyParentMail}
          onCreated={() => {
            setShowReplySheet(false);
            onAdvanced();
          }}
        />
      )}
    </>
  );
}