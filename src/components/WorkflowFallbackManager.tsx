import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowDown, ArrowUp, GitBranch, Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useWorkflowSteps } from "@/hooks/useWorkflowSteps";
import {
  useWorkflowFallbacks,
  useUpsertFallback,
  useDeleteFallback,
  FALLBACK_CONDITIONS,
  type WorkflowFallback,
} from "@/hooks/useWorkflowFallbacks";
import { fetchWorkflowAssignableUsers, type AssignableUser } from "@/lib/workflow-assignment";
import { getRoleLabel, getStepColor } from "@/lib/workflow-engine";
import { cn } from "@/lib/utils";

const MAX_FALLBACKS = 5;

export function WorkflowFallbackManager() {
  const { role, hasPermission, user } = useAuth();
  const { data: steps = [] } = useWorkflowSteps();
  const { data: fallbacks = [], isLoading } = useWorkflowFallbacks();
  const upsert = useUpsertFallback();
  const remove = useDeleteFallback();
  const [users, setUsers] = useState<AssignableUser[]>([]);

  const canManage = role === "superadmin" || (role === "admin" && hasPermission("manage_workflow_assignments"));

  useEffect(() => {
    fetchWorkflowAssignableUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  const fallbacksByStep = useMemo(() => {
    const map = new Map<string, WorkflowFallback[]>();
    fallbacks.forEach((fb) => {
      const arr = map.get(fb.step_id) || [];
      arr.push(fb);
      map.set(fb.step_id, arr);
    });
    return map;
  }, [fallbacks]);

  const usersMap = useMemo(() => {
    const map = new Map<string, AssignableUser>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  const handleSave = async (
    stepId: string,
    conditionKey: string,
    fallbackUserIds: string[],
    isActive: boolean,
  ) => {
    if (!canManage) return;
    try {
      await upsert.mutateAsync({
        step_id: stepId,
        condition_key: conditionKey,
        fallback_user_ids: fallbackUserIds,
        is_active: isActive,
        created_by: user?.id ?? null,
      });
      toast.success("Cascade enregistrée");
    } catch (e: any) {
      toast.error(e.message || "Erreur d'enregistrement");
    }
  };

  const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);

  if (isLoading) return <div className="text-muted-foreground py-6 text-center text-sm">Chargement…</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Routage Conditionnel & Cascade de Suppléants
        </CardTitle>
        <CardDescription>
          Définissez, pour chaque étape, les suppléants à mobiliser quand une condition se déclenche (ex. ministre absent, DG indisponible). Le système prendra le premier suppléant disponible dans la cascade (ordre = priorité, max 5).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!canManage && (
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 mb-4 flex items-start gap-2 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-amber-900 dark:text-amber-200">
              Lecture seule — seul le SuperAdmin (ou un Admin avec la permission « gérer les assignations workflow ») peut modifier ces règles.
            </p>
          </div>
        )}

        <Accordion type="multiple" className="space-y-2">
          {sortedSteps.map((step) => {
            const stepFallbacks = fallbacksByStep.get(step.id) || [];
            const activeCount = stepFallbacks.filter((f) => f.is_active).length;
            return (
              <AccordionItem key={step.id} value={step.id} className="border rounded-lg bg-muted/20">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3 flex-1 text-left">
                    <span className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                      step.color_class || getStepColor(step.step_order)
                    )}>
                      {step.step_order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{step.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {activeCount > 0 ? `${activeCount} condition(s) active(s)` : "Aucune condition configurée"}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-3">
                  {FALLBACK_CONDITIONS.map((cond) => {
                    const existing = stepFallbacks.find((f) => f.condition_key === cond.key);
                    return (
                      <ConditionEditor
                        key={cond.key}
                        stepId={step.id}
                        condition={cond}
                        existing={existing}
                        users={users}
                        usersMap={usersMap}
                        canManage={canManage}
                        onSave={handleSave}
                        onDelete={async (id) => {
                          try {
                            await remove.mutateAsync(id);
                            toast.success("Cascade supprimée");
                          } catch (e: any) {
                            toast.error(e.message || "Erreur");
                          }
                        }}
                      />
                    );
                  })}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

interface ConditionEditorProps {
  stepId: string;
  condition: typeof FALLBACK_CONDITIONS[number];
  existing: WorkflowFallback | undefined;
  users: AssignableUser[];
  usersMap: Map<string, AssignableUser>;
  canManage: boolean;
  onSave: (stepId: string, conditionKey: string, ids: string[], isActive: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function ConditionEditor({ stepId, condition, existing, users, usersMap, canManage, onSave, onDelete }: ConditionEditorProps) {
  const [draft, setDraft] = useState<string[]>(existing?.fallback_user_ids || []);
  const [isActive, setIsActive] = useState<boolean>(existing?.is_active ?? false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(existing?.fallback_user_ids || []);
    setIsActive(existing?.is_active ?? false);
    setDirty(false);
  }, [existing?.id, existing?.updated_at]);

  const updateAt = (index: number, userId: string) => {
    const next = [...draft];
    next[index] = userId;
    setDraft(next);
    setDirty(true);
  };

  const move = (index: number, dir: "up" | "down") => {
    const target = dir === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
    setDirty(true);
  };

  const addSlot = () => {
    if (draft.length >= MAX_FALLBACKS) return;
    setDraft([...draft, ""]);
    setDirty(true);
  };

  const removeSlot = (index: number) => {
    setDraft(draft.filter((_, i) => i !== index));
    setDirty(true);
  };

  const save = async () => {
    const cleaned = draft.filter((id) => id && id.length > 0);
    await onSave(stepId, condition.key, cleaned, isActive);
    setDirty(false);
  };

  return (
    <div className="rounded-md border bg-background p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{condition.label}</p>
            {existing && <Badge variant="outline" className="text-[10px]">Configuré</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{condition.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Label htmlFor={`active-${stepId}-${condition.key}`} className="text-xs">Actif</Label>
          <Switch
            id={`active-${stepId}-${condition.key}`}
            checked={isActive}
            onCheckedChange={(v) => { setIsActive(v); setDirty(true); }}
            disabled={!canManage}
          />
        </div>
      </div>

      <div className="space-y-2">
        {draft.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Aucun suppléant. Ajoutez au moins un fallback.</p>
        )}
        {draft.map((userId, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-6 text-center text-xs font-bold text-muted-foreground">{index + 1}.</span>
            <Select value={userId || undefined} onValueChange={(v) => updateAt(index, v)} disabled={!canManage}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Sélectionner un utilisateur..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id} disabled={draft.includes(u.id) && draft[index] !== u.id}>
                    {u.full_name || u.email} — <span className="text-muted-foreground text-xs">{getRoleLabel(u.role)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-col">
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(index, "up")} disabled={!canManage || index === 0}>
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(index, "down")} disabled={!canManage || index === draft.length - 1}>
                <ArrowDown className="h-3 w-3" />
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeSlot(index)} disabled={!canManage}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={addSlot}
          disabled={!canManage || draft.length >= MAX_FALLBACKS}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Ajouter un suppléant ({draft.length}/{MAX_FALLBACKS})
        </Button>
        <div className="flex items-center gap-2">
          {existing && canManage && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(existing.id)}>
              Supprimer la cascade
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!canManage || !dirty}>
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}