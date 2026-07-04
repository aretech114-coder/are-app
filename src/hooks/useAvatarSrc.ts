import { useEffect, useMemo, useState } from "react";
import {
  getAvatarPublicSrc,
  invalidateAvatarSrcCache,
  resolveAvatarSrc,
  toAvatarStoragePath,
} from "@/lib/avatar-storage";

export { invalidateAvatarSrcCache };

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
    if (!path) {
      setSrc(undefined);
      return;
    }

    setSrc(getAvatarPublicSrc(path, version));

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
