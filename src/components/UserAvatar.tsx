import { useCallback, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAvatarSrc } from "@/hooks/useAvatarSrc";
import { getAvatarSignedSrc } from "@/lib/avatar-storage";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  avatarRef?: string | null;
  name?: string | null;
  className?: string;
  fallbackClassName?: string;
  cacheVersion?: string | number | null;
}

function isPublicAvatarUrl(url: string): boolean {
  return url.includes("/object/public/avatars/");
}

export function UserAvatar({
  avatarRef,
  name,
  className,
  fallbackClassName,
  cacheVersion,
}: UserAvatarProps) {
  const resolvedSrc = useAvatarSrc(avatarRef, cacheVersion);
  const [fallbackSrc, setFallbackSrc] = useState<string | undefined>();
  const [signedAttempted, setSignedAttempted] = useState(false);

  useEffect(() => {
    setFallbackSrc(undefined);
    setSignedAttempted(false);
  }, [avatarRef, cacheVersion]);

  const src = fallbackSrc ?? resolvedSrc;
  const initial = name?.charAt(0)?.toUpperCase() || "?";

  const handleLoadingStatusChange = useCallback(
    (status: "idle" | "loading" | "loaded" | "error") => {
      if (status !== "error" || signedAttempted || !avatarRef || !src) return;
      if (!isPublicAvatarUrl(src)) return;

      setSignedAttempted(true);
      void getAvatarSignedSrc(avatarRef, cacheVersion).then((signed) => {
        if (signed && signed !== src) {
          setFallbackSrc(signed);
        }
      });
    },
    [avatarRef, cacheVersion, signedAttempted, src]
  );

  return (
    <Avatar className={cn("h-10 w-10", className)}>
      <AvatarImage src={src} alt={name || "Avatar"} onLoadingStatusChange={handleLoadingStatusChange} />
      <AvatarFallback className={cn("bg-primary/10 text-primary", fallbackClassName)}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
