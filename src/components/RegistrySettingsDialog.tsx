import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function RegistrySettingsDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();

  const { data: types = [], refetch: refetchTypes } = useQuery({
    queryKey: ["mail_types_admin"],
    queryFn: async () => {
      const { data } = await supabase.from("mail_types").select("*").order("label");
      return data ?? [];
    },
    enabled: open,
  });

  const { data: services = [], refetch: refetchServices } = useQuery({
    queryKey: ["services_concernes_admin"],
    queryFn: async () => {
      const { data } = await supabase.from("services_concernes").select("*").order("label");
      return data ?? [];
    },
    enabled: open,
  });

  const [newType, setNewType] = useState({ code: "", label: "", direction: "both" });
  const [newService, setNewService] = useState({ code: "", label: "" });
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editingServiceLabel, setEditingServiceLabel] = useState("");

  const addType = async () => {
    if (!newType.code.trim() || !newType.label.trim()) {
      toast.error("Code et libellé requis.");
      return;
    }
    const { error } = await supabase.from("mail_types").insert({
      code: newType.code.trim().toLowerCase().replace(/\s+/g, "_"),
      label: newType.label.trim(),
      direction: newType.direction,
    });
    if (error) return toast.error(error.message);
    toast.success("Type ajouté.");
    setNewType({ code: "", label: "", direction: "both" });
    refetchTypes();
    qc.invalidateQueries({ queryKey: ["mail_types"] });
  };

  const toggleType = async (id: string, is_active: boolean) => {
    await supabase.from("mail_types").update({ is_active }).eq("id", id);
    refetchTypes();
    qc.invalidateQueries({ queryKey: ["mail_types"] });
  };

  const deleteType = async (id: string) => {
    if (!confirm("Désactiver définitivement ce type ?")) return;
    const { error } = await supabase.from("mail_types").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refetchTypes();
    qc.invalidateQueries({ queryKey: ["mail_types"] });
  };

  const addService = async () => {
    if (!newService.code.trim() || !newService.label.trim()) {
      toast.error("Code et libellé requis.");
      return;
    }
    const { error } = await supabase.from("services_concernes").insert({
      code: newService.code.trim().toLowerCase().replace(/\s+/g, "_"),
      label: newService.label.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Service ajouté.");
    setNewService({ code: "", label: "" });
    refetchServices();
    qc.invalidateQueries({ queryKey: ["services_concernes"] });
  };

  const toggleService = async (id: string, is_active: boolean) => {
    await supabase.from("services_concernes").update({ is_active }).eq("id", id);
    refetchServices();
    qc.invalidateQueries({ queryKey: ["services_concernes"] });
  };

  const deleteService = async (id: string) => {
    if (!confirm("Supprimer ce service ?")) return;
    const { error } = await supabase.from("services_concernes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refetchServices();
    qc.invalidateQueries({ queryKey: ["services_concernes"] });
  };

  const startEditService = (s: { id: string; label: string }) => {
    setEditingServiceId(s.id);
    setEditingServiceLabel(s.label);
  };

  const saveServiceLabel = async () => {
    if (!editingServiceId || !editingServiceLabel.trim()) return;
    const { error } = await supabase
      .from("services_concernes")
      .update({ label: editingServiceLabel.trim() })
      .eq("id", editingServiceId);
    if (error) return toast.error(error.message);
    toast.success("Libellé mis à jour.");
    setEditingServiceId(null);
    setEditingServiceLabel("");
    refetchServices();
    qc.invalidateQueries({ queryKey: ["services_concernes"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Paramètres du registre</DialogTitle>
          <DialogDescription>
            Gérez les types de courriers et les circuits / registres disponibles à l'enregistrement.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="types">
          <TabsList>
            <TabsTrigger value="types">Types de courriers</TabsTrigger>
            <TabsTrigger value="services">Circuits / registres</TabsTrigger>
          </TabsList>

          <TabsContent value="types" className="space-y-4">
            <div className="grid grid-cols-12 gap-2 items-end border-b pb-3">
              <div className="col-span-3">
                <Input
                  placeholder="Code (ex: rapport)"
                  value={newType.code}
                  onChange={(e) => setNewType({ ...newType, code: e.target.value })}
                />
              </div>
              <div className="col-span-5">
                <Input
                  placeholder="Libellé visible"
                  value={newType.label}
                  onChange={(e) => setNewType({ ...newType, label: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Select
                  value={newType.direction}
                  onValueChange={(v) => setNewType({ ...newType, direction: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Les deux</SelectItem>
                    <SelectItem value="entrant">Entrant</SelectItem>
                    <SelectItem value="sortant">Sortant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addType} className="col-span-2 gap-1">
                <Plus className="h-4 w-4" /> Ajouter
              </Button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-auto">
              {types.map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 p-2 border rounded-md"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{t.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.code} · {t.direction}
                    </p>
                  </div>
                  <Switch
                    checked={t.is_active}
                    onCheckedChange={(v) => toggleType(t.id, v)}
                  />
                  <Button variant="ghost" size="icon" onClick={() => deleteType(t.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="services" className="space-y-4">
            <div className="grid grid-cols-12 gap-2 items-end border-b pb-3">
              <div className="col-span-4">
                <Input
                  placeholder="Code (ex: dg, pca, kinshasa)"
                  value={newService.code}
                  onChange={(e) => setNewService({ ...newService, code: e.target.value })}
                />
              </div>
              <div className="col-span-6">
                <Input
                  placeholder="Libellé circuit (ex: Direction générale, PCA, Pôle Kinshasa)"
                  value={newService.label}
                  onChange={(e) => setNewService({ ...newService, label: e.target.value })}
                />
              </div>
              <Button onClick={addService} className="col-span-2 gap-1">
                <Plus className="h-4 w-4" /> Ajouter
              </Button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-auto">
              {services.map((s: any) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 p-2 border rounded-md"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    {editingServiceId === s.id ? (
                      <div className="flex gap-2">
                        <Input
                          value={editingServiceLabel}
                          onChange={(e) => setEditingServiceLabel(e.target.value)}
                          className="h-8 text-sm"
                        />
                        <Button size="sm" variant="secondary" onClick={saveServiceLabel}>
                          OK
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingServiceId(null);
                            setEditingServiceLabel("");
                          }}
                        >
                          Annuler
                        </Button>
                      </div>
                    ) : (
                      <>
                        <p className="font-medium text-sm truncate">{s.label}</p>
                        <p className="text-xs text-muted-foreground">{s.code}</p>
                      </>
                    )}
                  </div>
                  <Switch
                    checked={s.is_active}
                    onCheckedChange={(v) => toggleService(s.id, v)}
                  />
                  {editingServiceId !== s.id && (
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => startEditService(s)}>
                      Modifier
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => deleteService(s.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}