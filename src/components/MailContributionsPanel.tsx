import { Badge } from "@/components/ui/badge";
import { MailContribution } from "@/hooks/useMailContributions";
import { FileText, User, Clock } from "lucide-react";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Props {
  contributions: MailContribution[];
  title?: string;
  showDrafts?: boolean;
  assigneeCount?: number;
}

export function MailContributionsPanel({
  contributions,
  title = "Contributions au traitement",
  showDrafts = true,
  assigneeCount,
}: Props) {
  const visible = contributions.filter((c) => showDrafts || c.status === "submitted");
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
            <AttachmentViewer urls={c.attachment_urls.map((a) => a.url)} inline />
          )}
        </div>
      ))}
    </div>
  );
}
