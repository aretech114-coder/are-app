import { useState } from "react";
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

export function AttachmentViewer({ url, inline }: AttachmentViewerProps) {
  const [open, setOpen] = useState(false);

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
        {!inline && "Voir pièce jointe"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Pièce jointe
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-[500px] flex flex-col">
            {isPDF(url) ? (
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
            ) : isImage(url) ? (
              <img
                src={url}
                alt="Pièce jointe"
                className="max-w-full max-h-[500px] object-contain mx-auto rounded"
              />
            ) : (
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
