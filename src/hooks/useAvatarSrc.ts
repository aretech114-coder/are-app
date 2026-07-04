import { useMemo } from "react";
import { getAvatarPublicSrc, toAvatarStoragePath } from "@/lib/avatar-storage";

const srcCache = new Map<string, string>();

function cacheKey(path: string, version?: string | number | null): string {
  return `${path}|${version ?? ""}`;
}

/** Résout avatar_url (path ou URL legacy) en src affichable synchrone (bucket public). */
export function useAvatarSrc(
  avatarUrlOrPath: string | null | undefined,
  version?: string | number | null
): string | undefined {
  return useMemo(() => {
    const path = toAvatarStoragePath(avatarUrlOrPath);
    if (!path) return undefined;

    const key = cacheKey(path, version);
    const cached = srcCache.get(key);
    if (cached) return cached;

    const src = getAvatarPublicSrc(path, version);
    srcCache.set(key, src);
    return src;
  }, [avatarUrlOrPath, version]);
}
