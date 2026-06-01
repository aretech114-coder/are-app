import { Badge } from "@/components/ui/badge";
import { MailContribution } from "@/hooks/useMailContributions";
import { FileText, User } from "lucide-react";
import { AttachmentViewer } from "@/components/AttachmentViewer";

interface Props {
  contributions: MailContribution[];
  title?: string;
  showDrafts?: boolean;
}

export function MailContributionsPanel({
  contributions,
  title = "Contributions au traitement",
  showDrafts = true,
}: Props) {
  const visible = contributions.filter((c) => showDrafts || c.status === "submitted");
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <FileText className="h-4 w-4" />
        {title}
      </h4>
      {visible.map((c) => (
        <div key={c.id} className="p-3 rounded-md border bg-background space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              {c.profile?.full_name || c.profile?.email || "Utilisateur"}
            </span>
            <Badge variant={c.status === "submitted" ? "default" : "outline"} className="text-[10px]">
              {c.status === "submitted" ? "Soumis" : "Brouillon"}
            </Badge>
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
