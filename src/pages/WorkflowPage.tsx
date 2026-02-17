import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Workflow, Plus, GripVertical, Trash2, Clock, Settings2 } from "lucide-react";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { WORKFLOW_STEPS, getStepColor } from "@/lib/workflow-engine";

interface SlaConfig {
  id: string;
  step_number: number;
  step_name: string;
  default_hours: number;
  description: string | null;
}

export default function WorkflowPage() {
  const [slaConfigs, setSlaConfigs] = useState<SlaConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSla();
  }, []);

  const fetchSla = async () => {
    const { data, error } = await supabase
      .from("sla_config")
      .select("*")
      .order("step_number");
    if (error) toast.error(error.message);
    else setSlaConfigs(data || []);
    setLoading(false);
  };

  const updateHours = async (id: string, hours: number) => {
    if (hours < 1) return;
    const { error } = await supabase
      .from("sla_config")
      .update({ default_hours: hours })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      setSlaConfigs(prev => prev.map(s => s.id === id ? { ...s, default_hours: hours } : s));
      toast.success("SLA mis à jour");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header flex items-center gap-2">
          <Workflow className="h-6 w-6 text-primary" />
          Workflow du Courrier
        </h1>
        <p className="page-description">Circuit hiérarchique à 7 étapes avec SLA configurables</p>
      </div>

      {/* Visual Stepper Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Aperçu du Circuit</CardTitle>
          <CardDescription>Visualisation du flux de traitement du courrier ministériel</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkflowStepper currentStep={1} />
        </CardContent>
      </Card>

      {/* SLA Configuration */}
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
              className={`flex items-center gap-3 py-3 px-4 rounded-lg border transition-colors bg-muted/30`}
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
                  onChange={(e) => updateHours(config.id, parseInt(e.target.value) || 48)}
                  className="w-20 h-8 text-center text-sm"
                  min={1}
                />
                <span className="text-xs text-muted-foreground">heures</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Workflow Steps Detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Détail des Étapes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {WORKFLOW_STEPS.map((step) => (
              <div key={step.step} className="flex gap-4 items-start">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${getStepColor(step.step)}`}>
                  {step.step}
                </div>
                <div>
                  <p className="text-sm font-semibold">{step.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  <p className="text-xs mt-1">
                    <span className="font-medium">Responsable :</span>{" "}
                    <span className="capitalize">{step.role.replace("_", " ")}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
