import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  checkHasAccuseReception,
  fetchAccuseReceptionDocuments,
  getWorkflowDocumentSignedUrl,
  type MailWorkflowDocument,
} from "@/lib/mail-workflow-documents";

export function useAccuseReceptionDocument(mailId: string | undefined) {
  const qc = useQueryClient();

  const docQuery = useQuery({
    queryKey: ["mail_workflow_document", "accuse_reception_sortant", mailId],
    queryFn: async () => {
      if (!mailId) return [];
      return fetchAccuseReceptionDocuments(mailId);
    },
    enabled: !!mailId,
  });

  const hasQuery = useQuery({
    queryKey: ["has_accuse_reception", mailId],
    queryFn: async () => {
      if (!mailId) return false;
      return checkHasAccuseReception(mailId);
    },
    enabled: !!mailId,
  });

  const urlQuery = useQuery({
    queryKey: ["mail_workflow_document_urls", mailId, docQuery.data?.length],
    queryFn: async () => {
      const docs = docQuery.data || [];
      return Promise.all(
        docs.map(async (doc) => ({
          id: doc.id,
          url: await getWorkflowDocumentSignedUrl(doc),
        }))
      );
    },
    enabled: !!docQuery.data?.length,
  });

  const invalidate = () => {
    if (!mailId) return;
    qc.invalidateQueries({ queryKey: ["mail_workflow_document", "accuse_reception_sortant", mailId] });
    qc.invalidateQueries({ queryKey: ["mail_workflow_document_urls", mailId] });
    qc.invalidateQueries({ queryKey: ["has_accuse_reception", mailId] });
  };

  return {
    document: (docQuery.data?.[0] as MailWorkflowDocument | undefined) ?? null,
    documents: (docQuery.data as MailWorkflowDocument[] | undefined) ?? [],
    hasAccuse: hasQuery.data ?? false,
    signedUrl: urlQuery.data?.[0]?.url ?? null,
    signedUrls: urlQuery.data ?? [],
    isLoading: docQuery.isLoading || hasQuery.isLoading,
    invalidate,
  };
}
