import { useEffect, useState } from "react";
import { resolveAvatarSrc } from "@/lib/avatar-storage";
import { avatarDisplayUrl } from "@/lib/avatar-url";

/** Résout avatar_url (path ou URL legacy) en src affichable, avec cache-buster optionnel. */
export function useAvatarSrc(
  avatarUrlOrPath: string | null | undefined,
  version?: string | number | null
): string | undefined {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!avatarUrlOrPath) {
      setSrc(undefined);
      return;
    }

    let cancelled = false;

    resolveAvatarSrc(avatarUrlOrPath).then((url) => {
      if (cancelled) return;
      setSrc(url ? avatarDisplayUrl(url, version) : undefined);
    });

    return () => {
      cancelled = true;
    };
  }, [avatarUrlOrPath, version]);

  return src;
}
