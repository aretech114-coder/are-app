import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Paperclip, FileText, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { WorkflowActions } from "@/components/WorkflowActions";
import { getStepColor, getStepLabel, listMyMails } from "@/lib/workflow-engine";
import { getMailAttachmentUrls } from "@/lib/labels";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { RecoverMailButton } from "@/components/RecoverMailButton";
import { useMailContributions, useStepAssigneeCount } from "@/hooks/useMailContributions";
import { MailDossierView } from "@/components/MailDossierView";
import { MailAiAssistant, MailAttachmentDocButton } from "@/components/MailAiAssistant";
import { useMailCircuitLabel } from "@/hooks/useMailCircuitLabel";
import { isDgRole } from "@/lib/workflow-display";
import { MailInboxFilters, INBOX_QUICK_FILTER_LABELS } from "@/components/MailInboxFilters";
import {
  filterInboxMails,
  isMailOverdue,
  type InboxQuickFilter,
  type InboxSortOrder,
} from "@/lib/mail-inbox-filters";
import { useActiveWorkflowSteps } from "@/hooks/useWorkflowSteps";

export default function InboxPage() {
  const { user, role } = useAuth();
  const isMobile = useIsMobile();
  const { data: activeSteps = [] } = useActiveWorkflowSteps();
  const [mails, setMails] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<InboxQuickFilter>("new");
  const [stepFilter, setStepFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<InboxSortOrder>("recent");
  const [showDoc, setShowDoc] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMails();
  }, []);

  const fetchMails = async () => {
    setLoading(true);
    let data: any[] = [];
    try {
      data = await listMyMails(["pending", "in_progress", "processed", "archived"]);
      setMails(data || []);
    } catch (error: any) {
      console.error("Erreur fetch mails:", error?.message);
      toast.error("Erreur chargement courriers: " + (error?.message || "inconnue"));
      setMails([]);
    }
    setLoading(false);
    if (selected) {
      const updated = data.find((m) => m.id === selected.id);
      setSelected(updated || null);
    }
  };

  const { contributions } = useMailContributions(selected?.id, 4);
  const step4AssigneeCount = useStepAssigneeCount(selected?.id, 4);
  const showContributionsPanel = isDgRole(role) && (selected?.current_step || 0) >= 2;
  const { data: circuitLabel } = useMailCircuitLabel(selected?.target_service_id);

  const filtered = useMemo(
    () =>
      filterInboxMails(mails, {
        quickFilter,
        stepFilter,
        search,
        sortOrder,
      }),
    [mails, quickFilter, stepFilter, search, sortOrder]
  );

  const markAsRead = async (mail: any) => {
    setSelected(mail);
    if (!mail.is_read) {
      await supabase.from("mails").update({ is_read: true }).eq("id", mail.id);
      setMails((prev) => prev.map((m) => (m.id === mail.id ? { ...m, is_read: true } : m)));
    }
  };

  const priorityColors: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    normal: "bg-info/10 text-info",
    high: "bg-warning/10 text-warning",
    urgent: "bg-destructive/10 text-destructive",
  };

  const subtitle =
    quickFilter === "all"
      ? `${filtered.length} courrier(s)`
      : `${filtered.length} courrier(s) — ${INBOX_QUICK_FILTER_LABELS[quickFilter]}`;

  const renderDocDialog = () => {
    const docUrls = selected ? getMailAttachmentUrls(selected) : [];
    const primaryUrl = docUrls[0] ?? null;

    return (
      <Dialog open={showDoc} onOpenChange={setShowDoc}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              {docUrls.length > 1 ? `Pièces jointes (${docUrls.length})` : "Pièce jointe"}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-[300px] md:min-h-[500px] flex flex-col">
            {primaryUrl ? (
              docUrls.length > 1 ? (
                <AttachmentViewer mail={selected} />
              ) : primaryUrl.match(/\.pdf/i) ? (
                <div className="flex flex-col flex-1 gap-2">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={primaryUrl} target="_blank" rel="noopener noreferrer">
                        Ouvrir dans un nouvel onglet
                      </a>
                    </Button>
                  </div>
                  <iframe
                    src={`https://docs.google.com/gview?url=${encodeURIComponent(primaryUrl)}&embedded=true`}
                    className="w-full flex-1 min-h-[300px] md:min-h-[500px] rounded border"
                    title="Document PDF"
                  />
                </div>
              ) : primaryUrl.match(/\.(jpe?g|png|gif|webp)/i) ? (
                <img
                  src={primaryUrl}
                  alt="Pièce jointe"
                  className="max-w-full max-h-[400px] md:max-h-[500px] object-contain mx-auto rounded"
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                  <FileText className="h-12 w-12" />
                  <p className="text-sm">Ce type de fichier ne peut pas être prévisualisé directement.</p>
                  <Button asChild variant="default">
                    <a href={primaryUrl} target="_blank" rel="noopener noreferrer">
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
    );
  };

  const renderActionsFooter = (mail: any) => (
    <div className="p-3 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0 bg-card">
      <WorkflowActions mailId={mail.id} currentStep={mail.current_step || 1} onAdvanced={fetchMails} />
      <div className="flex gap-2 flex-wrap items-center justify-end">
        <RecoverMailButton
          mailId={mail.id}
          currentStep={mail.current_step || 1}
          deadlineAt={mail.deadline_at}
          onRecovered={fetchMails}
        />
        <MailAiAssistant mail={mail} onDraftSaved={fetchMails} />
        <MailAttachmentDocButton mail={mail} onOpen={() => setShowDoc(true)} />
      </div>
    </div>
  );

  if (isMobile && selected) {
    return (
      <div className="animate-fade-in flex flex-col h-[calc(100vh-7.5rem)]">
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold truncate flex-1">{selected.subject}</h1>
        </div>
        <div className="flex flex-col flex-1 min-h-0 border rounded-lg overflow-hidden bg-card">
          <MailDossierView
            mail={selected}
            role={role}
            circuitLabel={circuitLabel ?? null}
            showContributionsPanel={showContributionsPanel}
            contributions={contributions}
            step4AssigneeCount={step4AssigneeCount}
            onViewAttachments={() => setShowDoc(true)}
            defaultStepperCollapsed
          />
          {renderActionsFooter(selected)}
        </div>
        {renderDocDialog()}
      </div>
    );
  }

  return (
    <div className="animate-fade-in h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="page-header">Boîte de Réception</h1>
        <p className="page-description">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,36%)_1fr] gap-4 h-[calc(100%-4rem)]">
        <div className="flex flex-col border rounded-lg bg-card overflow-hidden min-h-[280px] lg:min-h-0">
          <div className="p-3 border-b space-y-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par objet, expéditeur ou référence..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <MailInboxFilters
              mails={mails}
              quickFilter={quickFilter}
              onQuickFilterChange={setQuickFilter}
              stepFilter={stepFilter}
              onStepFilterChange={setStepFilter}
              sortOrder={sortOrder}
              onSortOrderChange={setSortOrder}
              activeSteps={activeSteps}
            />
          </div>
          <div className="flex-1 overflow-auto scrollbar-thin min-h-0">
            {loading ? (
              <p className="text-sm text-muted-foreground p-4 text-center">Chargement...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">Aucun courrier</p>
            ) : (
              filtered.map((mail) => (
                <button
                  key={mail.id}
                  type="button"
                  onClick={() => markAsRead(mail)}
                  className={`w-full text-left p-4 border-b hover:bg-accent/50 transition-colors ${
                    selected?.id === mail.id ? "bg-accent" : ""
                  } ${!mail.is_read ? "mail-row-unread" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${!mail.is_read ? "font-bold" : ""}`}>{mail.subject}</p>
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
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${getStepColor(mail.current_step || 1)}`}
                    >
                      {getStepLabel(mail.current_step || 1)}
                    </span>
                    {isMailOverdue(mail) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                        En retard
                      </span>
                    )}
                    {!mail.is_read && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                        Nouveau
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{mail.reference_number}</p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="hidden lg:flex flex-col border rounded-lg bg-card overflow-hidden min-h-0">
          {selected ? (
            <>
              <MailDossierView
                mail={selected}
                role={role}
                circuitLabel={circuitLabel ?? null}
                showContributionsPanel={showContributionsPanel}
                contributions={contributions}
                step4AssigneeCount={step4AssigneeCount}
                onViewAttachments={() => setShowDoc(true)}
                defaultStepperCollapsed
              />
              {renderActionsFooter(selected)}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p className="text-sm">Sélectionnez un courrier pour afficher les détails</p>
            </div>
          )}
        </div>
      </div>

      {renderDocDialog()}
    </div>
  );
}
