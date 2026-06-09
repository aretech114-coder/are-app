import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { COUNTRIES, RDC_PROVINCES } from "@/lib/geo-options";
import { resolveDepositTime } from "@/lib/mail-registration";

interface MailEditDialogProps {
  mail: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function mailToForm(mail: any) {
  return {
    reference_number: mail?.reference_number || "",
    registry_reference: mail?.registry_reference || "",
    system_reference: mail?.system_reference || "",
    deposit_time: mail?.deposit_time?.slice?.(0, 5) || mail?.deposit_time || "",
    reception_date: mail?.reception_date || "",
    sender_name: mail?.sender_name || "",
    sender_organization: mail?.sender_organization || "",
    sender_phone: mail?.sender_phone || "",
    sender_email: mail?.sender_email || "",
    sender_address: mail?.sender_address || "",
    sender_city: mail?.sender_city || "",
    sender_province: mail?.sender_province || "",
    sender_country: mail?.sender_country || "République démocratique du Congo",
    subject: mail?.subject || "",
    description: mail?.description || "",
    comments: mail?.comments || "",
    priority: mail?.priority || "normal",
    mail_type: mail?.mail_type || "",
    target_service_id: mail?.target_service_id || "",
    addressed_to: mail?.addressed_to || "",
  };
}

export function MailEditDialog({ mail, open, onOpenChange, onSaved }: MailEditDialogProps) {
  const direction: "entrant" | "sortant" = mail?.direction === "sortant" ? "sortant" : "entrant";
  const peopleLabel = direction === "entrant" ? "Expéditeur" : "Destinataire";
  const addressSectionLabel =
    direction === "sortant" ? "Adresse du destinataire" : "Adresse de l'expéditeur";

  const [form, setForm] = useState(mailToForm(mail));
  const [saving, setSaving] = useState(false);

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
    enabled: open,
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
    enabled: open,
  });

  useEffect(() => {
    if (open && mail) {
      setForm(mailToForm(mail));
    }
  }, [open, mail]);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const isRdc = form.sender_country === "République démocratique du Congo";

  const handleSave = async () => {
    if (!form.sender_name.trim() || !form.subject.trim()) {
      toast.error(`${peopleLabel} et Objet sont obligatoires.`);
      return;
    }
    if (!form.reference_number.trim()) {
      toast.error("Le numéro du courrier est obligatoire.");
      return;
    }

    setSaving(true);
    const depositTime = resolveDepositTime(form.deposit_time);

    const { error } = await supabase
      .from("mails")
      .update({
        reference_number: form.reference_number.trim(),
        registry_reference: form.registry_reference.trim() || null,
        deposit_time: depositTime,
        reception_date: form.reception_date || null,
        sender_name: form.sender_name.trim(),
        sender_organization: form.sender_organization.trim() || null,
        sender_phone: form.sender_phone.trim() || null,
        sender_email: form.sender_email.trim() || null,
        sender_address: form.sender_address.trim() || null,
        sender_city: form.sender_city.trim() || null,
        sender_province: form.sender_province.trim() || null,
        sender_country: form.sender_country || null,
        subject: form.subject.trim(),
        description: form.description.trim() || null,
        comments: form.comments.trim() || null,
        priority: form.priority as any,
        mail_type: form.mail_type || null,
        target_service_id: form.target_service_id || null,
        addressed_to: form.addressed_to.trim() || null,
      })
      .eq("id", mail.id);

    setSaving(false);
    if (error) {
      toast.error("Erreur: " + error.message);
    } else {
      toast.success("Courrier modifié avec succès");
      onOpenChange(false);
      onSaved();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[50vw] max-w-[50vw] sm:max-w-2xl lg:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Modifier le courrier — {mail?.reference_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Identité</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>N° courrier *</Label>
                <Input
                  value={form.reference_number}
                  onChange={(e) => update("reference_number", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Référence registre</Label>
                <Input
                  value={form.registry_reference}
                  onChange={(e) => update("registry_reference", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>ID système</Label>
                <Input value={form.system_reference} disabled className="bg-muted font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label>Heure de dépôt</Label>
                <Input
                  type="time"
                  value={form.deposit_time}
                  onChange={(e) => update("deposit_time", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date réception</Label>
                <Input
                  type="date"
                  value={form.reception_date}
                  onChange={(e) => update("reception_date", e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{peopleLabel}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{peopleLabel} *</Label>
                <Input
                  value={form.sender_name}
                  onChange={(e) => update("sender_name", e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Organisation</Label>
                <Input
                  value={form.sender_organization}
                  onChange={(e) => update("sender_organization", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Téléphone</Label>
                <Input
                  type="tel"
                  value={form.sender_phone}
                  onChange={(e) => update("sender_phone", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.sender_email}
                  onChange={(e) => update("sender_email", e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{addressSectionLabel}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pays</Label>
                <Select
                  value={form.sender_country}
                  onValueChange={(v) => {
                    update("sender_country", v);
                    if (v !== "République démocratique du Congo") update("sender_province", "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Province / État</Label>
                {isRdc ? (
                  <Select value={form.sender_province} onValueChange={(v) => update("sender_province", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Province" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {RDC_PROVINCES.map((p) => (
                        <SelectItem key={p.code} value={p.label}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.sender_province}
                    onChange={(e) => update("sender_province", e.target.value)}
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Ville</Label>
                <Input value={form.sender_city} onChange={(e) => update("sender_city", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Adresse</Label>
                <Textarea
                  value={form.sender_address}
                  onChange={(e) => update("sender_address", e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Contenu</h3>
            <div className="space-y-1.5">
              <Label>Objet *</Label>
              <Input value={form.subject} onChange={(e) => update("subject", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Commentaires</Label>
              <Textarea
                value={form.comments}
                onChange={(e) => update("comments", e.target.value)}
                rows={2}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Classification & routage</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.mail_type} onValueChange={(v) => update("mail_type", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
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
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Circuit / registre</Label>
                <Select
                  value={form.target_service_id}
                  onValueChange={(v) => update("target_service_id", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Circuit" />
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
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Adressé à</Label>
                <Input
                  value={form.addressed_to}
                  onChange={(e) => update("addressed_to", e.target.value)}
                />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Sauvegarder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MailDeleteDialogProps {
  mail: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function MailDeleteDialog({ mail, open, onOpenChange, onDeleted }: MailDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await supabase.from("mail_assignments").delete().eq("mail_id", mail.id);
    await supabase.from("workflow_transitions").delete().eq("mail_id", mail.id);
    await supabase.from("notifications").delete().eq("mail_id", mail.id);
    await supabase.from("mail_processing_history").delete().eq("mail_id", mail.id);

    const { error } = await supabase.from("mails").delete().eq("id", mail.id);
    setDeleting(false);
    if (error) {
      toast.error("Erreur suppression: " + error.message);
    } else {
      toast.success("Courrier supprimé définitivement");
      onOpenChange(false);
      onDeleted();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce courrier ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est irréversible. Le courrier <strong>{mail?.reference_number}</strong> (
            {mail?.subject}) et tout son historique seront supprimés définitivement.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
