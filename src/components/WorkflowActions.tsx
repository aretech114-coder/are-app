import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { advanceWorkflow, getStepInfo } from "@/lib/workflow-engine";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle, XCircle, ArrowRight, Archive, Send } from "lucide-react";

interface WorkflowActionsProps {
  mailId: string;
  currentStep: number;
  onAdvanced: () => void;
}

export function WorkflowActions({ mailId, currentStep, onAdvanced }: WorkflowActionsProps) {
  const { user, role } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  const [action, setAction] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const stepInfo = getStepInfo(currentStep);

  // Determine available actions based on current step
  const getActions = () => {
    const actions: { key: string; label: string; icon: typeof CheckCircle; variant: "default" | "destructive" | "outline" }[] = [];

    if (currentStep === 1) {
      actions.push({ key: "complete", label: "Réception terminée", icon: Send, variant: "default" });
    } else if (currentStep === 2) {
      actions.push({ key: "approve", label: "Router", icon: ArrowRight, variant: "default" });
    } else if (currentStep === 3) {
      actions.push({ key: "approve", label: "Valider & Affecter", icon: CheckCircle, variant: "default" });
      actions.push({ key: "reject", label: "Renvoyer", icon: XCircle, variant: "destructive" });
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

    const result = await advanceWorkflow(mailId, currentStep, action, user.id, notes);

    if (result.success) {
      toast.success(`Courrier avancé à l'étape ${result.newStep}`);
      setShowDialog(false);
      setNotes("");
      onAdvanced();
    } else {
      toast.error(result.error || "Erreur lors de la transition");
    }

    setLoading(false);
  };

  const actions = getActions();
  if (actions.length === 0) return null;

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

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer l'action</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Étape actuelle : <strong>{stepInfo?.name}</strong>
            </p>
            <Textarea
              placeholder="Notes ou instructions (optionnel)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Annuler</Button>
            <Button onClick={handleAction} disabled={loading}>
              {loading ? "En cours..." : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
