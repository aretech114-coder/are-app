import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAvatarSrc } from "@/hooks/useAvatarSrc";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  avatarRef?: string | null;
  name?: string | null;
  className?: string;
  fallbackClassName?: string;
  cacheVersion?: string | number | null;
}

export function UserAvatar({
  avatarRef,
  name,
  className,
  fallbackClassName,
  cacheVersion,
}: UserAvatarProps) {
  const src = useAvatarSrc(avatarRef, cacheVersion);
  const initial = name?.charAt(0)?.toUpperCase() || "?";

  return (
    <Avatar className={cn("h-10 w-10", className)}>
      <AvatarImage src={src} alt={name || "Avatar"} />
      <AvatarFallback className={cn("bg-primary/10 text-primary", fallbackClassName)}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
