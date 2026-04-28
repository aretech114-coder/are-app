import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  useWorkflowSteps,
  useUpdateWorkflowStep,
  useCreateWorkflowStep,
  useDeleteWorkflowStep,
  useReorderWorkflowSteps,
  type WorkflowStep,
} from "@/hooks/useWorkflowSteps";
import { getRoleLabel, ROLE_LABELS } from "@/lib/workflow-engine";
import { fetchWorkflowAssignableUsers, type AssignableUser } from "@/lib/workflow-assignment";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { GripVertical, Plus, Trash2, Pencil, ArrowUp, ArrowDown, Power, Layers, Check, X, Users, ShieldCheck, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const MODE_OPTIONS = [
  {
    value: "default_user",
    label: "Responsable par défaut",
    help: "Une personne (ou un rôle) toujours désignée pour cette étape. Chaque courrier qui arrive ici lui est assigné automatiquement.",
  },
  {
    value: "default_user_with_fallback",
    label: "Responsable avec fallback",
    help: "Comme « par défaut », mais si aucun responsable n'est trouvé, le système se rabat sur l'assigné d'une étape antérieure.",
  },
  {
    value: "dynamic_by_previous_step",
    label: "Dynamique (assignation à l'exécution)",
    help: "Aucun responsable fixe. L'assigné est choisi au moment où la transition est validée (ex. conseillers proposés à l'étape 2 puis traités à l'étape 4).",
  },
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
  assignment_mode: string;
  color_class: string;
  assignment_target: "roles" | "users" | "mixed";
  responsible_roles: string[];
  responsible_user_ids: string[];
}

const DEFAULT_FORM: EditForm = {
  name: "",
  description: "",
  assignment_mode: "default_user",
  color_class: "",
  assignment_target: "roles",
  responsible_roles: [],
  responsible_user_ids: [],
};

export function WorkflowStepManager() {
  const { data: steps = [], isLoading } = useWorkflowSteps();
  const updateStep = useUpdateWorkflowStep();
  const createStep = useCreateWorkflowStep();
  const deleteStep = useDeleteWorkflowStep();
  const reorderSteps = useReorderWorkflowSteps();

  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(DEFAULT_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [allRoles, setAllRoles] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<AssignableUser[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: enumRows }, users] = await Promise.all([
          supabase.rpc("get_enum_values" as any),
          fetchWorkflowAssignableUsers(),
        ]);
        const enumValues = ((enumRows || []) as Array<{ value: string }>).map((r) => r.value);
        const merged = enumValues.length > 0 ? enumValues : Object.keys(ROLE_LABELS);
        setAllRoles(merged.filter((r) => r !== "superadmin"));
        setAllUsers(users);
      } catch (e) {
        // fallback: at least the static labels
        setAllRoles(Object.keys(ROLE_LABELS).filter((r) => r !== "superadmin"));
      }
    })();
  }, []);

  const openEdit = (step: WorkflowStep) => {
    setEditingStep(step);
    setEditForm({
      name: step.name,
      description: step.description || "",
      assignment_mode: step.assignment_mode || "default_user",
      color_class: step.color_class || "",
      assignment_target: (step.assignment_target as any) || "roles",
      responsible_roles: step.responsible_roles || (step.responsible_role ? [step.responsible_role] : []),
      responsible_user_ids: step.responsible_user_ids || [],
    });
  };

  const saveEdit = async () => {
    if (!editingStep) return;
    try {
      await updateStep.mutateAsync({
        id: editingStep.id,
        name: editForm.name,
        description: editForm.description,
        assignment_mode: editForm.assignment_mode,
        color_class: editForm.color_class,
        assignment_target: editForm.assignment_target,
        responsible_roles: editForm.responsible_roles,
        responsible_user_ids: editForm.responsible_user_ids,
        responsible_role: editForm.responsible_roles[0] || null,
      });
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
        responsible_role: editForm.responsible_roles[0] || undefined,
        responsible_roles: editForm.responsible_roles,
        responsible_user_ids: editForm.responsible_user_ids,
        assignment_target: editForm.assignment_target,
        assignment_mode: editForm.assignment_mode || "default_user",
        color_class: editForm.color_class || COLOR_OPTIONS[0].value,
      });
      toast.success("Étape créée");
      setShowCreate(false);
      setEditForm(DEFAULT_FORM);
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
          <Button size="sm" onClick={() => { setShowCreate(true); setEditForm({ ...DEFAULT_FORM, color_class: COLOR_OPTIONS[0].value }); }}>
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
                {summarizeAssignment(step, allUsers)} · {MODE_OPTIONS.find(m => m.value === step.assignment_mode)?.label || step.assignment_mode}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier l'étape {editingStep?.step_order}</DialogTitle>
          </DialogHeader>
          <StepFormFields form={editForm} setForm={setEditForm} allRoles={allRoles} allUsers={allUsers} />
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle étape</DialogTitle>
          </DialogHeader>
          <StepFormFields form={editForm} setForm={setEditForm} allRoles={allRoles} allUsers={allUsers} />
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

