/** URL d'avatar avec cache-buster (updated_at ou timestamp après upload). */
export function avatarDisplayUrl(
  avatarUrl: string | null | undefined,
  version?: string | number | null
): string | undefined {
  if (!avatarUrl) return undefined;
  if (version == null || version === "") return avatarUrl;
  const separator = avatarUrl.includes("?") ? "&" : "?";
  return `${avatarUrl}${separator}v=${encodeURIComponent(String(version))}`;
}
