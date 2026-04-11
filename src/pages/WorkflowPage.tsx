import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Workflow, Clock, Settings2, UserCog, Mail } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { WorkflowStepManager } from "@/components/WorkflowStepManager";
import { useWorkflowSteps, getStepColorFromList } from "@/hooks/useWorkflowSteps";
import { getStepColor } from "@/lib/workflow-engine";
import {
  fetchWorkflowAssignableUsers,
  fetchWorkflowStepResponsibles,
  upsertWorkflowStepResponsible,
  type AssignableUser,
  type WorkflowStepResponsible,
} from "@/lib/workflow-assignment";
import { useAuth } from "@/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SlaConfig {
  id: string;
  step_number: number;
  step_name: string;
  default_hours: number;
  description: string | null;
}

const STEP_DEFAULT_MODE: Record<number, "default_user" | "default_user_with_fallback" | "dynamic_by_previous_step"> = {
  2: "default_user",
  3: "default_user",
  4: "dynamic_by_previous_step",
  5: "default_user",
  6: "default_user_with_fallback",
  7: "dynamic_by_previous_step",
  8: "default_user",
  9: "default_user",
};

const MANAGED_DEFAULT_STEPS = [2, 3, 5, 6, 8, 9];

export default function WorkflowPage() {
  const { role, hasPermission, user } = useAuth();
  const { data: workflowSteps = [] } = useWorkflowSteps();
  const [slaConfigs, setSlaConfigs] = useState<SlaConfig[]>([]);
  const [responsibles, setResponsibles] = useState<WorkflowStepResponsible[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingStep, setSavingStep] = useState<number | null>(null);

  const canManageResponsibles = role === "superadmin" || (role === "admin" && hasPermission("manage_workflow_assignments"));

  useEffect(() => {
    fetchPageData();
  }, []);

  const responsibleByStep = useMemo(() => {
    const map = new Map<number, WorkflowStepResponsible>();
    responsibles.forEach((item) => map.set(item.step_number, item));
    return map;
  }, [responsibles]);

  const usersMap = useMemo(() => {
    const map = new Map<string, AssignableUser>();
    users.forEach((item) => map.set(item.id, item));
    return map;
  }, [users]);

  const fetchSla = async () => {
    const { data, error } = await supabase
      .from("sla_config")
      .select("*")
      .order("step_number");

    if (error) throw error;
    setSlaConfigs(data || []);
  };

  const fetchPageData = async () => {
    setLoading(true);
    try {
      const [_, responsibleRows, userRows] = await Promise.all([
        fetchSla(),
        fetchWorkflowStepResponsibles(),
        fetchWorkflowAssignableUsers(),
      ]);

      setResponsibles(responsibleRows);
      setUsers(userRows);
    } catch (error: any) {
      toast.error(error.message || "Erreur de chargement du workflow");
    } finally {
      setLoading(false);
    }
  };

  const updateHours = async (id: string, hours: number) => {
    if (hours < 1) return;
    const { error } = await supabase
      .from("sla_config")
      .update({ default_hours: hours })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSlaConfigs((prev) => prev.map((item) => (item.id === id ? { ...item, default_hours: hours } : item)));
    toast.success("SLA mis à jour");
  };

  const handleResponsibleChange = async (stepNumber: number, value: string) => {
    if (!canManageResponsibles) return;
    setSavingStep(stepNumber);

    try {
      await upsertWorkflowStepResponsible({
        step_number: stepNumber,
        assignment_mode: STEP_DEFAULT_MODE[stepNumber],
        default_user_id: value === "none" ? null : value,
        fallback_step_number: stepNumber === 6 ? 2 : null,
        created_by: user?.id ?? null,
      });

      setResponsibles((prev) => {
        const existing = prev.find((item) => item.step_number === stepNumber);
        if (existing) {
          return prev.map((item) =>
            item.step_number === stepNumber
              ? {
                  ...item,
                  assignment_mode: STEP_DEFAULT_MODE[stepNumber],
                  default_user_id: value === "none" ? null : value,
                  fallback_step_number: stepNumber === 6 ? 2 : null,
                  is_active: true,
                }
              : item,
          );
        }

        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            step_number: stepNumber,
            assignment_mode: STEP_DEFAULT_MODE[stepNumber],
            default_user_id: value === "none" ? null : value,
            fallback_step_number: stepNumber === 6 ? 2 : null,
            created_by: user?.id ?? null,
            is_active: true,
            notify_enabled: true,
          },
        ];
      });

      toast.success("Responsable d'étape mis à jour");
    } catch (error: any) {
      toast.error(error.message || "Erreur de sauvegarde");
    } finally {
      setSavingStep(null);
    }
  };

  const handleNotifyToggle = async (stepNumber: number, enabled: boolean) => {
    if (!canManageResponsibles) return;
    try {
      const { error } = await supabase
        .from("workflow_step_responsibles" as any)
        .update({ notify_enabled: enabled })
        .eq("step_number", stepNumber);

      if (error) throw error;

      setResponsibles((prev) =>
        prev.map((item) =>
          item.step_number === stepNumber ? { ...item, notify_enabled: enabled } : item,
        ),
      );
      toast.success(`Notifications e-mail ${enabled ? "activées" : "désactivées"} pour l'étape ${stepNumber}`);
    } catch (error: any) {
      toast.error(error.message || "Erreur de sauvegarde");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header flex items-center gap-2">
          <Workflow className="h-6 w-6 text-primary" />
          Workflow du Courrier
        </h1>
        <p className="page-description">Gestion des étapes, délais SLA et responsables par étape pour la production.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Aperçu du Circuit</CardTitle>
          <CardDescription>Visualisation du flux de traitement du courrier ministériel</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkflowStepper currentStep={1} />
        </CardContent>
      </Card>

      {/* Dynamic Step Manager */}
      <WorkflowStepManager />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Responsables par Étape (production)
          </CardTitle>
          <CardDescription>
            Les étapes 2, 3, 5, 6, 8 et 9 utilisent un responsable par défaut configurable. Les étapes 4 et 7 restent dynamiques.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {workflowSteps.filter((step) => step.step_order >= 2).map((step) => {
            const config = responsibleByStep.get(step.step_order);
            const selectedUserId = config?.default_user_id || "none";
            const selectedUser = selectedUserId !== "none" ? usersMap.get(selectedUserId) : null;
            const isManagedDefaultStep = MANAGED_DEFAULT_STEPS.includes(step.step_order);

            return (
              <div
                key={step.step}
                className="rounded-lg border bg-muted/30 px-4 py-3 space-y-2"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getStepColor(step.step)}`}>
                    {step.step}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{step.name}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                  {canManageResponsibles && (
                    <div className="flex items-center gap-2 shrink-0" title={config?.notify_enabled !== false ? "Notifications e-mail activées" : "Notifications e-mail désactivées"}>
                      <Mail className={`h-4 w-4 ${config?.notify_enabled !== false ? "text-primary" : "text-muted-foreground"}`} />
                      <Switch
                        checked={config?.notify_enabled !== false}
                        onCheckedChange={(checked) => handleNotifyToggle(step.step, checked)}
                      />
                    </div>
                  )}
                </div>

                {isManagedDefaultStep ? (
                  <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                    <Select
                      value={selectedUserId}
                      onValueChange={(value) => handleResponsibleChange(step.step, value)}
                      disabled={!canManageResponsibles || savingStep === step.step}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner le responsable par défaut" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucun (fallback automatique)</SelectItem>
                        {users.map((candidate) => (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            {candidate.full_name} — {candidate.role.replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="text-xs text-muted-foreground">
                      {step.step === 6
                        ? "Fallback: assignee étape 2 si vide"
                        : selectedUser
                          ? `${selectedUser.full_name}`
                          : "Fallback par rôle"}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground rounded-md border bg-background px-3 py-2">
                    Assignation dynamique: définie pendant l'exécution (étape 2 → étape 4, étape 6 → étape 7).
                  </p>
                )}
              </div>
            );
          })}

          {!canManageResponsibles && (
            <p className="text-xs text-muted-foreground">
              Seul le SuperAdmin (ou un Admin avec la permission « gérer les assignations workflow ») peut modifier ces responsables.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Configuration SLA par Étape
          </CardTitle>
          <CardDescription>
            Définissez le délai maximal de traitement pour chaque étape du workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {slaConfigs.map((config) => (
            <div
              key={config.id}
              className="flex items-center gap-3 py-3 px-4 rounded-lg border transition-colors bg-muted/30"
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getStepColor(config.step_number)}`}>
                {config.step_number}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{config.step_name}</p>
                {config.description && (
                  <p className="text-xs text-muted-foreground truncate">{config.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={config.default_hours}
                  onChange={(e) => updateHours(config.id, parseInt(e.target.value, 10) || 48)}
                  className="w-20 h-8 text-center text-sm"
                  min={1}
                />
                <span className="text-xs text-muted-foreground">heures</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
