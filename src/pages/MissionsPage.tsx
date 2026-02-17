import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plane, Plus, Calendar, MapPin } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Mission {
  id: string;
  title: string;
  description: string | null;
  destination: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  assigned_to: string;
  created_by: string;
  budget_estimate: number | null;
  notes: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  preparation: { label: "Préparation", class: "bg-warning/10 text-warning" },
  ongoing: { label: "En cours", class: "bg-info/10 text-info" },
  closed: { label: "Clôturée", class: "bg-success/10 text-success" },
};

export default function MissionsPage() {
  const { user } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", destination: "", start_date: "", end_date: "", budget_estimate: "", notes: "",
  });

  useEffect(() => { fetchMissions(); }, []);

  const fetchMissions = async () => {
    setLoading(true);
    const { data } = await supabase.from("missions").select("*").order("created_at", { ascending: false });
    setMissions((data as Mission[]) || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("missions").insert({
      title: form.title,
      description: form.description || null,
      destination: form.destination || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      budget_estimate: form.budget_estimate ? parseFloat(form.budget_estimate) : null,
      notes: form.notes || null,
      assigned_to: user.id,
      created_by: user.id,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Mission créée");
    setShowForm(false);
    setForm({ title: "", description: "", destination: "", start_date: "", end_date: "", budget_estimate: "", notes: "" });
    fetchMissions();
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("missions").update({ status } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Statut mis à jour");
    fetchMissions();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Missions Officielles</h1>
          <p className="page-description">Suivi des déplacements et missions</p>
        </div>
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nouvelle Mission</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Créer une mission</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Titre *</Label>
                <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Destination</Label>
                <Input value={form.destination} onChange={(e) => setForm(f => ({ ...f, destination: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Date début *</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Date fin</Label>
                  <Input type="date" value={form.end_date} onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Budget estimé</Label>
                <Input type="number" value={form.budget_estimate} onChange={(e) => setForm(f => ({ ...f, budget_estimate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
              </div>
              <Button type="submit" className="w-full">Créer la mission</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Chargement...</p>
      ) : missions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Plane className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Aucune mission enregistrée</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {missions.map((m) => (
            <div key={m.id} className="stat-card">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{m.title}</h3>
                  {m.destination && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" />{m.destination}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(m.start_date), "dd MMM yyyy", { locale: fr })}
                    {m.end_date && ` → ${format(new Date(m.end_date), "dd MMM yyyy", { locale: fr })}`}
                  </p>
                  {m.description && <p className="text-sm mt-2">{m.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_LABELS[m.status]?.class}`}>
                    {STATUS_LABELS[m.status]?.label}
                  </span>
                  <Select value={m.status} onValueChange={(v) => updateStatus(m.id, v)}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preparation">Préparation</SelectItem>
                      <SelectItem value="ongoing">En cours</SelectItem>
                      <SelectItem value="closed">Clôturée</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
