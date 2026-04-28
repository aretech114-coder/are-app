import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, UserPlus, Send, CheckCircle, XCircle, Clock, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  useSubAssignments,
  useCreateSubAssignments,
  useSubmitSubAssignment,
  useValidateSubAssignment,
  useDeleteSubAssignment,
} from "@/hooks/useSubAssignments";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Props {
  mailId: string;
  currentStep: number;
}

interface TeammateProfile {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

export function SubAssignmentPanel({ mailId, currentStep }: Props) {
  const { user } = useAuth();
  const { data: subs = [], isLoading } = useSubAssignments(mailId);
  const createMut = useCreateSubAssignments();
  const submitMut = useSubmitSubAssignment();
  const validateMut = useValidateSubAssignment();
  const deleteMut = useDeleteSubAssignment();

  const [allowed, setAllowed] = useState(false);
  const [parentAssignment, setParentAssignment] = useState<{ id: string; deadline: string | null } | null>(null);
  const [teammates, setTeammates] = useState<TeammateProfile[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");

  const [submitDialog, setSubmitDialog] = useState<string | null>(null);
  const [submitNotes, setSubmitNotes] = useState("");

  const [validateDialog, setValidateDialog] = useState<{ id: string; decision: "validated" | "rejected" } | null>(null);
  const [validateNotes, setValidateNotes] = useState("");

  // Charger : étape autorise sous-assignation + assignment parent + équipe disponible
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: stepData } = await supabase
        .from("workflow_steps")
        .select("allow_sub_assignment")
        .eq("step_order", currentStep)
        .maybeSingle();
      const allow = !!(stepData as any)?.allow_sub_assignment;
      setAllowed(allow);
      if (!allow) return;

      const { data: ma } = await supabase
        .from("mail_assignments")
        .select("id")
        .eq("mail_id", mailId)
        .eq("step_number", currentStep)
        .eq("assigned_to", user.id)
        .maybeSingle();

      const { data: mail } = await supabase
        .from("mails")
        .select("deadline_at")
        .eq("id", mailId)
        .maybeSingle();

      if (ma) setParentAssignment({ id: ma.id, deadline: mail?.deadline_at || null });

      // Équipe : conseillers + agents (hors moi)
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["conseiller", "conseiller_juridique", "agent"] as any);
      if (roles) {
        const ids = roles.map((r) => r.user_id).filter((id) => id !== user.id);
        if (ids.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", ids);
          setTeammates(
            (profs || []).map((p) => ({
              ...p,
              role: roles.find((r) => r.user_id === p.id)?.role || "",
            }))
          );
        }
      }
    })();
  }, [user, mailId, currentStep]);

  if (!user || isLoading) return null;

  const myAsPrincipal = subs.filter((s) => s.sub_assigned_by === user.id);
  const myAsSubAssigned = subs.filter((s) => s.sub_assigned_to === user.id);

  const isPrincipal = !!parentAssignment && allowed;

  if (!isPrincipal && myAsSubAssigned.length === 0) return null;

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: any; icon: any }> = {
      pending: { label: "En attente", variant: "secondary", icon: Clock },
      submitted: { label: "Soumise", variant: "default", icon: Send },
      validated: { label: "Validée", variant: "default", icon: CheckCircle },
      rejected: { label: "Rejetée", variant: "destructive", icon: XCircle },
    };
    const cfg = map[status] || map.pending;
    const Icon = cfg.icon;
    return (
      <Badge variant={cfg.variant} className="gap-1">
        <Icon className="h-3 w-3" /> {cfg.label}
      </Badge>
    );
  };

  const toggleId = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleCreate = async () => {
    if (!parentAssignment || selectedIds.length === 0) return;
    await createMut.mutateAsync({
      mailId,
      parentAssignmentId: parentAssignment.id,
      subAssignedBy: user.id,
      subAssignedToIds: selectedIds,
      parentDeadlineAt: parentAssignment.deadline,
      instructions,
    });
    setShowCreate(false);
    setSelectedIds([]);
    setInstructions("");
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Sous-assignations
          </CardTitle>
          {isPrincipal && (
            <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
              <UserPlus className="h-4 w-4 mr-1" /> Sous-assigner
            </Button>
          )}
        </div>
        {isPrincipal && myAsPrincipal.length > 0 && (
          <p className="text-xs text-muted-foreground">
            L'avancement de l'étape sera bloqué tant que toutes les sous-assignations ne sont pas validées.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Vue délégant */}
        {isPrincipal && myAsPrincipal.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune sous-assignation pour le moment.</p>
        )}
        {isPrincipal &&
          myAsPrincipal.map((s) => (
            <div key={s.id} className="border rounded-md p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {s.sub_assigned_to_profile?.full_name || s.sub_assigned_to_profile?.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Délégué le {format(new Date(s.created_at), "Pp", { locale: fr })}
                  </p>
                </div>
                {statusBadge(s.status)}
              </div>
              {s.submission_notes && (
                <div className="text-sm bg-muted/50 p-2 rounded">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Contribution :</p>
                  <p className="whitespace-pre-wrap">{s.submission_notes}</p>
                </div>
              )}
              {s.validation_notes && (
                <p className="text-xs italic text-muted-foreground">Note du délégant : {s.validation_notes}</p>
              )}
              <div className="flex gap-2 justify-end">
                {s.status === "pending" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMut.mutate({ id: s.id, mailId })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                {s.status === "submitted" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setValidateDialog({ id: s.id, decision: "rejected" });
                        setValidateNotes("");
                      }}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Rejeter
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setValidateDialog({ id: s.id, decision: "validated" });
                        setValidateNotes("");
                      }}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Valider
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}

        {/* Vue sous-assigné */}
        {myAsSubAssigned.map((s) => (
          <div key={s.id} className="border rounded-md p-3 space-y-2 bg-accent/20">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Délégation reçue</p>
                <p className="text-xs text-muted-foreground">
                  De : {s.sub_assigned_by_profile?.full_name || s.sub_assigned_by_profile?.email}
                </p>
                {s.parent_deadline_at && (
                  <p className="text-xs text-muted-foreground">
                    Échéance principale :{" "}
                    {format(new Date(s.parent_deadline_at), "Pp", { locale: fr })}
                  </p>
                )}
              </div>
              {statusBadge(s.status)}
            </div>
            {s.submission_notes && (
              <div className="text-sm bg-background p-2 rounded">
                <p className="text-xs font-medium text-muted-foreground mb-1">Ma contribution :</p>
                <p className="whitespace-pre-wrap">{s.submission_notes}</p>
              </div>
            )}
            {s.validation_notes && s.status !== "pending" && (
              <p className="text-xs italic text-muted-foreground">Retour du délégant : {s.validation_notes}</p>
            )}
            {(s.status === "pending" || s.status === "rejected") && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    setSubmitDialog(s.id);
                    setSubmitNotes(s.submission_notes || "");
                  }}
                >
                  <Send className="h-3.5 w-3.5 mr-1" />
                  {s.status === "rejected" ? "Reprendre" : "Soumettre"}
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>

      {/* Dialog : créer sous-assignation */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sous-assigner à des collègues</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Membres de l'équipe</Label>
              <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-1 mt-1">
                {teammates.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">Aucun collègue disponible.</p>
                ) : (
                  teammates.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedIds.includes(t.id)}
                        onCheckedChange={() => toggleId(t.id)}
                      />
                      <div className="flex-1">
                        <p className="text-sm">{t.full_name || t.email}</p>
                        <p className="text-xs text-muted-foreground">{t.role}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="instr">Instructions (optionnel)</Label>
              <Textarea
                id="instr"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Précisez ce que vous attendez d'eux..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={selectedIds.length === 0 || createMut.isPending}
            >
              Sous-assigner ({selectedIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : soumettre contribution */}
      <Dialog open={!!submitDialog} onOpenChange={(o) => !o && setSubmitDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Soumettre ma contribution</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="snotes">Contribution / réponse</Label>
            <Textarea
              id="snotes"
              value={submitNotes}
              onChange={(e) => setSubmitNotes(e.target.value)}
              rows={6}
              placeholder="Rédigez votre apport au traitement du courrier..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialog(null)}>
              Annuler
            </Button>
            <Button
              onClick={async () => {
                if (!submitDialog) return;
                await submitMut.mutateAsync({ id: submitDialog, mailId, notes: submitNotes });
                setSubmitDialog(null);
              }}
              disabled={!submitNotes.trim() || submitMut.isPending}
            >
              <Send className="h-4 w-4 mr-1" /> Soumettre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : valider/rejeter */}
      <Dialog open={!!validateDialog} onOpenChange={(o) => !o && setValidateDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {validateDialog?.decision === "validated" ? "Valider la contribution" : "Rejeter la contribution"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="vnotes">Commentaire (optionnel)</Label>
            <Textarea
              id="vnotes"
              value={validateNotes}
              onChange={(e) => setValidateNotes(e.target.value)}
              rows={4}
              placeholder={
                validateDialog?.decision === "rejected"
                  ? "Expliquez ce qui doit être corrigé..."
                  : "Remarques éventuelles..."
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidateDialog(null)}>
              Annuler
            </Button>
            <Button
              variant={validateDialog?.decision === "rejected" ? "destructive" : "default"}
              onClick={async () => {
                if (!validateDialog) return;
                await validateMut.mutateAsync({
                  id: validateDialog.id,
                  mailId,
                  decision: validateDialog.decision,
                  notes: validateNotes,
                });
                setValidateDialog(null);
              }}
              disabled={validateMut.isPending}
            >
              {validateDialog?.decision === "validated" ? "Valider" : "Rejeter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
