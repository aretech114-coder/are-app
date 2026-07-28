import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileCheck, FileWarning, Download, Upload } from "lucide-react";
import { useAccuseReceptionDocument } from "@/hooks/useMailWorkflowDocuments";
import { AttachmentDownloadButton } from "@/components/AttachmentDownloadButton";

interface Props {
  mailId: string;
  currentStep: number;
  canUpload?: boolean;
  onRequestUpload?: () => void;
  showUploadHint?: boolean;
}

export function ClosureDocumentPanel({
  mailId,
  currentStep,
  canUpload = false,
  onRequestUpload,
  showUploadHint = false,
}: Props) {
  const { document, documents, hasAccuse, signedUrls, isLoading } = useAccuseReceptionDocument(mailId);

  if (currentStep < 8) return null;

  return (
    <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          {hasAccuse ? (
            <FileCheck className="h-4 w-4 text-emerald-600" />
          ) : (
            <FileWarning className="h-4 w-4 text-amber-600" />
          )}
          Accusé de réception du courrier sortant
        </h4>
        <Badge variant={hasAccuse ? "default" : "secondary"} className="text-[10px]">
          {hasAccuse
            ? document?.step_number === 8
              ? "Déposé à l'étape secrétariat"
              : "Déposé à l'archivage"
            : currentStep === 9
              ? "Requis pour archiver"
              : "Optionnel à l'étape secrétariat"}
        </Badge>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Chargement…</p>
      ) : hasAccuse && document ? (
        <div className="space-y-2">
          {documents.map((doc, index) => {
            const signedUrl = signedUrls.find((item) => item.id === doc.id)?.url;
            return (
              <div key={doc.id} className="flex items-center justify-between gap-2 flex-wrap text-sm">
                <span className="text-muted-foreground truncate">
                  {documents.length > 1 ? `${index + 1}. ` : ""}
                  {doc.file_name || doc.storage_path.split("/").pop()}
                </span>
                {signedUrl && (
                  <AttachmentDownloadButton url={signedUrl} fileName={doc.file_name || "accuse_reception.pdf"} />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {currentStep === 9
            ? "Joignez le scan ou la copie signée de l'accusé de réception du courrier de réponse avant d'archiver."
            : "Vous pouvez joindre l'accusé dès maintenant ou le laisser à l'archiviste à l'étape 9."}
        </p>
      )}

      {canUpload && onRequestUpload && (!hasAccuse || showUploadHint) && (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={onRequestUpload}>
            <Upload className="h-3.5 w-3.5 mr-1" />
            {hasAccuse ? "Joindre un autre accusé" : "Joindre un fichier..."}
          </Button>
        </div>
      )}
    </div>
  );
}
