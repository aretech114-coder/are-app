import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Sparkles, Paperclip, Clock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { WorkflowActions } from "@/components/WorkflowActions";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { getStepColor, getStepLabel } from "@/lib/workflow-engine";

export default function InboxPage() {
  const { user } = useAuth();
  const [mails, setMails] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [showDoc, setShowDoc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTimeline, setShowTimeline] = useState(false);

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

              <div className="flex-1 p-5 overflow-auto">
                <p className="text-sm leading-relaxed">{selected.description || "Aucune description disponible."}</p>
                {selected.ai_draft && (
                  <div className="mt-4 p-4 rounded-lg bg-accent border">
                    <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Proposition IA
                    </h4>
                    <p className="text-sm">{selected.ai_draft}</p>
                  </div>
                )}

                {/* Workflow Timeline toggle */}
                <div className="mt-4">
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
                  <Button size="sm" variant="outline" onClick={() => toast.info("Assistant IA bientôt disponible")}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    IA
                  </Button>
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

      <Dialog open={showDoc} onOpenChange={setShowDoc}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Aperçu du document</DialogTitle>
          </DialogHeader>
          <div className="min-h-[400px] flex items-center justify-center text-muted-foreground">
            <p className="text-sm">Aperçu du document (simulation)</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
