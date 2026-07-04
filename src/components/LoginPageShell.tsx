import type { ReactNode } from "react";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useLoginBackgroundReady } from "@/hooks/useLoginBackgroundReady";
import { getLoginBackgroundStyle } from "@/lib/site-settings-cache";

interface LoginPageShellProps {
  children: ReactNode;
  cardClassName?: string;
}

export function LoginPageShell({ children, cardClassName = "" }: LoginPageShellProps) {
  const { settings, loading } = useSiteSettings();
  const bgReady = useLoginBackgroundReady(settings.login_bg_image_url, settings.login_bg_color);
  const hasBgImage = !!settings.login_bg_image_url;
  const bgStyle = getLoginBackgroundStyle(settings);

  if (loading || !bgReady) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={getLoginBackgroundStyle(settings)}
        aria-busy="true"
        aria-label="Chargement de la page de connexion"
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={bgStyle}>
      {hasBgImage && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/40" />
      )}
      <div className={`w-full max-w-md animate-fade-in relative z-10 ${cardClassName}`}>{children}</div>
    </div>
  );
}

export function useLoginPageAppearance() {
  const { settings } = useSiteSettings();
  const hasBgImage = !!settings.login_bg_image_url;
  return {
    settings,
    hasBgImage,
    cardGlassClass: hasBgImage
      ? "bg-card/30 backdrop-blur-3xl backdrop-saturate-150 border-white/10 shadow-2xl"
      : "",
    cardGlassClassAlt: hasBgImage
      ? "bg-card/60 backdrop-blur-xl border-white/20 shadow-2xl"
      : "",
    titleOnBgClass: hasBgImage ? "text-white drop-shadow-lg" : "text-foreground",
    subtitleOnBgClass: hasBgImage ? "text-white/90 drop-shadow-md" : "text-muted-foreground",
    cardTitleClass: hasBgImage ? "text-white drop-shadow-lg" : "",
    cardDescClass: hasBgImage ? "text-white/90 drop-shadow-md" : "",
    dividerClass: hasBgImage ? "bg-white/40" : "bg-border",
  };
}
