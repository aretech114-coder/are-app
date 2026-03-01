import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Sparkles, Paperclip, Clock, FileText, Mail } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { WorkflowActions } from "@/components/WorkflowActions";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { Step4ContextPanel } from "@/components/Step4ContextPanel";
import { TreatmentsList } from "@/components/TreatmentsList";
import { getStepColor, getStepLabel } from "@/lib/workflow-engine";

export default function InboxPage() {
  const { user } = useAuth();
  const [mails, setMails] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [showDoc, setShowDoc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiContent, setAiContent] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    fetchMails();
  }, []);

  const fetchMails = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("mails")
      .select("*")
      .in("status", ["pending", "in_progress"])
      .order("created_at", { ascending: false });
    setMails(data || []);
    setLoading(false);
    // Refresh selected if open
    if (selected) {
      const updated = data?.find(m => m.id === selected.id);
      setSelected(updated || null);
    }
  };

  const markAsRead = async (mail: any) => {
    setSelected(mail);
    setShowTimeline(false);
    if (!mail.is_read) {
      await supabase.from("mails").update({ is_read: true }).eq("id", mail.id);
      setMails((prev) => prev.map((m) => (m.id === mail.id ? { ...m, is_read: true } : m)));
    }
  };

  const filtered = mails.filter(
    (m) =>
      m.subject?.toLowerCase().includes(search.toLowerCase()) ||
      m.sender_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.reference_number?.toLowerCase().includes(search.toLowerCase())
  );

  const priorityColors: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    normal: "bg-info/10 text-info",
    high: "bg-warning/10 text-warning",
    urgent: "bg-destructive/10 text-destructive",
  };

  const isOverdue = (mail: any) => {
    if (!mail.deadline_at) return false;
    return new Date(mail.deadline_at) < new Date();
  };

  return (
    <div className="animate-fade-in h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="page-header">Boîte de Réception</h1>
        <p className="page-description">{filtered.length} courrier(s) à traiter</p>
      </div>

      <div className="flex gap-4 h-[calc(100%-4rem)]">
        {/* Mail List */}
        <div className="w-full lg:w-2/5 flex flex-col border rounded-lg bg-card overflow-hidden">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par objet, expéditeur ou QR..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto scrollbar-thin">
            {loading ? (
              <p className="text-sm text-muted-foreground p-4 text-center">Chargement...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">Aucun courrier</p>
            ) : (
              filtered.map((mail) => (
                <button
                  key={mail.id}
                  onClick={() => markAsRead(mail)}
                  className={`w-full text-left p-4 border-b hover:bg-accent/50 transition-colors ${
                    selected?.id === mail.id ? "bg-accent" : ""
                  } ${!mail.is_read ? "mail-row-unread" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${!mail.is_read ? "font-bold" : ""}`}>
                        {mail.subject}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{mail.sender_name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(mail.created_at), "dd MMM", { locale: fr })}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${priorityColors[mail.priority]}`}>
                        {mail.priority}
                      </span>
                    </div>
                  </div>
                  {/* Workflow step badge */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getStepColor(mail.current_step || 1)}`}>
                      {getStepLabel(mail.current_step || 1)}
                    </span>
                    {isOverdue(mail) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                        En retard
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{mail.reference_number}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Mail Preview */}
        <div className="hidden lg:flex flex-1 border rounded-lg bg-card flex-col overflow-hidden">
          {selected ? (
            <div className="flex flex-col h-full">
              {/* Workflow Stepper */}
              <div className="px-5 pt-4 pb-2 border-b bg-muted/20">
                <WorkflowStepper currentStep={selected.current_step || 1} />
              </div>

              <div className="p-5 border-b">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{selected.subject}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      De: {selected.sender_name} {selected.sender_organization && `— ${selected.sender_organization}`}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(selected.created_at), "dd MMMM yyyy à HH:mm", { locale: fr })}
                      </span>
                      <span className="font-mono">{selected.reference_number}</span>
                      {selected.deadline_at && (
                        <span className={`flex items-center gap-1 ${isOverdue(selected) ? "text-destructive font-medium" : ""}`}>
                          Échéance: {format(new Date(selected.deadline_at), "dd MMM à HH:mm", { locale: fr })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 p-5 overflow-auto space-y-4">
                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <DetailItem label="Type de courrier" value={selected.mail_type || "—"} />
                  <DetailItem label="Priorité" value={selected.priority} />
                  <DetailItem label="Destinataire" value={selected.addressed_to || "—"} />
                  <DetailItem label="Statut" value={selected.status} />
                  {selected.reception_date && (
                    <DetailItem label="Date de réception" value={format(new Date(selected.reception_date), "dd MMMM yyyy", { locale: fr })} />
                  )}
                  {selected.deposit_time && (
                    <DetailItem label="Heure de dépôt" value={selected.deposit_time} />
                  )}
                  {selected.sender_phone && (
                    <DetailItem label="Téléphone" value={selected.sender_phone} />
                  )}
                  {selected.sender_email && (
                    <DetailItem label="Email" value={selected.sender_email} />
                  )}
                  {selected.sender_address && (
                    <DetailItem label="Adresse" value={`${selected.sender_address}${selected.sender_city ? `, ${selected.sender_city}` : ""}${selected.sender_country ? ` — ${selected.sender_country}` : ""}`} />
                  )}
                </div>

                {/* Description / Comments */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Description / Commentaire</h4>
                  <p className="text-sm leading-relaxed bg-muted/30 rounded-lg p-3 whitespace-pre-wrap">
                    {selected.description || selected.comments || "Aucune description disponible."}
                  </p>
                </div>

                {/* Attachment preview button */}
                {selected.attachment_url && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/20">
                    <Paperclip className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm truncate flex-1">Pièce jointe disponible</span>
                    <Button size="sm" variant="default" onClick={() => setShowDoc(true)}>
                      Visualiser
                    </Button>
                  </div>
                )}

                {/* Treatments from workflow transitions */}
                <TreatmentsList mailId={selected.id} />

                {/* Step 4 context: annotations, assignees, meetings, orientations */}
                {(selected.current_step === 4 || selected.current_step === 3 || selected.current_step === 5) && (
                  <Step4ContextPanel mailId={selected.id} />
                )}

                {/* Workflow Timeline toggle */}
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTimeline(!showTimeline)}
                    className="text-xs"
                  >
                    {showTimeline ? "Masquer" : "Voir"} l'historique du workflow
                  </Button>
                  {showTimeline && (
                    <div className="mt-2 p-3 rounded-lg border bg-muted/20">
                      <WorkflowTimeline mailId={selected.id} />
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t flex items-center justify-between gap-2">
                <WorkflowActions
                  mailId={selected.id}
                  currentStep={selected.current_step || 1}
                  onAdvanced={fetchMails}
                />
                <div className="flex gap-2">
                  <Select
                    onValueChange={async (type) => {
                      if (!selected) return;
                      setAiLoading(true);
                      setAiContent("");
                      setShowAiDialog(true);
                      try {
                        const { data, error } = await supabase.functions.invoke("ai-assistant", {
                          body: { type, subject: selected.subject, description: selected.description, senderName: selected.sender_name, attachmentUrl: selected.attachment_url },
                        });
                        if (error) throw error;
                        setAiContent(data.content || "Aucune réponse.");
                      } catch (e: any) {
                        setAiContent("Erreur: " + (e.message || "Impossible de générer"));
                      } finally {
                        setAiLoading(false);
                      }
                    }}
                  >
                    <SelectTrigger className="w-auto h-9 text-xs gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <SelectValue placeholder="Assistant IA" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="note_technique"><FileText className="h-3 w-3 inline mr-1" />Note Technique</SelectItem>
                      <SelectItem value="accuse_reception"><Mail className="h-3 w-3 inline mr-1" />Accusé de Réception</SelectItem>
                      <SelectItem value="resume"><Sparkles className="h-3 w-3 inline mr-1" />Résumé</SelectItem>
                    </SelectContent>
                  </Select>
                  {selected.attachment_url && (
                    <Button size="sm" variant="outline" onClick={() => setShowDoc(true)}>
                      <Paperclip className="h-4 w-4 mr-2" />
                      Document
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p className="text-sm">Sélectionnez un courrier pour afficher les détails</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Assistant IA
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-[200px]">
            {aiLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mr-3" />
                Génération en cours...
              </div>
            ) : (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">{aiContent}</div>
            )}
          </div>
          {!aiLoading && aiContent && (
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => {
                navigator.clipboard.writeText(aiContent);
                toast.success("Copié dans le presse-papiers");
              }}>
                Copier
              </Button>
              {selected && (
                <Button size="sm" onClick={async () => {
                  const { error } = await supabase.from("mails").update({ ai_draft: aiContent } as any).eq("id", selected.id);
                  if (error) toast.error(error.message);
                  else { toast.success("Brouillon IA sauvegardé"); fetchMails(); }
                }}>
                  Sauvegarder comme brouillon
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDoc} onOpenChange={setShowDoc}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Pièce jointe
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-[500px] flex flex-col">
            {selected?.attachment_url ? (
              selected.attachment_url.match(/\.pdf/i) ? (
                <div className="flex flex-col flex-1 gap-2">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={selected.attachment_url} target="_blank" rel="noopener noreferrer">
                        Ouvrir dans un nouvel onglet
                      </a>
                    </Button>
                  </div>
                  <iframe
                    src={`https://docs.google.com/gview?url=${encodeURIComponent(selected.attachment_url)}&embedded=true`}
                    className="w-full flex-1 min-h-[500px] rounded border"
                    title="Document PDF"
                  />
                </div>
              ) : selected.attachment_url.match(/\.(jpe?g|png|gif|webp)/i) ? (
                <img
                  src={selected.attachment_url}
                  alt="Pièce jointe"
                  className="max-w-full max-h-[500px] object-contain mx-auto rounded"
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                  <FileText className="h-12 w-12" />
                  <p className="text-sm">Ce type de fichier ne peut pas être prévisualisé directement.</p>
                  <Button asChild variant="default">
                    <a href={selected.attachment_url} target="_blank" rel="noopener noreferrer">
                      Télécharger le fichier
                    </a>
                  </Button>
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Aucune pièce jointe</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium capitalize">{value}</p>
    </div>
  );
}
