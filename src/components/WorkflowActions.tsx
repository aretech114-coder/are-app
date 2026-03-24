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
import { advanceWorkflow, getStepInfo } from "@/lib/workflow-engine";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle, XCircle, ArrowRight, Archive, Send, Upload, Users, FileText, AlertTriangle, CalendarIcon, Clock, MapPin } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

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

  // Multi-assignment state
  const [assignableUsers, setAssignableUsers] = useState<UserProfile[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

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

  const stepInfo = getStepInfo(currentStep);

  // Map roles to their allowed steps
  // Reception is NOT a workflow step — only submission
  const roleStepMap: Record<string, number[]> = {
    secretariat: [8, 9],
    ministre: [2, 6],
    dircab: [3, 5],
    dircaba: [3],
    conseiller_juridique: [4, 7],
    conseiller: [4, 7],
    admin: [2, 3, 4, 5, 6, 7, 8, 9],
    superadmin: [2, 3, 4, 5, 6, 7, 8, 9],
  };

  const canAct = role ? (roleStepMap[role] || []).includes(currentStep) : false;

  // Minister annotation from step 2 (visible at step 3)
  const [ministerAnnotation, setMinisterAnnotation] = useState("");

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
      fetchMinisterAnnotation();
      fetchProposedAssignees();
    }
    if (showDialog && currentStep === 5) {
      fetchProposedAssignees();
    }
  }, [showDialog, currentStep]);

  const fetchMinisterAnnotation = async () => {
    const { data } = await supabase
      .from("workflow_transitions")
      .select("notes")
      .eq("mail_id", mailId)
      .eq("from_step", 2)
      .eq("to_step", 3)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (data?.notes) setMinisterAnnotation(data.notes);
  };

  const fetchAssignableUsers = async () => {
    let rolesQuery;
    if (currentStep === 2) {
      // Minister sees all users except superadmin
      rolesQuery = supabase
        .from("user_roles")
        .select("user_id, role")
        .neq("role", "superadmin" as any);
    } else {
      const targetRoles = ["conseiller_juridique", "dircab", "dircaba", "agent"];
      rolesQuery = supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", targetRoles as any);
    }

    const { data: roles } = await rolesQuery;
    if (!roles) return;

    const userIds = roles.map(r => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    if (profiles) {
      const merged = profiles.map(p => ({
        ...p,
        role: roles.find(r => r.user_id === p.id)?.role || "",
      }));
      setAssignableUsers(merged);
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

  // Determine available actions based on current step
  const getActions = () => {
    const actions: { key: string; label: string; icon: typeof CheckCircle; variant: "default" | "destructive" | "outline" }[] = [];

    if (currentStep === 2) {
      actions.push({ key: "approve", label: "Annoter & Transmettre au DirCab", icon: ArrowRight, variant: "default" });
    } else if (currentStep === 3) {
      actions.push({ key: "approve", label: "Confirmer & Affecter", icon: CheckCircle, variant: "default" });
      actions.push({ key: "reject", label: "Renvoyer au Ministre", icon: XCircle, variant: "destructive" });
    } else if (currentStep === 4) {
      const label = isLastPendingAssignee ? "Enregistrer & Valider le traitement" : "Enregistrer mon traitement";
      actions.push({ key: "complete", label, icon: Send, variant: "default" });
    } else if (currentStep === 5) {
      actions.push({ key: "approve", label: "Approuver → Validation Ministre", icon: CheckCircle, variant: "default" });
      actions.push({ key: "reject", label: "Renvoyer au traitement (Étape 4)", icon: XCircle, variant: "destructive" });
    } else if (currentStep === 6) {
      actions.push({ key: "approve", label: "Valider & Finaliser", icon: CheckCircle, variant: "default" });
      actions.push({ key: "reject", label: "Rejeter (retour étape 4)", icon: XCircle, variant: "destructive" });
    } else if (currentStep === 7) {
      actions.push({ key: "acknowledge", label: "Consultation terminée", icon: CheckCircle, variant: "default" });
    } else if (currentStep === 8) {
      actions.push({ key: "complete", label: "Preuve de dépôt ajoutée", icon: Send, variant: "default" });
    } else if (currentStep === 9) {
      actions.push({ key: "archive", label: "Archiver définitivement", icon: Archive, variant: "outline" });
    }

    return actions;
  };

  const handleAction = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Upload attachment if provided
      let annotationAttachmentUrl: string | null = null;
      if (attachmentFile) {
        const sanitizedName = attachmentFile.name
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .replace(/_+/g, "_");
        const filePath = `annotations/${mailId}/${Date.now()}_${sanitizedName}`;
        const { error: uploadErr } = await supabase.storage.from("mail-documents").upload(filePath, attachmentFile);
        if (uploadErr) throw uploadErr;
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

      // STEP 4 MULTI-ASSIGNEE LOGIC:
      // When a conseiller completes step 4, mark their assignment as completed.
      // Only advance the workflow when ALL assignees have completed.
      if (currentStep === 4 && action === "complete") {
        // Save treatment content
        if (treatmentContent) {
          // Append to existing ai_draft or set it
          const { data: currentMail } = await supabase.from("mails").select("ai_draft").eq("id", mailId).single();
          const existingDraft = currentMail?.ai_draft || "";
          const { data: myProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
          const authorName = myProfile?.full_name || "Conseiller";
          const newDraft = existingDraft
            ? `${existingDraft}\n\n--- ${authorName} ---\n${treatmentContent}`
            : `--- ${authorName} ---\n${treatmentContent}`;

          await supabase.from("mails").update({
            ai_draft: newDraft,
            mail_type: treatmentType || undefined,
          } as any).eq("id", mailId);
        }

        // Mark my assignment as completed
        await supabase.from("mail_assignments")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("mail_id", mailId)
          .eq("assigned_to", user.id)
          .eq("step_number", 4);

        // Record a workflow transition note (without advancing)
        await supabase.from("workflow_transitions").insert({
          mail_id: mailId,
          from_step: 4,
          to_step: 4,
          action: "submit_treatment",
          performed_by: user.id,
          notes: noteParts || notes || null,
        });

        // Check if ALL assignees for step 4 have completed
        const { data: allAssignments } = await supabase
          .from("mail_assignments")
          .select("id, status")
          .eq("mail_id", mailId)
          .eq("step_number", 4);

        const allCompleted = allAssignments && allAssignments.length > 0 &&
          allAssignments.every(a => a.status === "completed");

        if (allCompleted) {
          // All done — advance workflow to step 5 (auto-assignment handled by advanceWorkflow)
          const result = await advanceWorkflow(mailId, currentStep, "complete", user.id,
            `✅ Tous les conseillers assignés ont terminé leur traitement.`);
          if (result.success) {
            toast.success("Tous les conseillers ont soumis — dossier avancé à l'étape 5");
          } else {
            toast.error(result.error || "Erreur lors de l'avancement");
          }
        } else {
          const remaining = allAssignments ? allAssignments.filter(a => a.status !== "completed").length : 0;
          toast.success(`Traitement soumis ! En attente de ${remaining} autre(s) conseiller(s).`);
        }

        setShowDialog(false);
        resetForm();
        onAdvanced();
        setLoading(false);
        return;
      }

      // STEP 7 ACKNOWLEDGEMENT LOGIC:
      // Conseillers acknowledge they've seen the minister's validation
      if (currentStep === 7 && action === "acknowledge") {
        // Mark step 7 assignment as acknowledged
        await supabase.from("mail_assignments")
          .update({ status: "acknowledged" })
          .eq("mail_id", mailId)
          .eq("assigned_to", user.id)
          .eq("step_number", 7);

        // Record transition
        await supabase.from("workflow_transitions").insert({
          mail_id: mailId,
          from_step: 7,
          to_step: 7,
          action: "acknowledge",
          performed_by: user.id,
          notes: noteParts || "Consultation de la validation confirmée.",
        });

        // Check if ALL conseillers have acknowledged (check step 7 assignments)
        const { data: allAssignments } = await supabase
          .from("mail_assignments")
          .select("id, status")
          .eq("mail_id", mailId)
          .eq("step_number", 7);

        const allAcknowledged = allAssignments && allAssignments.length > 0 &&
          allAssignments.every(a => a.status === "acknowledged");

        if (allAcknowledged) {
          const result = await advanceWorkflow(mailId, currentStep, "complete", user.id,
            "✅ Tous les conseillers ont consulté la validation.");
          if (result.success) {
            toast.success("Tous les conseillers ont confirmé — dossier avancé à l'étape suivante");
          } else {
            toast.error(result.error || "Erreur");
          }
        } else {
          const remaining = allAssignments ? allAssignments.filter(a => a.status !== "acknowledged").length : 0;
          toast.success(`Consultation confirmée ! En attente de ${remaining} autre(s) conseiller(s).`);
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
      // Also handle step 5 reassignment (DirCab modifies step 4 assignees before approve/reject)
      const assigneeIds = ((currentStep === 3 || currentStep === 5) && selectedAssignees.length > 0)
        ? selectedAssignees
        : undefined;

      // Step 5: If DirCab modified assignees, update step 4 assignments before advancing
      if (currentStep === 5 && selectedAssignees.length > 0 && user) {
        // Remove old step 4 pending assignments and add new ones
        await supabase.from("mail_assignments")
          .delete()
          .eq("mail_id", mailId)
          .eq("step_number", 4)
          .in("status", ["pending", "proposed"]);
        
        for (const assigneeId of selectedAssignees) {
          await supabase.from("mail_assignments").insert({
            mail_id: mailId,
            assigned_by: user.id,
            assigned_to: assigneeId,
            step_number: 4,
            status: effectiveAction === "reject" ? "pending" : "completed",
            instructions: annotation || null,
          });
        }
      }

      const result = await advanceWorkflow(mailId, currentStep, effectiveAction, user.id, noteParts || notes, { assigneeIds });

      if (result.success) {
        // Step 2: Create "proposed" assignments for conseillers pre-selected by Ministre
        if (selectedAssignees.length > 0 && currentStep === 2) {
          for (const assigneeId of selectedAssignees) {
            await supabase.from("mail_assignments").insert({
              mail_id: mailId,
              assigned_by: user.id,
              assigned_to: assigneeId,
              step_number: 4,
              instructions: annotation || null,
              status: "proposed",
            });

            await supabase.from("notifications").insert({
              user_id: assigneeId,
              title: "Pré-assignation par le Ministre",
              message: `Le courrier vous a été pré-assigné pour traitement.${annotation ? ` Annotation: ${annotation}` : ""}`,
              mail_id: mailId,
            });
          }
        }

        // Step 6 approve & step 7 skip are now handled atomically by the RPC
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
    setTreatmentType("");
    setTreatmentContent("");
    setMinisterAnnotation("");
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

  const roleLabels: Record<string, string> = {
    conseiller_juridique: "Conseiller Juridique",
    dircab: "Directeur de Cabinet",
    dircaba: "Dir. Cabinet Adjoint",
    agent: "Agent",
    ministre: "Ministre",
    secretariat: "Secrétariat",
    admin: "Administrateur",
    supervisor: "Superviseur",
    conseiller: "Conseiller",
  };

  const dialogTitle: Record<number, string> = {
    2: "Annotation du Ministre",
    3: "Filtrage & Confirmation — DirCab",
    4: "Traitement du dossier — Conseiller",
    5: "Vérification — DirCab",
    6: "Validation — Ministre",
    7: "Consultation — Conseiller",
    8: "Retour & Preuve de Dépôt — Secrétariat",
    9: "Archivage Final",
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogTitle[currentStep] || "Confirmer l'action"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Étape actuelle : <strong>{stepInfo?.name}</strong>
            </p>

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

            {/* Show Minister's annotation at Step 3 */}
            {currentStep === 3 && ministerAnnotation && (
              <div className="p-3 rounded-lg border bg-accent/30 space-y-1">
                <p className="text-xs font-semibold text-primary">📝 Annotation du Ministre</p>
                <p className="text-sm whitespace-pre-wrap">{ministerAnnotation}</p>
              </div>
            )}

            {/* Annotation field */}
            {showAnnotation && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {currentStep === 2 ? "Annotation / Instructions du Ministre" : currentStep === 6 ? "Commentaire de validation" : "Notes du DirCab"}
                </Label>
                <Textarea
                  placeholder={
                    currentStep === 2
                      ? "Instructions du Ministre pour le traitement de ce dossier..."
                      : currentStep === 6
                        ? "Observations du Ministre sur la validation..."
                        : "Observations du DirCab sur les assignations..."
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

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
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

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
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
                  {currentStep === 2 ? "Pré-assigner des personnes pour traitement" : currentStep === 5 ? "Modifier les assignés (étape traitement)" : "Confirmer / Modifier les assignations"}
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
                          <p className="text-xs text-muted-foreground">{roleLabels[u.role] || u.role}</p>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>Annuler</Button>
            <Button
              onClick={handleAction}
              disabled={loading || (showTreatment && action === "complete" && (!treatmentType || !treatmentContent)) || (currentStep === 8 && !attachmentFile)}
              variant={action === "reject" ? "destructive" : "default"}
            >
              {loading ? "En cours..." : action === "reject" ? "Confirmer le rejet" : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}