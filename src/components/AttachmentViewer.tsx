import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Paperclip, FileText, Download, ExternalLink } from "lucide-react";

interface AttachmentViewerProps {
  url: string | null | undefined;
  /** Render just the trigger button (inline mode) */
  inline?: boolean;
}

function isPDF(url: string) {
  return /\.pdf/i.test(url);
}

function isImage(url: string) {
  return /\.(jpe?g|png|gif|webp)/i.test(url);
}

function parseUrls(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr.filter((u) => typeof u === "string");
    } catch { /* fallthrough */ }
  }
  return [trimmed];
}

export function AttachmentViewer({ url, inline }: AttachmentViewerProps) {
  const [open, setOpen] = useState(false);
  const urls = useMemo(() => (url ? parseUrls(url) : []), [url]);
  const [activeIdx, setActiveIdx] = useState(0);
  const active = urls[activeIdx] || urls[0] || "";

  if (!url) return null;

  return (
    <>
      <Button
        variant={inline ? "ghost" : "outline"}
        size="sm"
        className="gap-1.5"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Paperclip className="h-3.5 w-3.5" />
        {!inline && (urls.length > 1 ? `Voir pièces jointes (${urls.length})` : "Voir pièce jointe")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              {urls.length > 1 ? `Pièces jointes (${urls.length})` : "Pièce jointe"}
            </DialogTitle>
          </DialogHeader>
          {urls.length > 1 && (
            <div className="flex flex-wrap gap-1.5 pb-2 border-b">
              {urls.map((u, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant={i === activeIdx ? "default" : "outline"}
                  onClick={() => setActiveIdx(i)}
                >
                  Pièce {i + 1}
                </Button>
              ))}
            </div>
          )}
          <div className="min-h-[500px] flex flex-col">
            {isPDF(active) ? (
              <div className="flex flex-col flex-1 gap-2">
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <a href={active} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Ouvrir dans un nouvel onglet
                    </a>
                  </Button>
                </div>
                <iframe
                  src={`https://docs.google.com/gview?url=${encodeURIComponent(active)}&embedded=true`}
                  className="w-full flex-1 min-h-[500px] rounded border"
                  title="Document PDF"
                />
              </div>
            ) : isImage(active) ? (
              <img
                src={active}
                alt="Pièce jointe"
                className="max-w-full max-h-[500px] object-contain mx-auto rounded"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <FileText className="h-12 w-12" />
                <p className="text-sm">Ce type de fichier ne peut pas être prévisualisé directement.</p>
                <Button asChild variant="default">
                  <a href={active} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-1" />
                    Télécharger le fichier
                  </a>
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Compact paperclip indicator for table rows */
export function AttachmentIndicator({ hasAttachment }: { hasAttachment: boolean }) {
  if (!hasAttachment) return null;
  return <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />;
}
