import { Badge } from "@/components/ui/badge";
import { MailContribution } from "@/hooks/useMailContributions";
import { filterVisibleContributions } from "@/lib/workflow-display";
import { FileText, User, Clock } from "lucide-react";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { AttachmentDownloadButton } from "@/components/AttachmentDownloadButton";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Props {
  contributions: MailContribution[];
  title?: string;
  /** @deprecated Préférer showAllDrafts + currentUserId */
  showDrafts?: boolean;
  /** DG : voir tous les brouillons ; collaborateurs : soumis de tous + brouillon perso */
  showAllDrafts?: boolean;
  currentUserId?: string | null;
  assigneeCount?: number;
  allowDownload?: boolean;
}

export function MailContributionsPanel({
  contributions,
  title = "Contributions au traitement",
  showDrafts,
  showAllDrafts: showAllDraftsProp,
  currentUserId,
  assigneeCount,
  allowDownload = false,
}: Props) {
  const showAllDrafts = showAllDraftsProp ?? showDrafts ?? false;
  const visible = filterVisibleContributions(contributions, { showAllDrafts, currentUserId });
  const submittedCount = contributions.filter((c) => c.status === "submitted").length;

  if (visible.length === 0 && !assigneeCount) return null;

  return (
    <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {title}
        </h4>
        {assigneeCount != null && assigneeCount > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {submittedCount} / {assigneeCount} contribution(s)
          </Badge>
        )}
      </div>

      {visible.length === 0 && assigneeCount != null && assigneeCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Aucune contribution soumise pour le moment — {assigneeCount} personne(s) assignée(s).
        </p>
      )}

      {visible.map((c) => (
        <div key={c.id} className="p-3 rounded-md border bg-background space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              {c.profile?.full_name || c.profile?.email || "Utilisateur"}
            </span>
            <div className="flex items-center gap-2">
              {c.processed_at && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(c.processed_at), "dd/MM/yyyy HH:mm", { locale: fr })}
                </span>
              )}
              <Badge variant={c.status === "submitted" ? "default" : "outline"} className="text-[10px]">
                {c.status === "submitted" ? "Soumis" : "Brouillon"}
              </Badge>
            </div>
          </div>
          {c.body && (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{c.body}</p>
          )}
          {c.attachment_urls && c.attachment_urls.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <AttachmentViewer
                urls={c.attachment_urls.map((a) => a.url).filter(Boolean)}
                mail={{
                  attachment_urls: c.attachment_urls.map((a) => ({
                    url: a.url,
                    name: a.name,
                    path: (a as { path?: string }).path,
                    bucket: (a as { bucket?: string }).bucket,
                  })),
                }}
                inline
              />
              {allowDownload &&
                c.attachment_urls.map((a, i) => (
                  <AttachmentDownloadButton
                    key={i}
                    url={a.url}
                    name={a.name}
                    bucket={(a as { bucket?: string }).bucket}
                    path={(a as { path?: string }).path}
                    variant="ghost"
                    size="icon"
                  />
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
