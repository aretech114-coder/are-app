import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  mailId: string;
  currentStep: number;
  deadlineAt: string | null;
  onRecovered?: () => void;
}

/**
 * Bouton « Récupérer & réassigner » visible uniquement pour le dispatcher d'origine
 * (ou DG/admin/superadmin) lorsque le SLA est dépassé.
 */
export function RecoverMailButton({ mailId, currentStep, deadlineAt, onRecovered }: Props) {
  const { user, role } = useAuth();
  const [canRecover, setCanRecover] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const isExpired = deadlineAt ? new Date(deadlineAt) < new Date() : false;

  useEffect(() => {
    if (!user || !isExpired) {
      setCanRecover(false);
      return;
    }

    // DG / admin / superadmin : toujours autorisés
    if (role && ["dg", "admin", "superadmin"].includes(role)) {
      setCanRecover(true);
      return;
    }

    // Sinon, vérifier qu'on est le dispatcher d'origine de l'étape courante
    (async () => {
      const { data } = await supabase
        .from("mail_assignments")
        .select("assigned_by")
        .eq("mail_id", mailId)
        .eq("step_number", currentStep)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      setCanRecover(!!data && data.assigned_by === user.id);
    })();
  }, [user, role, mailId, currentStep, isExpired]);

  if (!canRecover || !isExpired) return null;

  const handleRecover = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("revert_mail_to_dispatcher", {
        _mail_id: mailId,
        _performed_by: user.id,
        _notes: notes || null,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.success) {
        toast.success(
          `Courrier récupéré (étape ${result.from_step} → ${result.new_step}). Vous pouvez le réassigner.`
        );
        setShowDialog(false);
        setNotes("");
        onRecovered?.();
      } else {
        toast.error(result?.error || "Échec de la récupération");
      }
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowDialog(true)}
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
      >
        <RotateCcw className="h-4 w-4 mr-1" />
        Récupérer & réassigner
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Récupérer le courrier après dépassement
            </DialogTitle>
            <DialogDescription>
              Le courrier reviendra à l'étape précédente pour réassignation. Les contributions
              déjà soumises sont <strong>conservées en historique</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="recover-notes">Motif (optionnel)</Label>
            <Textarea
              id="recover-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex. : changement d'assignés suite à une indisponibilité..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleRecover} disabled={loading}>
              {loading ? "Récupération..." : "Confirmer la récupération"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
