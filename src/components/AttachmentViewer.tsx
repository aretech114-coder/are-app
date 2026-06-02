import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Paperclip, FileText, Download, ExternalLink, Loader2 } from "lucide-react";
import { getMailAttachmentUrls, type MailAttachmentMeta } from "@/lib/labels";
import { resolveAttachmentUrls } from "@/lib/mail-storage";

interface AttachmentViewerProps {
  url?: string | null;
  urls?: string[];
  mail?: {
    attachment_url?: string | null;
    attachment_urls?: MailAttachmentMeta[] | null;
  };
  /** Render just the trigger button (inline mode) */
  inline?: boolean;
}

function isPDF(url: string) {
  return /\.pdf/i.test(url);
}

function isImage(url: string) {
  return /\.(jpe?g|png|gif|webp)/i.test(url);
}

/** Parse legacy url prop when stored as JSON array string */
function parseUrlsFromString(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr.filter((u) => typeof u === "string");
    } catch {
      /* fallthrough */
    }
  }
  return [trimmed];
}

function resolveUrls(props: AttachmentViewerProps): string[] {
  if (props.urls?.length) return props.urls;
  if (props.mail) return getMailAttachmentUrls(props.mail as any);
  if (props.url) return parseUrlsFromString(props.url);
  return [];
}

function hasRefreshableMeta(mail?: AttachmentViewerProps["mail"]): boolean {
  return (
    Array.isArray(mail?.attachment_urls) &&
    mail.attachment_urls.some((a) => a.bucket && a.path)
  );
}

function AttachmentPreview({ url }: { url: string }) {
  if (isPDF(url)) {
    return (
      <div className="flex flex-col flex-1 gap-2">
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Ouvrir dans un nouvel onglet
            </a>
          </Button>
        </div>
        <iframe
          src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
          className="w-full flex-1 min-h-[500px] rounded border"
          title="Document PDF"
        />
      </div>
    );
  }

  if (isImage(url)) {
    return (
      <img
        src={url}
        alt="Pièce jointe"
        className="max-w-full max-h-[500px] object-contain mx-auto rounded"
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
      <FileText className="h-12 w-12" />
      <p className="text-sm">Ce type de fichier ne peut pas être prévisualisé directement.</p>
      <Button asChild variant="default">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <Download className="h-4 w-4 mr-1" />
          Télécharger le fichier
        </a>
      </Button>
    </div>
  );
}

export function AttachmentViewer({ url, urls, mail, inline }: AttachmentViewerProps) {
  const fallbackUrls = resolveUrls({ url, urls, mail });
  const [displayUrls, setDisplayUrls] = useState<string[]>(fallbackUrls);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setDisplayUrls(fallbackUrls);
  }, [fallbackUrls.join("|")]);

  useEffect(() => {
    if (!open || !mail?.attachment_urls?.length || !hasRefreshableMeta(mail)) return;

    let cancelled = false;
    setRefreshing(true);
    resolveAttachmentUrls(mail.attachment_urls)
      .then((fresh) => {
        if (!cancelled && fresh.length > 0) setDisplayUrls(fresh);
      })
      .catch(() => {
        /* keep fallback urls */
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mail?.attachment_urls]);

  if (fallbackUrls.length === 0 && displayUrls.length === 0) return null;

  const allUrls = displayUrls.length > 0 ? displayUrls : fallbackUrls;
  const activeUrl = allUrls[activeIndex] ?? allUrls[0];
  const label = allUrls.length > 1 ? `Voir pièces jointes (${allUrls.length})` : "Voir pièce jointe";

  return (
    <>
      <Button
        variant={inline ? "ghost" : "outline"}
        size="sm"
        className="gap-1.5"
        onClick={(e) => {
          e.stopPropagation();
          setActiveIndex(0);
          setOpen(true);
        }}
      >
        <Paperclip className="h-3.5 w-3.5" />
        {!inline && label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              {allUrls.length > 1 ? `Pièces jointes (${allUrls.length})` : "Pièce jointe"}
            </DialogTitle>
          </DialogHeader>
          {allUrls.length > 1 && (
            <div className="flex flex-wrap gap-2 pb-2 border-b">
              {allUrls.map((_, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant={i === activeIndex ? "default" : "outline"}
                  onClick={() => setActiveIndex(i)}
                >
                  Fichier {i + 1}
                </Button>
              ))}
            </div>
          )}
          <div className="min-h-[500px] flex flex-col">
            {refreshing ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Chargement…
              </div>
            ) : (
              <AttachmentPreview url={activeUrl} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AttachmentIndicator({ hasAttachment }: { hasAttachment: boolean }) {
  if (!hasAttachment) return null;
  return (
    <span title="Pièce(s) jointe(s)" className="inline-flex text-muted-foreground">
      <Paperclip className="h-3.5 w-3.5" />
    </span>
  );
}
