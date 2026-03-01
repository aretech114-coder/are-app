import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { advanceWorkflow, getStepInfo, WORKFLOW_STEPS } from "@/lib/workflow-engine";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle, XCircle, ArrowRight, Archive, Send, Upload, Users, FileText, AlertTriangle } from "lucide-react";

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

  // Multi-assignment state
  const [assignableUsers, setAssignableUsers] = useState<UserProfile[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  // Step 4: treatment type
  const [treatmentType, setTreatmentType] = useState<string>("");
  const [treatmentContent, setTreatmentContent] = useState("");

  const stepInfo = getStepInfo(currentStep);

  // Map roles to their allowed steps
  const roleStepMap: Record<string, number[]> = {
    secretariat: [1, 7],
    ministre: [2, 6],
    dircab: [3, 5],
    dircaba: [3],
    conseiller_juridique: [4],
    admin: [1, 2, 3, 4, 5, 6, 7],
    superadmin: [1, 2, 3, 4, 5, 6, 7],
  };

  const canAct = role ? (roleStepMap[role] || []).includes(currentStep) : false;

  // Fetch assignable users when dialog opens for steps that need assignment
  useEffect(() => {
    if (showDialog && (currentStep === 2 || currentStep === 3)) {
      fetchAssignableUsers();
    }
  }, [showDialog, currentStep]);

  const fetchAssignableUsers = async () => {
    const targetRoles = ["conseiller_juridique", "dircab", "dircaba", "agent"];
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", targetRoles as any);

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

    if (currentStep === 1) {
      actions.push({ key: "complete", label: "Réception terminée", icon: Send, variant: "default" });
    } else if (currentStep === 2) {
      actions.push({ key: "approve", label: "Annoter & Transmettre au DirCab", icon: ArrowRight, variant: "default" });
    } else if (currentStep === 3) {
      actions.push({ key: "approve", label: "Confirmer & Affecter", icon: CheckCircle, variant: "default" });
      actions.push({ key: "reject", label: "Renvoyer au Ministre", icon: XCircle, variant: "destructive" });
    } else if (currentStep === 4) {
      actions.push({ key: "complete", label: "Soumettre pour vérification", icon: Send, variant: "default" });
    } else if (currentStep === 5) {
      actions.push({ key: "approve", label: "Approuver → Validation Ministre", icon: CheckCircle, variant: "default" });
      actions.push({ key: "reject", label: "Renvoyer au traitement (Étape 4)", icon: XCircle, variant: "destructive" });
    } else if (currentStep === 6) {
      actions.push({ key: "approve", label: "Valider & Finaliser", icon: CheckCircle, variant: "default" });
      actions.push({ key: "reject", label: "Rejeter (retour étape 4)", icon: XCircle, variant: "destructive" });
    } else if (currentStep === 7) {
      actions.push({ key: "archive", label: "Archiver", icon: Archive, variant: "outline" });
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
        const filePath = `annotations/${mailId}/${Date.now()}_${attachmentFile.name}`;
        const { error: uploadErr } = await supabase.storage.from("avatars").upload(filePath, attachmentFile);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
        annotationAttachmentUrl = urlData.publicUrl;
      }

      // Build full notes
      const noteParts = [
        annotation && `📝 Annotation: ${annotation}`,
        annotationAttachmentUrl && `📎 Document joint: ${annotationAttachmentUrl}`,
        selectedAssignees.length > 0 && `👥 Personnes assignées: ${selectedAssignees.map(id => assignableUsers.find(u => u.id === id)?.full_name).filter(Boolean).join(", ")}`,
        treatmentType && `📄 Type de document: ${treatmentType === "note_technique" ? "Note Technique" : "Accusé de Réception"}`,
        treatmentContent && `📋 Contenu:\n${treatmentContent}`,
        notes && `💬 Notes: ${notes}`,
      ].filter(Boolean).join("\n");

      // For step 6 rejection, override to go back to step 4
      let effectiveAction = action;
      if (currentStep === 6 && action === "reject") {
        effectiveAction = "reject";
      }

      const result = await advanceWorkflow(mailId, currentStep, effectiveAction, user.id, noteParts || notes);

      if (result.success) {
        // Save treatment content to mail if at step 4
        if (currentStep === 4 && treatmentContent) {
          await supabase.from("mails").update({
            ai_draft: treatmentContent,
            mail_type: treatmentType || undefined,
          } as any).eq("id", mailId);
        }

        // Create assignments if people were selected
        if (selectedAssignees.length > 0) {
          const targetStep = currentStep === 2 ? 4 : currentStep === 3 ? 4 : currentStep + 1;
          for (const assigneeId of selectedAssignees) {
            await supabase.from("mail_assignments").insert({
              mail_id: mailId,
              assigned_by: user.id,
              assigned_to: assigneeId,
              step_number: targetStep,
              instructions: annotation || null,
              status: currentStep === 2 ? "proposed" : "pending",
            });

            await supabase.from("notifications").insert({
              user_id: assigneeId,
              title: currentStep === 2
                ? "Pré-assignation par le Ministre"
                : "Dossier assigné pour traitement",
              message: `Le courrier vous a été ${currentStep === 2 ? "pré-assigné" : "assigné"} pour traitement.${annotation ? ` Annotation: ${annotation}` : ""}`,
              mail_id: mailId,
            });
          }
        }

        // Step 6 approve: notify assigned conseillers if note technique
        if (currentStep === 6 && action === "approve") {
          const { data: assignments } = await supabase
            .from("mail_assignments")
            .select("assigned_to")
            .eq("mail_id", mailId)
            .eq("step_number", 4);

          if (assignments) {
            for (const a of assignments) {
              await supabase.from("notifications").insert({
                user_id: a.assigned_to,
                title: "Dossier validé par le Ministre",
                message: "Le dossier sur lequel vous avez travaillé a été validé avec succès.",
                mail_id: mailId,
              });
              // Mark assignment as completed
              await supabase.from("mail_assignments")
                .update({ status: "completed", completed_at: new Date().toISOString() })
                .eq("mail_id", mailId)
                .eq("assigned_to", a.assigned_to);
            }
          }
        }

        // Auto-route to next role
        const nextStep = WORKFLOW_STEPS.find(s => s.step === result.newStep);
        if (nextStep) {
          const { data: nextRoleUser } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", nextStep.role as any)
            .limit(1)
            .single();

          if (nextRoleUser) {
            await supabase
              .from("mails")
              .update({ assigned_agent_id: nextRoleUser.user_id })
              .eq("id", mailId);

            await supabase.from("notifications").insert({
              user_id: nextRoleUser.user_id,
              title: `Courrier en attente — ${nextStep.name}`,
              message: `Un courrier requiert votre attention à l'étape "${nextStep.name}".`,
              mail_id: mailId,
            });
          }
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
  };

  const actions = getActions();
  if (actions.length === 0 || !canAct) return null;

  const showAnnotation = currentStep === 2 || currentStep === 3 || currentStep === 6;
  const showAssignment = currentStep === 2 || currentStep === 3;
  const showAttachment = currentStep === 2 || currentStep === 3 || currentStep === 4;
  const showTreatment = currentStep === 4;

  const roleLabels: Record<string, string> = {
    conseiller_juridique: "Conseiller Juridique",
    dircab: "Directeur de Cabinet",
    dircaba: "Dir. Cabinet Adjoint",
    agent: "Agent",
  };

  const dialogTitle: Record<number, string> = {
    2: "Annotation du Ministre",
    3: "Filtrage & Confirmation — DirCab",
    4: "Traitement du dossier — Conseiller",
    5: "Vérification — DirCab",
    6: "Validation — Ministre",
    7: "Archivage",
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
                  {currentStep === 2 ? "Pré-assigner des personnes pour traitement" : "Confirmer / Modifier les assignations"}
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
              disabled={loading || (showTreatment && action === "complete" && (!treatmentType || !treatmentContent))}
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