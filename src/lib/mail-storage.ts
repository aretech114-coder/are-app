import { supabase } from "@/integrations/supabase/client";
import { compressFile } from "@/lib/file-compressor";
import type { MailAttachmentMeta, MailStorageBucket } from "@/lib/labels";

export const INCOMING_BUCKET = "mail-incoming" as const;
export const WORKFLOW_BUCKET = "mail-documents" as const;

const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 365;

export function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

/** Path: {YYYY}/{MM}/{reference}/{timestamp}_{filename} */
export function buildIncomingPath(
  ref: string,
  fileName: string,
  receptionDate?: string | null
): string {
  const d = receptionDate ? new Date(receptionDate) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const safeRef = ref.replace(/[^a-zA-Z0-9/_-]/g, "_");
  const safeName = sanitizeFileName(fileName);
  return `${year}/${month}/${safeRef}/${Date.now()}_${safeName}`;
}

export async function createSignedUrlForPath(
  bucket: MailStorageBucket,
  path: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error) throw error;
  return data?.signedUrl || "";
}

/** Refresh display URLs when bucket + path metadata are available. */
export async function resolveAttachmentUrls(
  attachments: MailAttachmentMeta[]
): Promise<string[]> {
  const urls: string[] = [];
  for (const att of attachments) {
    if (att.bucket && att.path) {
      try {
        urls.push(await createSignedUrlForPath(att.bucket, att.path));
        continue;
      } catch {
        /* fall back to stored url */
      }
    }
    if (att.url) urls.push(att.url);
  }
  return urls;
}

export async function uploadIncomingMailFiles(
  ref: string,
  files: File[],
  receptionDate?: string | null,
  onCompressed?: (fileName: string, originalSize: number, compressedSize: number) => void
): Promise<MailAttachmentMeta[]> {
  const results: MailAttachmentMeta[] = [];

  for (const originalFile of files) {
    const { file, originalSize, compressedSize, wasCompressed } =
      await compressFile(originalFile);
    if (wasCompressed && onCompressed) {
      onCompressed(file.name, originalSize, compressedSize);
    }

    const filePath = buildIncomingPath(ref, file.name, receptionDate);
    const { error: uploadErr } = await supabase.storage
      .from(INCOMING_BUCKET)
      .upload(filePath, file);
    if (uploadErr) throw uploadErr;

    const url = await createSignedUrlForPath(INCOMING_BUCKET, filePath);
    if (url) {
      results.push({
        name: originalFile.name,
        path: filePath,
        url,
        bucket: INCOMING_BUCKET,
      });
    }
  }

  return results;
}
