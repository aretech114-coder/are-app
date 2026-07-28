import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Paperclip, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { AttachmentDownloadButton } from "@/components/AttachmentDownloadButton";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { resolveAttachmentUrls } from "@/lib/mail-storage";
import type { MailAttachmentMeta } from "@/lib/labels";
import { parseWorkflowTransitionNotes } from "@/lib/workflow-notes";

const CONTRIBUTOR_COLORS = [
  { border: "border-l-blue-500", bg: "bg-blue-50/50 dark:bg-blue-950/20", text: "text-blue-700 dark:text-blue-300" },
  { border: "border-l-emerald-500", bg: "bg-emerald-50/50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300" },
  { border: "border-l-amber-500", bg: "bg-amber-50/50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-300" },
  { border: "border-l-purple-500", bg: "bg-purple-50/50 dark:bg-purple-950/20", text: "text-purple-700 dark:text-purple-300" },
  { border: "border-l-rose-500", bg: "bg-rose-50/50 dark:bg-rose-950/20", text: "text-rose-700 dark:text-rose-300" },
  { border: "border-l-cyan-500", bg: "bg-cyan-50/50 dark:bg-cyan-950/20", text: "text-cyan-700 dark:text-cyan-300" },
  { border: "border-l-orange-500", bg: "bg-orange-50/50 dark:bg-orange-950/20", text: "text-orange-700 dark:text-orange-300" },
  { border: "border-l-teal-500", bg: "bg-teal-50/50 dark:bg-teal-950/20", text: "text-teal-700 dark:text-teal-300" },
];

interface Treatment {
  authorName: string;
  authorId: string;
  content: string;
  attachmentUrls: string[];
  attachmentMeta: MailAttachmentMeta[];
  documentType: string | null;
  submittedAt: string | null;
}

export function TreatmentsList({
  mailId,
  allowDownload = false,
}: {
  mailId: string;
  allowDownload?: boolean;
}) {
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTreatments();
  }, [mailId]);

  const fetchTreatments = async () => {
    setLoading(true);

    const { data: contributionRows } = await (supabase as any)
      .from("mail_contributions")
      .select("user_id, body, attachment_urls, processed_at, updated_at, status")
      .eq("mail_id", mailId)
      .eq("step_number", 4)
      .eq("status", "submitted")
      .order("updated_at", { ascending: true });

    if (contributionRows && contributionRows.length > 0) {
      const userIds = [...new Set(contributionRows.map((r: any) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) || []);

      const fromContributions: Treatment[] = await Promise.all(
        contributionRows.map(async (r: any) => {
          const attachments: MailAttachmentMeta[] = Array.isArray(r.attachment_urls)
            ? r.attachment_urls
            : [];
          let attachmentUrls = attachments.map((a) => a.url).filter(Boolean);
          if (attachments.some((a) => a.bucket && a.path)) {
            try {
              const fresh = await resolveAttachmentUrls(attachments);
              if (fresh.length > 0) attachmentUrls = fresh;
            } catch {
              /* keep stored url */
            }
          }
          return {
            authorName: profileMap.get(r.user_id) || "Conseiller",
            authorId: r.user_id,
            content: (r.body || "").trim(),
            attachmentUrls,
            attachmentMeta: attachments,
            documentType: null,
            submittedAt: r.processed_at || r.updated_at,
          };
        })
      );

      setTreatments(fromContributions.filter((t) => t.content || t.attachmentUrls.length > 0));
      setLoading(false);
      return;
    }

    const { data: allTransitions } = await supabase
      .from("workflow_transitions")
      .select("performed_by, notes, action, from_step, created_at, attachment_urls")
      .eq("mail_id", mailId)
      .eq("from_step", 4)
      .order("created_at", { ascending: true });

    if (!allTransitions || allTransitions.length === 0) {
      setLoading(false);
      return;
    }

    const personalSubmissions = allTransitions.filter(
      t => t.notes && !t.notes.startsWith("✅")
    );

    const performerIds = [...new Set(personalSubmissions.map(t => t.performed_by))];
    
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", performerIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

    const parsed: Treatment[] = personalSubmissions.map(t => {
      const notes = t.notes || "";
      
      const parsedNotes = parseWorkflowTransitionNotes(notes, (t as { attachment_urls?: unknown }).attachment_urls);

      const typeMatch = notes.match(/📄 Type de document: (.+?)(?:\n|$)/);
      const documentType = typeMatch ? typeMatch[1].trim() : null;

      const contentMatch = notes.match(/📋 Contenu:\n([\s\S]*?)(?:\n💬|$)/);
      const content = contentMatch ? contentMatch[1].trim() : "";

      return {
        authorName: profileMap.get(t.performed_by) || "Conseiller",
        authorId: t.performed_by,
        content,
        attachmentUrls: parsedNotes?.attachmentUrls || [],
        attachmentMeta: parsedNotes?.attachmentMeta || [],
        documentType,
        submittedAt: t.created_at,
      };
    });

    setTreatments(parsed.filter((t) => t.content || t.attachmentUrls.length > 0));
    setLoading(false);
  };

  if (loading) return null;
  if (treatments.length === 0) return null;

  // Build color map by unique author
  const authorIds = [...new Set(treatments.map(t => t.authorId))];
  const colorMap = new Map(authorIds.map((id, idx) => [id, CONTRIBUTOR_COLORS[idx % CONTRIBUTOR_COLORS.length]]));

  return (
    <div className="p-4 rounded-lg bg-accent border space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        Traitement(s) soumis
      </h4>
      {treatments.map((t, idx) => {
        const colors = colorMap.get(t.authorId) || CONTRIBUTOR_COLORS[0];
        return (
          <div key={idx} className={`p-3 rounded-lg border-l-4 ${colors.border} ${colors.bg} border space-y-2`}>
            <div className="flex items-center justify-between">
              <p className={`text-xs font-semibold flex items-center gap-1 ${colors.text}`}>
                <User className="h-3 w-3" />
                {t.authorName}
                {t.documentType && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                    {t.documentType}
                  </span>
                )}
              </p>
              {t.submittedAt && (
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(t.submittedAt), "dd MMM yyyy à HH:mm", { locale: fr })}
                </span>
              )}
            </div>
            <p className="text-sm whitespace-pre-wrap">{t.content}</p>
            {t.attachmentUrls.length > 0 && (
              <div className="flex items-center gap-2 p-2 rounded border bg-background/50">
                <Paperclip className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-xs truncate flex-1">
                  {t.attachmentUrls.length > 1 ? `Pièces jointes (${t.attachmentUrls.length})` : "Pièce jointe"}
                </span>
                <AttachmentViewer
                  urls={t.attachmentUrls}
                  mail={
                    t.attachmentMeta.length > 0
                      ? { attachment_urls: t.attachmentMeta }
                      : undefined
                  }
                  inline
                />
                {allowDownload &&
                  (t.attachmentMeta.length > 0
                    ? t.attachmentMeta.map((meta, i) => (
                        <AttachmentDownloadButton
                          key={i}
                          url={meta.url}
                          name={meta.name}
                          bucket={meta.bucket}
                          path={meta.path}
                          variant="ghost"
                          size="icon"
                        />
                      ))
                    : null)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
