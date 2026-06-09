import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Reply, Upload, X, Paperclip, AlertCircle } from "lucide-react";
import { formatFileSize } from "@/lib/file-compressor";
import { uploadIncomingMailFiles } from "@/lib/mail-storage";
import type { MailAttachmentMeta } from "@/lib/labels";
import { UI_LABELS } from "@/lib/labels";
import { COUNTRIES, RDC_PROVINCES } from "@/lib/geo-options";
import { resolveWorkflowStepAssignee } from "@/lib/workflow-assignment";
import { getWorkflowRoutingContext } from "@/lib/workflow-step-routing";
import { SearchableUserSingleSelect } from "@/components/SearchableUserPicker";
import {
  generateSystemReference,
  getDefaultDepositTime,
  resolveDepositTime,
} from "@/lib/mail-registration";
import { RegistrationAiAssistant } from "@/components/MailAiAssistant";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  direction: "entrant" | "sortant";
  onCreated?: () => void;
  parentMail?: {
    id: string;
    reference_number: string;
    sender_name: string;
    sender_organization?: string | null;
    subject: string;
  } | null;
};

type PendingUpload = {
  id: string;
  file: File;
  status: "uploading" | "done" | "error";
  meta?: MailAttachmentMeta;
  error?: string;
};

export function MailRegistrationSheet({ open, onOpenChange, direction, onCreated, parentMail }: Props) {
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

  // Première étape active de routage (souvent 2 si étape 1 désactivée)
  const { data: treatmentStep } = useQuery({
    queryKey: ["workflow-routing-step"],
    queryFn: async () => {
      const ctx = await getWorkflowRoutingContext();
      const { data } = await supabase
        .from("workflow_steps")
        .select("step_order, name")
        .eq("step_order", ctx.routingStep)
        .eq("is_active", true)
        .maybeSingle();
      return data;
    },
  });

  const [form, setForm] = useState({
    reference_number: "",
    registry_reference: "",
    deposit_time: getDefaultDepositTime(),
    sender_name: "",
    sender_organization: "",
    sender_phone: "",
    sender_email: "",
    sender_address: "",
    sender_city: "",
    sender_province: "",
    sender_country: "République démocratique du Congo",
    subject: "",
    description: "",
    reception_date: new Date().toISOString().slice(0, 10),
    mail_type: "",
    priority: "normal",
    addressed_to: "",
    target_service_id: "",
    assigned_to: "",
  });
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [titulaireAbsent, setTitulaireAbsent] = useState(false);
  const [systemRefPreview, setSystemRefPreview] = useState(generateSystemReference);

  const { data: registrarProfile } = useQuery({
    queryKey: ["registrar-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("province_code, full_name")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user && open,
  });

  useEffect(() => {
    if (open) {
      setSystemRefPreview(generateSystemReference());
      setForm((f) => ({ ...f, deposit_time: f.deposit_time || getDefaultDepositTime() }));
    }
  }, [open]);

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    if (open && parentMail) {
      setForm((f) => ({
        ...f,
        subject: f.subject || `RE: ${parentMail.subject}`,
        addressed_to: f.addressed_to || parentMail.sender_name,
        sender_name: f.sender_name || parentMail.sender_name,
        sender_organization: f.sender_organization || (parentMail.sender_organization || ""),
      }));
    }
  }, [open, parentMail]);

  const uploadRef = form.reference_number.trim() || systemRefPreview;

  const uploadOneFile = async (file: File) => {
    const id = crypto.randomUUID();
    setUploads((prev) => [...prev, { id, file, status: "uploading" }]);
    try {
      const metas = await uploadIncomingMailFiles(
        uploadRef,
        [file],
        form.reception_date || null,
        (_name, originalSize, compressedSize) => {
          toast.info(
            `Fichier compressé : ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}`
          );
        }
      );
      setUploads((prev) =>
        prev.map((u) =>
          u.id === id ? { ...u, status: "done", meta: metas[0] } : u
        )
      );
      toast.success(`${file.name} importé`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Échec de l'import";
      setUploads((prev) =>
        prev.map((u) => (u.id === id ? { ...u, status: "error", error: msg } : u))
      );
      toast.error(`Import échoué : ${file.name}`);
    }
  };

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    if (!uploadRef) {
      toast.error("Saisissez le N° courrier avant d'ajouter des pièces jointes.");
      return;
    }
    Array.from(incoming).forEach((file) => {
      void uploadOneFile(file);
    });
  };

  const removeUpload = (id: string) =>
    setUploads((prev) => prev.filter((u) => u.id !== id));

  const reset = () =>
  {
    setForm({
      reference_number: "",
      registry_reference: "",
      deposit_time: getDefaultDepositTime(),
      sender_name: "",
      sender_organization: "",
      sender_phone: "",
      sender_email: "",
      sender_address: "",
      sender_city: "",
      sender_province: "",
      sender_country: "République démocratique du Congo",
      subject: "",
      description: "",
      reception_date: new Date().toISOString().slice(0, 10),
      mail_type: "",
      priority: "normal",
      addressed_to: "",
      target_service_id: "",
      assigned_to: "",
    });
    setUploads([]);
    setTitulaireAbsent(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.sender_name.trim() || !form.subject.trim()) {
      toast.error("Expéditeur/Destinataire et Objet sont obligatoires.");
      return;
    }
    if (!form.reference_number.trim()) {
      toast.error("Le numéro du courrier est obligatoire.");
      return;
    }
    if (!form.mail_type.trim()) {
      toast.error("Le type de courrier est obligatoire.");
      return;
    }
    if (titulaireAbsent && !form.assigned_to) {
      toast.error("Désignez l'intérimaire — autorité absente.");
      return;
    }
    if (uploads.length === 0) {
      toast.error("Au moins une pièce jointe est obligatoire.");
      return;
    }
    if (uploads.some((u) => u.status === "uploading")) {
      toast.error("Import en cours — attendez la fin du téléversement.");
      return;
    }
    if (uploads.some((u) => u.status === "error")) {
      toast.error("Retirez ou réimportez les pièces jointes en erreur.");
      return;
    }
    const attachmentUrls = uploads
      .filter((u) => u.status === "done" && u.meta)
      .map((u) => u.meta!);
    if (attachmentUrls.length === 0) {
      toast.error("Au moins une pièce jointe valide est obligatoire.");
      return;
    }
    setLoading(true);
    try {
      const ref = form.reference_number.trim();
      const systemRef = systemRefPreview || generateSystemReference();
      const depositTime = resolveDepositTime(form.deposit_time);

      const { data: existing } = await supabase
        .from("mails")
        .select("id")
        .eq("reference_number", ref)
        .limit(1);
      if (existing && existing.length > 0) {
        toast.error("Ce numéro de courrier existe déjà.");
        setLoading(false);
        return;
      }

      const profile = registrarProfile;

      const qrCodeData = JSON.stringify({
        ref: systemRef,
        mailNumber: ref,
        date: new Date().toISOString(),
        agent: user.id,
        direction,
      });

      const routing = await getWorkflowRoutingContext();
      const targetStep = routing.routingStep;

      const attachmentUrl: string | null = attachmentUrls[0]?.url ?? null;

      // Résolution du destinataire pour l'étape 2
      let assignee: string | null = null;
      let interimLabel = "";
      if (titulaireAbsent) {
        assignee = form.assigned_to || null;
        const interimUser = assignableUsers.find((u: { id: string }) => u.id === form.assigned_to);
        interimLabel = interimUser?.full_name || interimUser?.email || "Intérimaire désigné";
      } else {
        assignee = await resolveWorkflowStepAssignee(targetStep, null);
      }

      const addressedToLabel = titulaireAbsent
        ? interimLabel
        : (treatmentStep?.name || "Traitement DG");

      const bypassReception = !routing.step1Active;
      const insertStep = bypassReception ? targetStep : 1;

      const { data: slaData } = await supabase
        .from("sla_config")
        .select("default_hours")
        .eq("step_number", targetStep)
        .maybeSingle();
      const deadlineHours = slaData?.default_hours || 24;
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + deadlineHours);

      // Insert mail (étape 1 si active, sinon bypass direct vers targetStep)
      const { data: inserted, error } = await supabase
        .from("mails")
        .insert({
          reference_number: ref,
          registry_reference: form.registry_reference.trim() || null,
          system_reference: systemRef,
          qr_code_data: qrCodeData,
          sender_name: form.sender_name,
          sender_organization: form.sender_organization || null,
          sender_phone: form.sender_phone.trim() || null,
          sender_email: form.sender_email.trim() || null,
          sender_address: form.sender_address.trim() || null,
          sender_city: form.sender_city.trim() || null,
          sender_province: form.sender_province.trim() || null,
          sender_country: form.sender_country || null,
          subject: form.subject,
          description: form.description || null,
          priority: form.priority as any,
          mail_type: form.mail_type || null,
          registered_by: user.id,
          current_step: insertStep,
          status: (bypassReception ? "in_progress" : "pending") as any,
          attachment_url: attachmentUrl,
          attachment_urls: attachmentUrls,
          ministre_absent: titulaireAbsent,
          assigned_agent_id: assignee,
          reception_date: form.reception_date || null,
          deposit_time: depositTime,
          addressed_to: addressedToLabel,
          direction,
          target_service_id: form.target_service_id || null,
          province_code: (profile as any)?.province_code || null,
          parent_mail_id: parentMail?.id || null,
          deadline_at: bypassReception ? deadline.toISOString() : null,
          workflow_started_at: bypassReception ? new Date().toISOString() : null,
        } as any)
        .select("id")
        .single();

      if (error) throw error;
      if (!inserted) throw new Error("Insertion sans retour");

      await supabase.from("workflow_transitions").insert({
        mail_id: inserted.id,
        from_step: null,
        to_step: insertStep,
        action: "register",
        performed_by: user.id,
        notes: bypassReception
          ? `Courrier ${direction} enregistré — étape Réception désactivée (bypass vers étape ${targetStep})`
          : `Courrier ${direction} enregistré`,
      });

      if (assignee) {
        await supabase.from("mail_assignments").insert({
          mail_id: inserted.id,
          assigned_by: user.id,
          assigned_to: assignee,
          step_number: targetStep,
          status: "pending",
          access_mode: titulaireAbsent ? "custodian" : "contributor",
          instructions: form.description || null,
        });
        await supabase.from("notifications").insert({
          user_id: assignee,
          title: "Nouveau courrier à traiter",
          message: `Courrier "${form.subject}" (Réf: ${ref}) vous a été assigné.`,
          mail_id: inserted.id,
        });
      }

      if (bypassReception) {
        if (targetStep !== insertStep) {
          await supabase.from("workflow_transitions").insert({
            mail_id: inserted.id,
            from_step: insertStep,
            to_step: targetStep,
            action: "skip",
            performed_by: user.id,
            notes: "Bypass étape inactive",
          });
        }
      } else {
        await supabase.from("workflow_transitions").insert({
          mail_id: inserted.id,
          from_step: 1,
          to_step: targetStep,
          action: "approve",
          performed_by: user.id,
          notes: titulaireAbsent
            ? `Routage intérim : ${addressedToLabel}`
            : `Routage automatique vers ${addressedToLabel}`,
        });
      }

      await supabase
        .from("mails")
        .update({
          current_step: targetStep,
          status: "in_progress" as any,
          assigned_agent_id: assignee,
          deadline_at: deadline.toISOString(),
          workflow_started_at: new Date().toISOString(),
        })
        .eq("id", inserted.id);

      toast.success(
        parentMail
          ? `Réponse créée (Réf: ${ref}) — liée au courrier ${parentMail.reference_number}.`
          : assignee
            ? `Courrier ${direction} enregistré et routé (étape ${targetStep}, Réf: ${ref}).`
            : `Courrier enregistré à l'étape ${targetStep} — assignation DG à configurer (Réf: ${ref}).`,
      );
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
  const addressSectionLabel =
    direction === "sortant" ? "Adresse du destinataire" : "Adresse de l'expéditeur";
  const isRdc = form.sender_country === "République démocratique du Congo";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[50vw] max-w-[50vw] sm:max-w-2xl lg:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Nouveau courrier {direction === "entrant" ? "entrant" : "sortant"}
          </DialogTitle>
          <DialogDescription>
            Enregistrement officiel — toutes les informations clés du courrier.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {parentMail && (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Reply className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-primary">Réponse au courrier {parentMail.reference_number}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{parentMail.subject}</p>
              </div>
            </div>
          )}
          {/* Identité */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Identité</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>N° courrier *</Label>
                <Input
                  value={form.reference_number}
                  onChange={(e) => update("reference_number", e.target.value)}
                  placeholder="Numéro attribué au courrier"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Référence registre</Label>
                <Input
                  value={form.registry_reference}
                  onChange={(e) => update("registry_reference", e.target.value)}
                  placeholder="Référence du registre papier (optionnel)"
                />
              </div>
              <div className="space-y-1.5">
                <Label>ID système (auto)</Label>
                <Input value={systemRefPreview} disabled className="bg-muted font-mono text-xs" />
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
                <Label>Date réception *</Label>
                <Input
                  type="date"
                  value={form.reception_date}
                  onChange={(e) => update("reception_date", e.target.value)}
                />
              </div>
              {registrarProfile?.province_code && (
                <div className="space-y-1.5">
                  <Label>Province enregistreur</Label>
                  <Input value={registrarProfile.province_code} disabled className="bg-muted text-xs" />
                </div>
              )}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Téléphone de l&apos;expéditeur</Label>
                <Input
                  type="tel"
                  value={form.sender_phone}
                  onChange={(e) => update("sender_phone", e.target.value)}
                  placeholder="+243 …"
                />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail de l&apos;expéditeur</Label>
                <Input
                  type="email"
                  value={form.sender_email}
                  onChange={(e) => update("sender_email", e.target.value)}
                  placeholder="exemple@domaine.com"
                />
              </div>
            </div>
          </section>

          {/* Adresse */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{addressSectionLabel}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pays</Label>
                <Select
                  value={form.sender_country}
                  onValueChange={(v) => {
                    update("sender_country", v);
                    if (v !== "République démocratique du Congo") {
                      update("sender_province", "");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un pays" />
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
                      <SelectValue placeholder="Choisir une province" />
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
                    placeholder="Province ou région"
                  />
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Ville</Label>
              <Input
                value={form.sender_city}
                onChange={(e) => update("sender_city", e.target.value)}
                placeholder="Ville"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Adresse</Label>
              <Textarea
                value={form.sender_address}
                onChange={(e) => update("sender_address", e.target.value)}
                placeholder="Numéro, avenue, quartier…"
                rows={2}
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
              <div className="flex items-center justify-between gap-2">
                <Label>Description / commentaires</Label>
                <RegistrationAiAssistant
                  context={{
                    subject: form.subject,
                    description: form.description,
                    senderName: form.sender_name,
                  }}
                  onApplyToComments={(text) => {
                    const current = form.description?.trim();
                    update("description", current ? `${current}\n\n${text}` : text);
                    toast.success("Texte inséré dans la description");
                  }}
                />
              </div>
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
                <Label>Type *</Label>
                <Select value={form.mail_type} onValueChange={(v) => update("mail_type", v)} required>
                  <SelectTrigger className={!form.mail_type ? "border-destructive/50" : ""}>
                    <SelectValue placeholder="Choisir un type (obligatoire)" />
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
              <Label>Circuit / registre</Label>
              <Select
                value={form.target_service_id}
                onValueChange={(v) => update("target_service_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un circuit (DG, PCA, pôle…)" />
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

            {/* Adressé à — routage par défaut DG + toggle intérim */}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm font-semibold">Adressé à</Label>
                  <p className="text-xs text-muted-foreground">
                    {titulaireAbsent
                      ? UI_LABELS.dgAbsentHint
                      : `Routage automatique vers : ${treatmentStep?.name || "Traitement DG"}.`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Label htmlFor="abs" className="text-xs">{UI_LABELS.dgAbsent}</Label>
                  <Switch
                    id="abs"
                    checked={titulaireAbsent}
                    onCheckedChange={(c) => {
                      setTitulaireAbsent(c);
                      if (!c) {
                        update("addressed_to", "");
                        update("assigned_to", "");
                      }
                    }}
                  />
                </div>
              </div>

              {titulaireAbsent && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Intérimaire *</Label>
                  <SearchableUserSingleSelect
                    users={assignableUsers}
                    value={form.assigned_to}
                    onValueChange={(v) => update("assigned_to", v)}
                    placeholder="Rechercher l'intérimaire"
                  />
                </div>
              )}
            </div>
          </section>

          {/* Pièces jointes */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Pièces jointes *</h3>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/30 p-4 text-center hover:bg-muted/30 transition-colors"
            >
              <Upload className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground mt-1">
                Glisser-déposer ou cliquer pour ajouter — une ou plusieurs pièces jointes (PDF, images, documents).
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
            {uploads.length > 0 && (
              <ul className="space-y-1">
                {uploads.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between rounded border bg-background px-2 py-1.5 text-xs"
                  >
                    <span className="flex items-center gap-2 truncate min-w-0">
                      {u.status === "uploading" && (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                      )}
                      {u.status === "done" && (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                      )}
                      {u.status === "error" && (
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                      )}
                      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{u.file.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        ({formatFileSize(u.file.size)})
                      </span>
                      {u.status === "done" && (
                        <span className="text-green-600 shrink-0">Importé</span>
                      )}
                      {u.status === "error" && (
                        <span className="text-destructive truncate">{u.error}</span>
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      disabled={u.status === "uploading"}
                      onClick={() => removeUpload(u.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <DialogFooter className="gap-2">
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}