function summarizeAssignment(step: WorkflowStep, users: AssignableUser[]): string {
  const roles = step.responsible_roles?.length ? step.responsible_roles : (step.responsible_role ? [step.responsible_role] : []);
  const userIds = step.responsible_user_ids || [];
  const parts: string[] = [];
  if (roles.length > 0) parts.push(`Rôles: ${roles.map(getRoleLabel).join(", ")}`);
  if (userIds.length > 0) {
    const names = userIds.map((id) => users.find((u) => u.id === id)?.full_name || "Utilisateur").join(", ");
    parts.push(`Users: ${names}`);
  }
  return parts.length ? parts.join(" + ") : "Non configuré";
}

function StepFormFields({
  form,
  setForm,
  allRoles,
  allUsers,
}: {
  form: EditForm;
  setForm: (f: EditForm) => void;
  allRoles: string[];
  allUsers: AssignableUser[];
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Nom de l'étape</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Validation DirCab" />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description de l'étape..." rows={2} />
      </div>

      {/* Mode de désignation */}
      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div>
          <Label className="text-base">Mode de désignation</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Choisissez comment les utilisateurs seront sélectionnés pour cette étape.
          </p>
        </div>
        <RadioGroup
          value={form.assignment_target}
          onValueChange={(v) => setForm({ ...form, assignment_target: v as EditForm["assignment_target"] })}
          className="grid gap-2 sm:grid-cols-3"
        >
          {[
            { v: "roles", label: "Par rôle(s)", icon: ShieldCheck, help: "Tout porteur du rôle peut traiter" },
            { v: "users", label: "Par utilisateur(s)", icon: Users, help: "Personnes nominatives uniquement" },
            { v: "mixed", label: "Mixte", icon: Layers, help: "Combine rôles ET utilisateurs" },
          ].map((opt) => {
            const Icon = opt.icon;
            const checked = form.assignment_target === opt.v;
            return (
              <Label
                key={opt.v}
                htmlFor={`target-${opt.v}`}
                className={cn(
                  "flex flex-col gap-1.5 rounded-md border bg-background p-3 cursor-pointer transition-all",
                  checked ? "border-primary ring-2 ring-primary/20" : "hover:bg-muted/40"
                )}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id={`target-${opt.v}`} value={opt.v} />
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{opt.label}</span>
                </div>
                <span className="text-xs text-muted-foreground pl-6">{opt.help}</span>
              </Label>
            );
          })}
        </RadioGroup>

        {(form.assignment_target === "roles" || form.assignment_target === "mixed") && (
          <div className="space-y-2">
            <Label>Rôles autorisés</Label>
            <MultiSelectCombo
              placeholder="Sélectionner un ou plusieurs rôles..."
              options={allRoles.map((r) => ({ value: r, label: getRoleLabel(r) }))}
              selected={form.responsible_roles}
              onChange={(values) => setForm({ ...form, responsible_roles: values })}
              emptyText="Aucun rôle disponible"
            />
          </div>
        )}

        {(form.assignment_target === "users" || form.assignment_target === "mixed") && (
          <div className="space-y-2">
            <Label>Utilisateurs spécifiques</Label>
            <MultiSelectCombo
              placeholder="Sélectionner un ou plusieurs utilisateurs..."
              options={allUsers.map((u) => ({
                value: u.id,
                label: u.full_name || u.email,
                hint: getRoleLabel(u.role),
              }))}
              selected={form.responsible_user_ids}
              onChange={(values) => setForm({ ...form, responsible_user_ids: values })}
              emptyText="Aucun utilisateur trouvé"
              searchable
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          Mode d'assignation
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  Détermine quand le responsable est résolu : à la création de la transition (par défaut / fallback) ou à l'exécution (dynamique).
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        <Select value={form.assignment_mode} onValueChange={(v) => setForm({ ...form, assignment_mode: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODE_OPTIONS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                <div className="flex flex-col">
                  <span>{m.label}</span>
                  <span className="text-xs text-muted-foreground">{m.help}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

interface MultiOption {
  value: string;
  label: string;
  hint?: string;
}

function MultiSelectCombo({
  placeholder,
  options,
  selected,
  onChange,
  emptyText,
  searchable = false,
}: {
  placeholder: string;
  options: MultiOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  emptyText: string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };
  const remove = (value: string) => onChange(selected.filter((v) => v !== value));

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
            <span className="text-muted-foreground">
              {selected.length === 0 ? placeholder : `${selected.length} sélectionné(s)`}
            </span>
            <Plus className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            {searchable && <CommandInput placeholder="Rechercher..." />}
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const isSelected = selected.includes(opt.value);
                  return (
                    <CommandItem key={opt.value} value={opt.label} onSelect={() => toggle(opt.value)}>
                      <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                      <span className="flex-1">{opt.label}</span>
                      {opt.hint && <span className="text-xs text-muted-foreground ml-2">{opt.hint}</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((v) => {
            const opt = options.find((o) => o.value === v);
            return (
              <Badge key={v} variant="secondary" className="gap-1 pr-1">
                {opt?.label || v}
                <button type="button" onClick={() => remove(v)} className="ml-1 rounded hover:bg-background/40">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
