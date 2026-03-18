import { useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { resolveWorkflowStepAssignee } from "@/lib/workflow-assignment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Send, Printer, Upload, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const COUNTRIES = [
  "République démocratique du Congo", "République du Congo", "Cameroun",
  "Côte d'Ivoire", "Sénégal", "Gabon", "Burkina Faso", "Mali",
  "Guinée", "Togo", "Bénin", "Niger", "Tchad", "France", "Belgique", "Autre",
];

const MAIL_TYPES = [
  { value: "ordinaire", label: "Ordinaire" },
  { value: "audience", label: "Audience" },
  { value: "presidence", label: "Présidence" },
  { value: "institutionnel", label: "Institutionnel" },
  { value: "interministeriel", label: "Inter-ministériel" },
  { value: "autre", label: "Autre" },
];

const ADDRESSEES_FULL = [
  { value: "MINISTRE", label: "Ministre" },
  { value: "DIRECTEUR DE CABINET", label: "Directeur de Cabinet" },
  { value: "DIRECTEUR DE CABINET ADJOINT", label: "Directeur de Cabinet Adjoint" },
  { value: "CONSEILLER JURIDIQUE", label: "Conseiller Juridique" },
];

export default function MailEntry() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      return data;
    },
    enabled: !!user,
  });

  // Fetch previous senders for autocomplete
  const { data: previousSenders } = useQuery({
    queryKey: ["previous-senders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mails")
        .select("sender_name, sender_organization, sender_phone, sender_email, sender_address, sender_city, sender_country")
        .order("created_at", { ascending: false })
        .limit(500);
      // Deduplicate by sender_name
      const map = new Map<string, typeof data extends (infer T)[] ? T : never>();
      data?.forEach((d) => {
        if (d.sender_name && !map.has(d.sender_name)) map.set(d.sender_name, d);
      });
      return Array.from(map.values());
    },
    enabled: !!user,
  });

  const [form, setForm] = useState({
    reference_number: "",
    sender_name: "",
    sender_organization: "",
    subject: "",
    reception_date: "",
    mail_type: "",
    mail_type_other: "",
    priority: "normal",
    sender_phone: "",
    sender_email: "",
    sender_address: "",
    sender_city: "",
    sender_country: "République démocratique du Congo",
    deposit_time: "",
    deposit_month: "",
    deposit_year: "",
    addressed_to: "",
    comments: "",
  });

  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState<{ ref: string; data: string } | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [senderSearch, setSenderSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [ministreAbsent, setMinistreAbsent] = useState(false);

  // Filter addressees based on "Ministre Absent" toggle
  const ADDRESSEES = ministreAbsent
    ? ADDRESSEES_FULL.filter(a => a.value !== "MINISTRE")
    : ADDRESSEES_FULL;

  const senderSuggestions = useMemo(() => {
    if (!senderSearch || senderSearch.length < 2 || !previousSenders) return [];
    return previousSenders.filter((s) =>
      s.sender_name?.toLowerCase().includes(senderSearch.toLowerCase())
    ).slice(0, 8);
  }, [senderSearch, previousSenders]);

  const selectSender = (sender: any) => {
    setForm((f) => ({
      ...f,
      sender_name: sender.sender_name || "",
      sender_organization: sender.sender_organization || "",
      sender_phone: sender.sender_phone || "",
      sender_email: sender.sender_email || "",
      sender_address: sender.sender_address || "",
      sender_city: sender.sender_city || "",
      sender_country: sender.sender_country || f.sender_country,
    }));
    setSenderSearch(sender.sender_name || "");
    setShowSuggestions(false);
  };

  const generateRef = () => {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `CR-${d}-${rand}`;
  };

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setFiles((prev) => [...prev, ...Array.from(incoming)]);
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const ref = generateRef();

    // Check for duplicate reference_number (user-entered)
    if (form.reference_number.trim()) {
      const { data: existing } = await supabase
        .from("mails")
        .select("id")
        .eq("reference_number", form.reference_number.trim())
        .limit(1);
      if (existing && existing.length > 0) {
        toast.error("Ce numéro de courrier existe déjà dans le système. Veuillez en choisir un autre.");
        setLoading(false);
        return;
      }
    }

    const qrCodeData = JSON.stringify({ ref, date: new Date().toISOString(), agent: user.id });

    try {
      let attachmentUrl: string | null = null;
      if (files.length > 0) {
        const file = files[0];
        const sanitizedName = file.name
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .replace(/_+/g, "_");
        const filePath = `mail-attachments/${ref.replace(/[^a-zA-Z0-9/_-]/g, "_")}/${Date.now()}_${sanitizedName}`;
        const { error: uploadErr } = await supabase.storage.from("mail-documents").upload(filePath, file);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = await supabase.storage.from("mail-documents").createSignedUrl(filePath, 60 * 60 * 24 * 365);
        attachmentUrl = urlData?.signedUrl || null;
      }

      // Always start at step 2 (Routage Hiérarchique)
      const initialStep = 2;

      // SLA for step 2
      const { data: slaData } = await supabase
        .from("sla_config")
        .select("default_hours")
        .eq("step_number", 2)
        .single();
      const deadlineHours = slaData?.default_hours || 24;
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + deadlineHours);

      // Resolve target user for step 2 based on ministre absent toggle
      const roleMap: Record<string, string> = {
        "DIRECTEUR DE CABINET": "dircab",
        "DIRECTEUR DE CABINET ADJOINT": "dircaba",
        "CONSEILLER JURIDIQUE": "conseiller_juridique",
      };
      let targetUserId: string | null = null;

      if (ministreAbsent) {
        // Ministre absent: find user matching addressed_to role
        const targetRole = roleMap[form.addressed_to];
        if (targetRole) {
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", targetRole as any)
            .limit(1)
            .single();
          targetUserId = roleData?.user_id || null;
        }
      } else {
        // Normal flow: use configured user for step 2
        targetUserId = await resolveWorkflowStepAssignee(2, null);
      }

      // Insert mail at step 2
      const { data: insertedMail, error } = await supabase.from("mails").insert({
        reference_number: ref,
        qr_code_data: qrCodeData,
        sender_name: form.sender_name,
        sender_organization: form.sender_organization || null,
        subject: form.subject,
        description: form.comments || null,
        priority: form.priority as any,
        mail_type: form.mail_type || null,
        registered_by: user.id,
        current_step: initialStep,
        status: "in_progress" as any,
        deadline_at: deadline.toISOString(),
        workflow_started_at: new Date().toISOString(),
        attachment_url: attachmentUrl,
        sender_phone: form.sender_phone || null,
        sender_email: form.sender_email || null,
        sender_address: form.sender_address || null,
        sender_city: form.sender_city || null,
        sender_country: form.sender_country || null,
        reception_date: form.reception_date || null,
        deposit_time: form.deposit_time || null,
        addressed_to: form.addressed_to || null,
        comments: form.comments || null,
        assigned_agent_id: targetUserId,
        ministre_absent: ministreAbsent,
      } as any).select("id").single();

      if (error) throw error;
      if (!insertedMail) throw new Error("Courrier inséré mais ID non récupéré");

      // Create mail_assignment for step 2 assignee
      let routed = false;
      if (targetUserId) {
        const { error: assignErr } = await supabase.from("mail_assignments").insert({
          mail_id: insertedMail.id,
          assigned_by: user.id,
          assigned_to: targetUserId,
          step_number: initialStep,
          instructions: form.comments || null,
          status: "pending",
        });
        if (assignErr) console.error("Erreur assignation:", assignErr.message);

        // Notification
        await supabase.from("notifications").insert({
          user_id: targetUserId,
          title: "Nouveau courrier assigné",
          message: `Un courrier "${form.subject}" (Réf: ${ref}) vous a été adressé pour traitement.`,
          mail_id: insertedMail.id,
        });

        // Workflow transition: reception → step 2
        await supabase.from("workflow_transitions").insert({
          mail_id: insertedMail.id,
          from_step: 1,
          to_step: initialStep,
          action: "approve",
          performed_by: user.id,
          notes: `Routé vers ${form.addressed_to || "étape 2"}${ministreAbsent ? " (Ministre absent)" : ""}`,
        });

        routed = true;
      }

      setQrData({ ref, data: qrCodeData });
      setShowQr(true);
      toast.success(routed ? "Courrier enregistré et routé avec succès" : "Courrier enregistré (routage non effectué — vérifiez les rôles)");
      setForm({
        reference_number: "", sender_name: "", sender_organization: "", subject: "", reception_date: "",
        mail_type: "", mail_type_other: "", priority: "normal", sender_phone: "", sender_email: "",
        sender_address: "", sender_city: "", sender_country: "République démocratique du Congo",
        deposit_time: "", deposit_month: "", deposit_year: "", addressed_to: "", comments: "",
      });
      setSenderSearch("");
      setFiles([]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toLocaleDateString("fr-FR");
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground">« <span className="text-destructive">*</span> » indique les champs nécessaires</p>
        <h1 className="page-header text-center mt-2">Enregistrement du courrier</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Row 1: Numéro courrier & Référence */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Numéro courrier" required hint="Numéro unique attribué au courrier">
                <Input value={generateRef()} disabled className="bg-muted" />
              </Field>
              <Field label="Référence du courrier" required hint="Référence du courrier entrant">
                <Input value={form.reference_number} onChange={(e) => update("reference_number", e.target.value)} placeholder="Référence" required />
              </Field>
            </div>

            {/* Row 2: Expéditeur (autocomplete) & Organisation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Expéditeur" required hint="Tapez pour rechercher un expéditeur existant">
                <div className="relative">
                  <Input
                    value={senderSearch || form.sender_name}
                    onChange={(e) => {
                      setSenderSearch(e.target.value);
                      update("sender_name", e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => senderSearch.length >= 2 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="Nom de l'expéditeur"
                    required
                  />
                  {showSuggestions && senderSuggestions.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                      {senderSuggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={() => selectSender(s)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                        >
                          <span className="font-medium">{s.sender_name}</span>
                          {s.sender_organization && (
                            <span className="text-muted-foreground ml-2">— {s.sender_organization}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              <Field label="Organisation" hint="Organisation / Institution de l'expéditeur">
                <Input value={form.sender_organization} onChange={(e) => update("sender_organization", e.target.value)} placeholder="Organisation" />
              </Field>
            </div>

            {/* Objet */}
            <Field label="Objet" required hint="Objet du courrier">
              <Input value={form.subject} onChange={(e) => update("subject", e.target.value)} placeholder="Objet du courrier" required />
            </Field>

            {/* Row 3: Dates & Type & Priorité */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Date de réception" required>
                <Input type="date" value={form.reception_date} onChange={(e) => update("reception_date", e.target.value)} required />
              </Field>
              <Field label="Date système">
                <Input value={today} disabled className="bg-muted" />
              </Field>
              <Field label="Type de courrier" required hint="Catégorie du courrier">
                <Select value={form.mail_type} onValueChange={(v) => update("mail_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Sélectionnez" /></SelectTrigger>
                  <SelectContent>
                    {MAIL_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priorité">
                <Select value={form.priority} onValueChange={(v) => update("priority", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Basse</SelectItem>
                    <SelectItem value="normal">Normale</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* "Autre" mail type specification */}
            {form.mail_type === "autre" && (
              <Field label="Précisez le type" required>
                <Input value={form.mail_type_other} onChange={(e) => update("mail_type_other", e.target.value)} placeholder="Type de courrier personnalisé" required />
              </Field>
            )}

            {/* Ministre Absent toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
              <div>
                <Label className="text-sm font-semibold">Ministre Absent</Label>
                <p className="text-xs text-muted-foreground">Activer pour router directement vers le DirCab ou autre</p>
              </div>
              <Switch
                checked={ministreAbsent}
                onCheckedChange={(checked) => {
                  setMinistreAbsent(checked);
                  // Reset addressed_to if Ministre was selected
                  if (checked && form.addressed_to === "MINISTRE") {
                    update("addressed_to", "");
                  }
                }}
              />
            </div>

            {/* À qui s'adresse ce courrier */}
            <Field label="À qui s'adresse ce courrier ?" required hint="Destinataire hiérarchique">
              <Select value={form.addressed_to} onValueChange={(v) => update("addressed_to", v)}>
                <SelectTrigger><SelectValue placeholder="Sélectionnez le destinataire" /></SelectTrigger>
                <SelectContent>
                  {ADDRESSEES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Pièce jointe */}
            <Field label="Pièce Jointe" hint="Joindre la version scannée du courrier et/ou tout autre document.">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Déposez les fichiers ici ou</p>
                <Button type="button" variant="default" size="sm" className="mt-2">
                  Sélectionnez des fichiers
                </Button>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              </div>
              {files.length > 0 && (
                <div className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-muted rounded px-3 py-1.5">
                      <span className="truncate flex-1">{f.name}</span>
                      <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Taille max. des fichiers : 50 MB.</p>
            </Field>

            {/* Téléphone & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Téléphone de l'expéditeur">
                <Input type="tel" value={form.sender_phone} onChange={(e) => update("sender_phone", e.target.value)} placeholder="Numéro de téléphone" />
              </Field>
              <Field label="E-mail de l'expéditeur">
                <Input type="email" value={form.sender_email} onChange={(e) => update("sender_email", e.target.value)} placeholder="Adresse e-mail" />
              </Field>
            </div>

            {/* Adresse */}
            <Field label="Adresse de l'expéditeur" hint="Av, Quartier, Commune">
              <Input value={form.sender_address} onChange={(e) => update("sender_address", e.target.value)} placeholder="Adresse complète" />
            </Field>

            {/* Ville & Pays */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Ville">
                <Input value={form.sender_city} onChange={(e) => update("sender_city", e.target.value)} placeholder="Ville" />
              </Field>
              <Field label="Pays">
                <Select value={form.sender_country} onValueChange={(v) => update("sender_country", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Heure, Mois, Année */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Heure de dépôt">
                <Input type="time" value={form.deposit_time} onChange={(e) => update("deposit_time", e.target.value)} />
              </Field>
              <Field label="Mois" required>
                <Select value={form.deposit_month} onValueChange={(v) => update("deposit_month", v)}>
                  <SelectTrigger><SelectValue placeholder="Sélectionnez le mois" /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Année" required>
                <Select value={form.deposit_year} onValueChange={(v) => update("deposit_year", v)}>
                  <SelectTrigger><SelectValue placeholder="Sélectionnez l'année" /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Commentaire */}
            <Field label="Commentaire" required>
              <Textarea
                value={form.comments}
                onChange={(e) => update("comments", e.target.value)}
                placeholder="Commentaire ou résumé du courrier..."
                rows={6}
                required
              />
            </Field>

            {/* Empreinte de l'utilisateur */}
            <Field label="Empreinte de l'utilisateur">
              <Input value={profile?.full_name || user?.email || ""} disabled className="bg-muted" />
            </Field>

            <Button type="submit" className="w-full" disabled={loading}>
              <Send className="h-4 w-4 mr-2" />
              {loading ? "Enregistrement..." : "Enregistrer le courrier"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>QR Code généré</DialogTitle>
          </DialogHeader>
          {qrData && (
            <div className="flex flex-col items-center gap-4 py-4">
              <QRCodeSVG value={qrData.data} size={180} />
              <p className="text-sm font-mono font-medium">{qrData.ref}</p>
              <p className="text-xs text-muted-foreground">
                Enregistré le {new Date().toLocaleString("fr-FR")}
              </p>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimer l'étiquette
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
