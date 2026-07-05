import { supabase } from "@/integrations/supabase/client";
import {
  mailDocumentSubfolderForStep,
  uploadMailDocument,
  type MailDocumentSubfolder,
} from "@/lib/workflow-engine";
import { createSignedUrlForPath } from "@/lib/mail-storage";

export type WorkflowDocumentType = "accuse_reception_sortant";

export interface MailWorkflowDocument {
  id: string;
  mail_id: string;
  step_number: number;
  document_type: WorkflowDocumentType;
  storage_bucket: string;
  storage_path: string;
  file_name: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export async function fetchAccuseReceptionDocument(
  mailId: string
): Promise<MailWorkflowDocument | null> {
  const { data, error } = await supabase
    .from("mail_workflow_documents")
    .select("*")
    .eq("mail_id", mailId)
    .eq("document_type", "accuse_reception_sortant")
    .maybeSingle();

  if (error) throw error;
  return data as MailWorkflowDocument | null;
}

export async function getWorkflowDocumentSignedUrl(
  doc: Pick<MailWorkflowDocument, "storage_bucket" | "storage_path">
): Promise<string | null> {
  return createSignedUrlForPath(doc.storage_bucket, doc.storage_path);
}

export async function uploadAndRegisterAccuseReception(
  mailId: string,
  file: File,
  stepNumber: 8 | 9,
  maxUploadMb: number
): Promise<MailWorkflowDocument> {
  const subfolder = mailDocumentSubfolderForStep(stepNumber) as MailDocumentSubfolder;
  const meta = await uploadMailDocument(mailId, file, subfolder, maxUploadMb);

  const { data, error } = await supabase.rpc("register_mail_workflow_document", {
    _mail_id: mailId,
    _step_number: stepNumber,
    _document_type: "accuse_reception_sortant",
    _storage_bucket: meta.bucket ?? "mail-documents",
    _storage_path: meta.path,
    _file_name: meta.name ?? file.name,
  });

  if (error) throw error;
  const result = data as { success?: boolean; error?: string };
  if (!result?.success) {
    throw new Error(result?.error || "Enregistrement du document échoué");
  }

  const doc = await fetchAccuseReceptionDocument(mailId);
  if (!doc) throw new Error("Document enregistré mais introuvable");
  return doc;
}

export async function checkHasAccuseReception(mailId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_accuse_reception_sortant", {
    _mail_id: mailId,
  });
  if (error) throw error;
  return !!data;
}
