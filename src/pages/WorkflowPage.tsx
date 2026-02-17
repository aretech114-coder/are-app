import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Workflow, Plus, GripVertical, Trash2 } from "lucide-react";

interface WorkflowStep {
  id: string;
  name: string;
  step_order: number;
  description: string | null;
  is_active: boolean;
}

export default function WorkflowPage() {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [newStepName, setNewStepName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSteps();
  }, []);

  const fetchSteps = async () => {
    const { data, error } = await supabase
      .from("workflow_steps")
      .select("*")
      .order("step_order");
    if (error) toast.error(error.message);
    else setSteps(data || []);
    setLoading(false);
  };

  const addStep = async () => {
    if (!newStepName.trim()) return;
    const nextOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.step_order)) + 1 : 1;
    const { error } = await supabase
      .from("workflow_steps")
      .insert({ name: newStepName, step_order: nextOrder });
    if (error) toast.error(error.message);
    else {
      toast.success("Étape ajoutée");
      setNewStepName("");
      fetchSteps();
    }
  };

  const toggleStep = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from("workflow_steps")
      .update({ is_active: !isActive })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: !isActive } : s)));
    }
  };

  const deleteStep = async (id: string) => {
    const { error } = await supabase.from("workflow_steps").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Étape supprimée");
      setSteps((prev) => prev.filter((s) => s.id !== id));
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header flex items-center gap-2">
          <Workflow className="h-6 w-6 text-primary" />
          Workflow du Courrier
        </h1>
        <p className="page-description">Définissez les étapes du circuit de traitement</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Étapes du Circuit</CardTitle>
          <CardDescription>
            Gérez l'ordre et l'activation des étapes de traitement du courrier.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-center gap-3 py-3 px-4 rounded-lg border transition-colors ${
                step.is_active ? "bg-muted/30" : "bg-muted/10 opacity-60"
              }`}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{step.name}</p>
                {step.description && (
                  <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                )}
              </div>
              <Switch
                checked={step.is_active}
                onCheckedChange={() => toggleStep(step.id, step.is_active)}
              />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteStep(step.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="flex gap-2 pt-3 border-t">
            <Input
              placeholder="Nouvelle étape..."
              value={newStepName}
              onChange={(e) => setNewStepName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStep()}
            />
            <Button onClick={addStep} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Ajouter
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
