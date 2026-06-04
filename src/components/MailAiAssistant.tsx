import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, FileText, Mail, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getMailAttachmentUrls } from "@/lib/labels";
import { getAiOptionsForStep, AI_OPTIONS_RECEPTION } from "@/lib/workflow-display";
import { buildWorkflowHistoryText } from "@/lib/ai-assistant-client";

interface MailAiAssistantProps {
  mail: any;
  onDraftSaved?: () => void;
}

export interface RegistrationAiContext {
  subject: string;
  description?: string;
  senderName?: string;
  attachmentUrl?: string;
}

interface RegistrationAiAssistantProps {
  context: RegistrationAiContext;
  onApplyToComments?: (text: string) => void;
}

export function RegistrationAiAssistant({ context, onApplyToComments }: RegistrationAiAssistantProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const options = AI_OPTIONS_RECEPTION;

  const runAi = async (type: string) => {
    if (!context.subject.trim()) {
      toast.error("Renseignez l'objet du courrier avant d'utiliser l'assistant IA.");
      return;
    }
    setLoading(true);
    setContent("");
    setShowDialog(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          type,
          contextStep: 1,
          subject: context.subject,
          description: context.description,
          senderName: context.senderName,
          attachmentUrl: context.attachmentUrl,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setContent(data.content || "Aucune réponse.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Impossible de générer";
      setContent(`Erreur : ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Select onValueChange={runAi}>
        <SelectTrigger className="w-auto h-9 text-xs gap-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <SelectValue placeholder="Assistant IA (réception)" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.value === "accuse_reception" && <Mail className="h-3 w-3 inline mr-1" />}
              {opt.value === "resume" && <Sparkles className="h-3 w-3 inline mr-1" />}
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Assistant IA — réception
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mr-3" />
                Génération en cours...
              </div>
            ) : (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">{content}</div>
            )}
          </div>
          {!loading && content && !content.startsWith("Erreur") && (
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(content);
                  toast.success("Copié dans le presse-papiers");
                }}
              >
                Copier
              </Button>
              {onApplyToComments && (
                <Button size="sm" onClick={() => onApplyToComments(content)}>
                  Insérer dans RAS / notes
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MailAiAssistant({ mail, onDraftSaved }: MailAiAssistantProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const options = getAiOptionsForStep(mail.current_step || 1);

  const runAi = async (type: string) => {
    setLoading(true);
    setContent("");
    setShowDialog(true);
    try {
      const workflowHistory = await buildWorkflowHistoryText(mail.id);
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          type,
          contextStep: mail.current_step,
          subject: mail.subject,
          description: mail.description || mail.comments,
          senderName: mail.sender_name,
          attachmentUrl: getMailAttachmentUrls(mail)[0],
          workflowHistory,
          aiDraft: mail.ai_draft,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setContent(data.content || "Aucune réponse.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Impossible de générer";
      setContent(`Erreur : ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Select onValueChange={runAi}>
        <SelectTrigger className="w-auto h-9 text-xs gap-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <SelectValue placeholder="Assistant IA" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.value === "note_technique" && <FileText className="h-3 w-3 inline mr-1" />}
              {opt.value === "accuse_reception" && <Mail className="h-3 w-3 inline mr-1" />}
              {opt.value === "resume" && <Sparkles className="h-3 w-3 inline mr-1" />}
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Assistant IA
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mr-3" />
                Génération en cours...
              </div>
            ) : (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">{content}</div>
            )}
          </div>
          {!loading && content && !content.startsWith("Erreur") && (
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(content);
                  toast.success("Copié dans le presse-papiers");
                }}
              >
                Copier
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  const { error } = await supabase
                    .from("mails")
                    .update({ ai_draft: content } as any)
                    .eq("id", mail.id);
                  if (error) toast.error(error.message);
                  else {
                    toast.success("Brouillon IA sauvegardé");
                    onDraftSaved?.();
                  }
                }}
              >
                Sauvegarder comme brouillon
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MailAttachmentDocButton({
  mail,
  onOpen,
}: {
  mail: any;
  onOpen: () => void;
}) {
  if (getMailAttachmentUrls(mail).length === 0) return null;
  return (
    <Button size="sm" variant="outline" onClick={onOpen}>
      <Paperclip className="h-4 w-4 mr-2" />
      Document
    </Button>
  );
}
