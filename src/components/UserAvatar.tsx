import { useCallback, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAvatarSrc } from "@/hooks/useAvatarSrc";
import { resolveAvatarSrc } from "@/lib/avatar-storage";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  avatarRef?: string | null;
  name?: string | null;
  className?: string;
  fallbackClassName?: string;
  cacheVersion?: string | number | null;
  /** URL déjà vérifiée (prioritaire, ex. juste après upload). */
  srcOverride?: string | null;
}

export function UserAvatar({
  avatarRef,
  name,
  className,
  fallbackClassName,
  cacheVersion,
  srcOverride,
}: UserAvatarProps) {
  const resolvedSrc = useAvatarSrc(avatarRef, cacheVersion);
  const [fallbackSrc, setFallbackSrc] = useState<string | undefined>();
  const [retryAttempted, setRetryAttempted] = useState(false);

  useEffect(() => {
    setFallbackSrc(undefined);
    setRetryAttempted(false);
  }, [avatarRef, cacheVersion, srcOverride]);

  const src = srcOverride ?? fallbackSrc ?? resolvedSrc;
  const initial = name?.charAt(0)?.toUpperCase() || "?";

  const handleLoadingStatusChange = useCallback(
    (status: "idle" | "loading" | "loaded" | "error") => {
      if (status !== "error" || retryAttempted || !avatarRef) return;

      setRetryAttempted(true);
      void resolveAvatarSrc(avatarRef, cacheVersion).then((nextSrc) => {
        if (nextSrc && nextSrc !== src) {
          setFallbackSrc(nextSrc);
        }
      });
    },
    [avatarRef, cacheVersion, retryAttempted, src]
  );

  return (
    <Avatar className={cn("h-10 w-10", className)}>
      {src ? (
        <AvatarImage
          key={src}
          src={src}
          alt={name || "Avatar"}
          onLoadingStatusChange={handleLoadingStatusChange}
        />
      ) : null}
      <AvatarFallback className={cn("bg-primary/10 text-primary", fallbackClassName)}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
