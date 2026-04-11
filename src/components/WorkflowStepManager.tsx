import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  useWorkflowSteps,
  useUpdateWorkflowStep,
  useCreateWorkflowStep,
  useDeleteWorkflowStep,
  useReorderWorkflowSteps,
  type WorkflowStep,
} from "@/hooks/useWorkflowSteps";
import { getRoleLabel } from "@/lib/workflow-engine";
import { GripVertical, Plus, Trash2, Pencil, ArrowUp, ArrowDown, Power, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = [
  "secretariat", "ministre", "dircab", "dircaba",
  "conseiller_juridique", "conseiller", "supervisor", "agent",
];

const MODE_OPTIONS = [
  { value: "default_user", label: "Responsable par défaut" },
  { value: "default_user_with_fallback", label: "Responsable avec fallback" },
  { value: "dynamic_by_previous_step", label: "Dynamique (étape précédente)" },
];

const COLOR_OPTIONS = [
  { value: "bg-blue-500/10 text-blue-600 border-blue-200", label: "Bleu" },
  { value: "bg-purple-500/10 text-purple-600 border-purple-200", label: "Violet" },
  { value: "bg-amber-500/10 text-amber-600 border-amber-200", label: "Ambre" },
  { value: "bg-emerald-500/10 text-emerald-600 border-emerald-200", label: "Émeraude" },
  { value: "bg-orange-500/10 text-orange-600 border-orange-200", label: "Orange" },
  { value: "bg-cyan-500/10 text-cyan-600 border-cyan-200", label: "Cyan" },
  { value: "bg-teal-500/10 text-teal-600 border-teal-200", label: "Teal" },
  { value: "bg-indigo-500/10 text-indigo-600 border-indigo-200", label: "Indigo" },
  { value: "bg-slate-500/10 text-slate-600 border-slate-200", label: "Gris" },
  { value: "bg-rose-500/10 text-rose-600 border-rose-200", label: "Rose" },
];

interface EditForm {
  name: string;
  description: string;
  responsible_role: string;
  assignment_mode: string;
  color_class: string;
}

export function WorkflowStepManager() {
  const { data: steps = [], isLoading } = useWorkflowSteps();
  const updateStep = useUpdateWorkflowStep();
  const createStep = useCreateWorkflowStep();
  const deleteStep = useDeleteWorkflowStep();
  const reorderSteps = useReorderWorkflowSteps();

  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", description: "", responsible_role: "", assignment_mode: "default_user", color_class: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const openEdit = (step: WorkflowStep) => {
    setEditingStep(step);
    setEditForm({
      name: step.name,
      description: step.description || "",
      responsible_role: step.responsible_role || "",
      assignment_mode: step.assignment_mode || "default_user",
      color_class: step.color_class || "",
    });
  };

  const saveEdit = async () => {
    if (!editingStep) return;
    try {
      await updateStep.mutateAsync({ id: editingStep.id, ...editForm });
      toast.success("Étape mise à jour");
      setEditingStep(null);
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    }
  };

  const handleCreate = async () => {
    const maxOrder = steps.length > 0 ? Math.max(...steps.map(s => s.step_order)) : 0;
    try {
      await createStep.mutateAsync({
        step_order: maxOrder + 1,
        name: editForm.name || "Nouvelle étape",
        description: editForm.description || undefined,
        responsible_role: editForm.responsible_role || undefined,
        assignment_mode: editForm.assignment_mode || "default_user",
        color_class: editForm.color_class || COLOR_OPTIONS[0].value,
      });
      toast.success("Étape créée");
      setShowCreate(false);
      setEditForm({ name: "", description: "", responsible_role: "", assignment_mode: "default_user", color_class: "" });
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteStep.mutateAsync(deleteConfirmId);
      toast.success("Étape supprimée");
      setDeleteConfirmId(null);
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    }
  };

  const toggleActive = async (step: WorkflowStep) => {
    try {
      await updateStep.mutateAsync({ id: step.id, is_active: !step.is_active });
      toast.success(step.is_active ? "Étape désactivée" : "Étape activée");
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    }
  };

  const moveStep = async (index: number, direction: "up" | "down") => {
    const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    const updates = sorted.map((s, i) => ({ id: s.id, step_order: s.step_order }));
    const tempOrder = updates[index].step_order;
    updates[index].step_order = updates[targetIndex].step_order;
    updates[targetIndex].step_order = tempOrder;

    try {
      await reorderSteps.mutateAsync(updates);
      toast.success("Ordre mis à jour");
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    }
  };

  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);

  if (isLoading) return <div className="text-muted-foreground py-6 text-center">Chargement des étapes...</div>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Gestion des Étapes du Workflow
            </CardTitle>
            <CardDescription>
              Réorganisez, activez/désactivez, modifiez ou ajoutez des étapes. Les changements sont appliqués immédiatement.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => { setShowCreate(true); setEditForm({ name: "", description: "", responsible_role: "", assignment_mode: "default_user", color_class: COLOR_OPTIONS[0].value }); }}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map((step, index) => (
          <div
            key={step.id}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg border transition-all",
              step.is_active ? "bg-muted/30" : "bg-muted/10 opacity-60"
            )}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />

            <div className="flex flex-col gap-0.5 shrink-0">
              <Button variant="ghost" size="icon" className="h-5 w-5" disabled={index === 0 || reorderSteps.isPending} onClick={() => moveStep(index, "up")}>
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-5" disabled={index === sorted.length - 1 || reorderSteps.isPending} onClick={() => moveStep(index, "down")}>
                <ArrowDown className="h-3 w-3" />
              </Button>
            </div>

            <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0", step.color_class || "bg-muted text-muted-foreground")}>
              {step.step_order}
            </span>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{step.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {getRoleLabel(step.responsible_role || "")} · {MODE_OPTIONS.find(m => m.value === step.assignment_mode)?.label || step.assignment_mode}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8" title={step.is_active ? "Désactiver" : "Activer"} onClick={() => toggleActive(step)}>
                <Power className={cn("h-4 w-4", step.is_active ? "text-success" : "text-muted-foreground")} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(step)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteConfirmId(step.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={!!editingStep} onOpenChange={(open) => !open && setEditingStep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l'étape {editingStep?.step_order}</DialogTitle>
          </DialogHeader>
          <StepFormFields form={editForm} setForm={setEditForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStep(null)}>Annuler</Button>
            <Button onClick={saveEdit} disabled={updateStep.isPending}>
              {updateStep.isPending ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle étape</DialogTitle>
          </DialogHeader>
          <StepFormFields form={editForm} setForm={setEditForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={createStep.isPending}>
              {createStep.isPending ? "Création..." : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cette action est irréversible. Les courriers déjà à cette étape pourraient être impactés.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteStep.isPending}>
              {deleteStep.isPending ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StepFormFields({ form, setForm }: { form: EditForm; setForm: (f: EditForm) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Nom de l'étape</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Validation DirCab" />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description de l'étape..." rows={2} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Rôle responsable</Label>
          <Select value={form.responsible_role} onValueChange={(v) => setForm({ ...form, responsible_role: v })}>
            <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>{getRoleLabel(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Mode d'assignation</Label>
          <Select value={form.assignment_mode} onValueChange={(v) => setForm({ ...form, assignment_mode: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODE_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Couleur</Label>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setForm({ ...form, color_class: c.value })}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                c.value,
                form.color_class === c.value ? "ring-2 ring-offset-2 ring-primary scale-110" : ""
              )}
            >
              {c.label[0]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
