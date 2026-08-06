import { formatFileSize } from "@/lib/file-compressor";

/** Limite effective (validation + Storage). */
export const DEFAULT_MAX_UPLOAD_MB = 150;
export const MIN_UPLOAD_MB = 1;
export const MAX_UPLOAD_MB = 150;

/** Libellé affiché aux utilisateurs dans les formulaires courrier / workflow. */
export const DISPLAY_MAX_UPLOAD_MB = 100;

export function parseMaxUploadMb(value: string | undefined | null): number {
  const parsed = parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_UPLOAD_MB;
  return Math.min(MAX_UPLOAD_MB, Math.max(MIN_UPLOAD_MB, parsed));
}

export function mbToBytes(mb: number): number {
  return mb * 1024 * 1024;
}

/** Texte d'aide sous les zones de dépôt (affiche toujours DISPLAY_MAX_UPLOAD_MB). */
export function formatMaxUploadLabel(_mb?: number): string {
  return `Taille max. par fichier : ${DISPLAY_MAX_UPLOAD_MB} Mo`;
}

/** Returns a French error message if the file exceeds the limit, else null. */
export function getUploadLimitError(file: File, maxMb: number): string | null {
  const maxBytes = mbToBytes(maxMb);
  if (file.size <= maxBytes) return null;
  return `${file.name} dépasse la limite de ${DISPLAY_MAX_UPLOAD_MB} Mo (fichier : ${formatFileSize(file.size)}).`;
}

export function assertFileWithinUploadLimit(file: File, maxMb: number): void {
  const error = getUploadLimitError(file, maxMb);
  if (error) throw new Error(error);
}
