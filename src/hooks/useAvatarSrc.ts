import { useEffect, useMemo, useState } from "react";
import {
  getAvatarPublicSrc,
  invalidateAvatarSrcCache,
  resolveAvatarSrc,
  seedAvatarSrcCache,
  toAvatarStoragePath,
} from "@/lib/avatar-storage";

export { invalidateAvatarSrcCache, seedAvatarSrcCache };

/** Résout avatar_url (path ou URL legacy) en src affichable avec fallback signed URL. */
export function useAvatarSrc(
  avatarUrlOrPath: string | null | undefined,
  version?: string | number | null
): string | undefined {
  const path = useMemo(() => toAvatarStoragePath(avatarUrlOrPath), [avatarUrlOrPath]);

  const optimisticSrc = useMemo(() => {
    if (!path) return undefined;
    return getAvatarPublicSrc(path, version);
  }, [path, version]);

  const [src, setSrc] = useState<string | undefined>(optimisticSrc);

  useEffect(() => {
    setSrc(optimisticSrc);
  }, [optimisticSrc]);

  useEffect(() => {
    if (!path) return;

    let cancelled = false;
    void resolveAvatarSrc(avatarUrlOrPath, version).then((resolved) => {
      if (!cancelled && resolved) {
        setSrc(resolved);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [avatarUrlOrPath, path, version]);

  return src;
}
