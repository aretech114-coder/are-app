import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { advanceWorkflow, getStepInfo, WORKFLOW_STEPS } from "@/lib/workflow-engine";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle, XCircle, ArrowRight, Archive, Send, Upload, Users, FileText } from "lucide-react";

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

  const stepInfo = getStepInfo(currentStep);

  // Fetch assignable users when dialog opens for steps that need assignment
  useEffect(() => {
    if (showDialog && (currentStep === 2 || currentStep === 3)) {
      fetchAssignableUsers();
    }
  }, [showDialog, currentStep]);

  const fetchAssignableUsers = async () => {
    // Get users with relevant roles for assignment
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
      // Ministre: annotate + assign + forward
      actions.push({ key: "approve", label: "Annoter & Transmettre au DirCab", icon: ArrowRight, variant: "default" });
    } else if (currentStep === 3) {
      // DirCab: confirm assignments & forward
      actions.push({ key: "approve", label: "Confirmer & Affecter", icon: CheckCircle, variant: "default" });
      actions.push({ key: "reject", label: "Renvoyer au Ministre", icon: XCircle, variant: "destructive" });
    } else if (currentStep === 4) {
      actions.push({ key: "complete", label: "Soumettre pour validation", icon: Send, variant: "default" });
    } else if (currentStep === 5) {
      actions.push({ key: "approve", label: "Approuver", icon: CheckCircle, variant: "default" });
      actions.push({ key: "reject", label: "Rejeter (retour étape 4)", icon: XCircle, variant: "destructive" });
    } else if (currentStep === 6) {
      actions.push({ key: "complete", label: "Finaliser", icon: CheckCircle, variant: "default" });
    } else if (currentStep === 7) {
      actions.push({ key: "archive", label: "Archiver", icon: Archive, variant: "outline" });
    }

    return actions;
  };

  const handleAction = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Upload minister annotation attachment if provided
      let annotationAttachmentUrl: string | null = null;
      if (attachmentFile) {
        const filePath = `annotations/${mailId}/${Date.now()}_${attachmentFile.name}`;
        const { error: uploadErr } = await supabase.storage.from("avatars").upload(filePath, attachmentFile);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
        annotationAttachmentUrl = urlData.publicUrl;
      }

      // Build full notes with annotation
      const fullNotes = [
        annotation && `📝 Annotation: ${annotation}`,
        annotationAttachmentUrl && `📎 Document joint: ${annotationAttachmentUrl}`,
        selectedAssignees.length > 0 && `👥 Personnes assignées: ${selectedAssignees.map(id => assignableUsers.find(u => u.id === id)?.full_name).filter(Boolean).join(", ")}`,
        notes && `💬 Notes: ${notes}`,
      ].filter(Boolean).join("\n");

      const result = await advanceWorkflow(mailId, currentStep, action, user.id, fullNotes || notes);

      if (result.success) {
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

            // Notify assignee
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
            // Update assigned_agent_id for the next step
            await supabase
              .from("mails")
              .update({ assigned_agent_id: nextRoleUser.user_id })
              .eq("id", mailId);

            // Notify next role
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
  };

  const actions = getActions();
  if (actions.length === 0) return null;

  const showAnnotation = currentStep === 2 || currentStep === 3;
  const showAssignment = currentStep === 2 || currentStep === 3;
  const showAttachment = currentStep === 2 || currentStep === 3;

  const roleLabels: Record<string, string> = {
    conseiller_juridique: "Conseiller Juridique",
    dircab: "Directeur de Cabinet",
    dircaba: "Dir. Cabinet Adjoint",
    agent: "Agent",
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
              {currentStep === 2 ? "Annotation du Ministre" : currentStep === 3 ? "Filtrage & Confirmation — DirCab" : "Confirmer l'action"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Étape actuelle : <strong>{stepInfo?.name}</strong>
            </p>

            {/* Annotation field */}
            {showAnnotation && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {currentStep === 2 ? "Annotation / Instructions du Ministre" : "Notes du DirCab"}
                </Label>
                <Textarea
                  placeholder={currentStep === 2 
                    ? "Instructions du Ministre pour le traitement de ce dossier..." 
                    : "Observations du DirCab sur les assignations..."}
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
            <Button onClick={handleAction} disabled={loading}>
              {loading ? "En cours..." : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
