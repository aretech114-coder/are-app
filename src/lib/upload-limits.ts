import { formatFileSize } from "@/lib/file-compressor";

export const DEFAULT_MAX_UPLOAD_MB = 25;
export const MIN_UPLOAD_MB = 1;
export const MAX_UPLOAD_MB = 100;

export function parseMaxUploadMb(value: string | undefined | null): number {
  const parsed = parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_UPLOAD_MB;
  return Math.min(MAX_UPLOAD_MB, Math.max(MIN_UPLOAD_MB, parsed));
}

export function mbToBytes(mb: number): number {
  return mb * 1024 * 1024;
}

export function formatMaxUploadLabel(mb: number): string {
  return `Taille max. par fichier : ${mb} Mo`;
}

/** Returns a French error message if the file exceeds the limit, else null. */
export function getUploadLimitError(file: File, maxMb: number): string | null {
  const maxBytes = mbToBytes(maxMb);
  if (file.size <= maxBytes) return null;
  return `${file.name} dépasse la limite de ${maxMb} Mo (fichier : ${formatFileSize(file.size)}).`;
}

export function assertFileWithinUploadLimit(file: File, maxMb: number): void {
  const error = getUploadLimitError(file, maxMb);
  if (error) throw new Error(error);
}
