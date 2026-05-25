import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  direction: "entrant" | "sortant";
  onCreated?: () => void;
};

const generateRef = () => {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CR-${d}-${rand}`;
};

export function MailRegistrationSheet({ open, onOpenChange, direction, onCreated }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const { data: types = [] } = useQuery({
    queryKey: ["mail_types", direction],
    queryFn: async () => {
      const { data } = await supabase
        .from("mail_types")
        .select("*")
        .eq("is_active", true)
        .or(`direction.eq.${direction},direction.eq.both`)
        .order("label");
      return data ?? [];
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services_concernes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("services_concernes")
        .select("*")
        .eq("is_active", true)
        .order("label");
      return data ?? [];
    },
  });

  const { data: assignableUsers = [] } = useQuery({
    queryKey: ["assignable-users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      return data ?? [];
    },
  });

  const [form, setForm] = useState({
    reference_number: "",
    sender_name: "",
    sender_organization: "",
    subject: "",
    description: "",
    reception_date: new Date().toISOString().slice(0, 10),
    mail_type: "",
    priority: "normal",
    addressed_to: "",
    target_service_id: "",
    assigned_to: "",
  });

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const reset = () =>
    setForm({
      reference_number: "",
      sender_name: "",
      sender_organization: "",
      subject: "",
      description: "",
      reception_date: new Date().toISOString().slice(0, 10),
      mail_type: "",
      priority: "normal",
      addressed_to: "",
      target_service_id: "",
      assigned_to: "",
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.sender_name.trim() || !form.subject.trim()) {
      toast.error("Expéditeur/Destinataire et Objet sont obligatoires.");
      return;
    }
    setLoading(true);
    try {
      const ref = form.reference_number.trim() || generateRef();

      // Province from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("province_code")
        .eq("id", user.id)
        .maybeSingle();

      const qrCodeData = JSON.stringify({
        ref,
        date: new Date().toISOString(),
        agent: user.id,
        direction,
      });

      const selectedType = types.find((t: any) => t.code === form.mail_type);
      const targetStep = selectedType?.default_workflow_step ?? 1;

      // Insert mail
      const { data: inserted, error } = await supabase
        .from("mails")
        .insert({
          reference_number: ref,
          qr_code_data: qrCodeData,
          sender_name: form.sender_name,
          sender_organization: form.sender_organization || null,
          subject: form.subject,
          description: form.description || null,
          priority: form.priority as any,
          mail_type: form.mail_type || null,
          registered_by: user.id,
          current_step: 1,
          status: "pending" as any,
          reception_date: form.reception_date || null,
          addressed_to: form.addressed_to || null,
          direction,
          target_service_id: form.target_service_id || null,
          province_code: (profile as any)?.province_code || null,
        } as any)
        .select("id")
        .single();

      if (error) throw error;
      if (!inserted) throw new Error("Insertion sans retour");

      // Workflow transition (register — ne verrouille pas)
      await supabase.from("workflow_transitions").insert({
        mail_id: inserted.id,
        from_step: null,
        to_step: 1,
        action: "register",
        performed_by: user.id,
        notes: `Courrier ${direction} enregistré`,
      });

      // Determine assignee: manual override > service default handler
      let assignee: string | null = form.assigned_to || null;
      if (!assignee && form.target_service_id) {
        const svc = services.find((s: any) => s.id === form.target_service_id);
        assignee = svc?.default_handler_user_id || null;
      }

      if (assignee) {
        await supabase.from("mail_assignments").insert({
          mail_id: inserted.id,
          assigned_by: user.id,
          assigned_to: assignee,
          step_number: targetStep,
          status: "pending",
          instructions: form.description || null,
        });
        await supabase.from("notifications").insert({
          user_id: assignee,
          title: "Nouveau courrier à traiter",
          message: `Courrier "${form.subject}" (Réf: ${ref}) vous a été assigné.`,
          mail_id: inserted.id,
        });
      }

      toast.success(`Courrier ${direction} enregistré (Réf: ${ref}).`);
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  const peopleLabel = direction === "entrant" ? "Expéditeur" : "Destinataire";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            Nouveau courrier {direction === "entrant" ? "entrant" : "sortant"}
          </SheetTitle>
          <SheetDescription>
            Enregistrement officiel — toutes les informations clés du courrier.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Identité */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Identité</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>N° courrier (optionnel)</Label>
                <Input
                  value={form.reference_number}
                  onChange={(e) => update("reference_number", e.target.value)}
                  placeholder="Auto si vide"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date réception *</Label>
                <Input
                  type="date"
                  value={form.reception_date}
                  onChange={(e) => update("reception_date", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{peopleLabel} *</Label>
              <Input
                value={form.sender_name}
                onChange={(e) => update("sender_name", e.target.value)}
                placeholder={`Nom du ${peopleLabel.toLowerCase()}`}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Organisation</Label>
              <Input
                value={form.sender_organization}
                onChange={(e) => update("sender_organization", e.target.value)}
              />
            </div>
          </section>

          {/* Contenu */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Contenu</h3>
            <div className="space-y-1.5">
              <Label>Objet *</Label>
              <Input
                value={form.subject}
                onChange={(e) => update("subject", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description / commentaires</Label>
              <Textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
              />
            </div>
          </section>

          {/* Classification */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Classification & routage</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.mail_type} onValueChange={(v) => update("mail_type", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un type" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t: any) => (
                      <SelectItem key={t.id} value={t.code}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Urgence</Label>
                <Select value={form.priority} onValueChange={(v) => update("priority", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Basse</SelectItem>
                    <SelectItem value="normal">Normale</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Service concerné</Label>
              <Select
                value={form.target_service_id}
                onValueChange={(v) => update("target_service_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Adressé à (libre)</Label>
              <Input
                value={form.addressed_to}
                onChange={(e) => update("addressed_to", e.target.value)}
                placeholder="Ex : Ministre, DirCab, …"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Assigner à (optionnel — sinon routage par défaut du service)</Label>
              <Select value={form.assigned_to} onValueChange={(v) => update("assigned_to", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Routage automatique" />
                </SelectTrigger>
                <SelectContent>
                  {assignableUsers.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <SheetFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}