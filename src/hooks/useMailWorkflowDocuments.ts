import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  checkHasAccuseReception,
  fetchAccuseReceptionDocument,
  getWorkflowDocumentSignedUrl,
  type MailWorkflowDocument,
} from "@/lib/mail-workflow-documents";

export function useAccuseReceptionDocument(mailId: string | undefined) {
  const qc = useQueryClient();

  const docQuery = useQuery({
    queryKey: ["mail_workflow_document", "accuse_reception_sortant", mailId],
    queryFn: async () => {
      if (!mailId) return null;
      return fetchAccuseReceptionDocument(mailId);
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
    queryKey: ["mail_workflow_document_url", docQuery.data?.id],
    queryFn: async () => {
      const doc = docQuery.data;
      if (!doc) return null;
      return getWorkflowDocumentSignedUrl(doc);
    },
    enabled: !!docQuery.data?.storage_path,
  });

  const invalidate = () => {
    if (!mailId) return;
    qc.invalidateQueries({ queryKey: ["mail_workflow_document", "accuse_reception_sortant", mailId] });
    qc.invalidateQueries({ queryKey: ["has_accuse_reception", mailId] });
  };

  return {
    document: docQuery.data as MailWorkflowDocument | null | undefined,
    hasAccuse: hasQuery.data ?? false,
    signedUrl: urlQuery.data,
    isLoading: docQuery.isLoading || hasQuery.isLoading,
    invalidate,
  };
}
