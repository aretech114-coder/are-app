import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MailDossierView } from "@/components/MailDossierView";
import { useMailContributions, useStepAssigneeCount } from "@/hooks/useMailContributions";
import { useMailCircuitLabel } from "@/hooks/useMailCircuitLabel";
import { useAuth } from "@/hooks/useAuth";
import { getMailAttachmentUrls } from "@/lib/labels";
import { AttachmentDownloadButton, downloadAttachmentItem } from "@/components/AttachmentDownloadButton";
import { toast } from "sonner";

interface MailArchiveDialogProps {
  mail: { id: string; reference_number?: string | null; target_service_id?: string | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles?: { id: string; full_name: string | null; email?: string | null }[];
  allowDownload?: boolean;
}

export function MailArchiveDialog({
  mail,
  open,
  onOpenChange,
  profiles: profilesProp,
  allowDownload = true,
}: MailArchiveDialogProps) {
  const { role } = useAuth();
  const [profiles, setProfiles] = useState(profilesProp ?? []);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const mailId = mail?.id;
  const { contributions } = useMailContributions(mailId, 4);
  const step4AssigneeCount = useStepAssigneeCount(mailId, 4);
  const { data: circuitLabel } = useMailCircuitLabel(mail?.target_service_id);

  useEffect(() => {
    if (profilesProp?.length) {
      setProfiles(profilesProp);
      return;
    }
    if (!open) return;
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .then(({ data }) => setProfiles(data ?? []));
  }, [open, profilesProp]);

  const getProfileName = (id: string) =>
    profiles.find((p) => p.id === id)?.full_name || profiles.find((p) => p.id === id)?.email || "—";

  const attachmentItems = useMemo(() => {
    if (!mail || !("attachment_urls" in mail)) return [];
    const items: { url: string; name?: string; bucket?: string; path?: string }[] = [];
    const urls = getMailAttachmentUrls(mail as Parameters<typeof getMailAttachmentUrls>[0]);
    const metas = (mail as { attachment_urls?: { url: string; name?: string; bucket?: string; path?: string }[] })
      .attachment_urls;
    if (Array.isArray(metas)) {
      for (const m of metas) {
        if (m.url) items.push({ url: m.url, name: m.name, bucket: m.bucket, path: m.path });
      }
    } else {
      urls.forEach((url, i) => items.push({ url, name: `piece-jointe-${i + 1}` }));
    }
    for (const c of contributions) {
      for (const a of c.attachment_urls ?? []) {
        if (a.url) {
          items.push({
            url: a.url,
            name: a.name,
            bucket: (a as { bucket?: string }).bucket,
            path: (a as { path?: string }).path,
          });
        }
      }
    }
    return items;
  }, [mail, contributions]);

  const downloadAll = async () => {
    if (attachmentItems.length === 0) {
      toast.info("Aucune pièce jointe à télécharger");
      return;
    }
    setBulkDownloading(true);
    try {
      for (const item of attachmentItems) {
        await downloadAttachmentItem(item);
        await new Promise((r) => setTimeout(r, 400));
      }
      toast.success(`${attachmentItems.length} fichier(s) téléchargé(s)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur de téléchargement";
      toast.error(message);
    } finally {
      setBulkDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Eye className="h-5 w-5" />
            Dossier archivé — {mail?.reference_number}
            <Badge variant="secondary" className="text-xs font-normal">
              Lecture seule
            </Badge>
            {allowDownload && attachmentItems.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={bulkDownloading}
                onClick={downloadAll}
              >
                {bulkDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                Télécharger les PJ ({attachmentItems.length})
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        {mail && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <MailDossierView
              mail={mail}
              role={role}
              getProfileName={getProfileName}
              circuitLabel={circuitLabel ?? null}
              showContributionsPanel
              contributions={contributions}
              step4AssigneeCount={step4AssigneeCount}
              defaultStepperCollapsed={false}
              defaultTimelineOpen
              allowAttachmentDownload={allowDownload}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
