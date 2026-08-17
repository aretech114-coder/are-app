import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Button } from "@/components/ui/button";
import { getLoginBackgroundStyle } from "@/lib/site-settings-cache";
import { resolveMaintenanceButtonTarget } from "@/lib/account-status";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function useCountdown(untilIso: string) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    const until = untilIso ? new Date(untilIso).getTime() : NaN;
    const hasTarget = Number.isFinite(until);
    const diff = hasTarget ? until - now : 0;
    const isFuture = hasTarget && diff > 0;
    const remaining = isFuture ? diff : 0;
    const totalSec = Math.floor(remaining / 1000);
    return {
      isFuture,
      days: Math.floor(totalSec / 86400),
      hours: Math.floor((totalSec % 86400) / 3600),
      minutes: Math.floor((totalSec % 3600) / 60),
      seconds: totalSec % 60,
    };
  }, [untilIso, now]);
}

export default function MaintenancePage() {
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const bgUrl = settings.maintenance_bg_image_url || settings.login_bg_image_url;
  const bgStyle = getLoginBackgroundStyle({
    login_bg_image_url: bgUrl,
    login_bg_color: settings.login_bg_color,
  });
  const hasBgImage = !!bgUrl;
  const countdown = useCountdown(settings.maintenance_until);
  const showCountdown = settings.maintenance_show_countdown === "true" && countdown.isFuture;

  const title = settings.maintenance_title || "Maintenance terminée";
  const message =
    settings.maintenance_message ||
    "La plateforme est à nouveau disponible. Merci de cliquer sur « Se connecter » pour accéder à votre espace.";
  const buttonLabel = settings.maintenance_button_label || "Se connecter";
  const footnote =
    settings.maintenance_footnote ||
    "Saisissez votre adresse e-mail et le mot de passe initial qui vous a été communiqué — il ne s'agit pas de votre ancien mot de passe.";

  const handlePrimaryAction = () => {
    const target = resolveMaintenanceButtonTarget(settings.maintenance_button_url);
    if (target.kind === "login") {
      navigate("/auth");
      return;
    }
    window.location.assign(target.url);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={bgStyle}>
      {hasBgImage && <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/50" />}
      <div className="relative z-10 w-full max-w-lg text-center space-y-8">
        {settings.login_logo_url || settings.sidebar_logo_url ? (
          <img
            src={settings.login_logo_url || settings.sidebar_logo_url}
            alt=""
            className="w-16 h-16 mx-auto object-contain"
          />
        ) : (
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-xl">
            {settings.sidebar_initials || "ARE"}
          </div>
        )}

        <div className="space-y-3">
          <h1 className={`text-3xl font-bold ${hasBgImage ? "text-white drop-shadow-lg" : "text-foreground"}`}>
            {title}
          </h1>
          <p className={`text-sm leading-relaxed ${hasBgImage ? "text-white/90 drop-shadow-md" : "text-muted-foreground"}`}>
            {message}
          </p>
        </div>

        {showCountdown && (
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {[
              { label: "Jours", value: countdown.days },
              { label: "Heures", value: countdown.hours },
              { label: "Minutes", value: countdown.minutes },
              { label: "Secondes", value: countdown.seconds },
            ].map((unit) => (
              <div
                key={unit.label}
                className={`rounded-xl px-2 py-4 ${
                  hasBgImage ? "bg-black/35 border border-white/15 text-white" : "bg-card border"
                }`}
              >
                <div className="text-2xl sm:text-3xl font-semibold tabular-nums">{pad2(unit.value)}</div>
                <div
                  className={`text-[10px] uppercase tracking-wide mt-1 ${hasBgImage ? "text-white/70" : "text-muted-foreground"}`}
                >
                  {unit.label}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <Button size="lg" className="w-full sm:w-auto" onClick={handlePrimaryAction}>
            {buttonLabel}
          </Button>
          {footnote.trim() ? (
            <p
              className={`text-xs leading-relaxed max-w-md mx-auto ${
                hasBgImage ? "text-white/85 drop-shadow-md" : "text-muted-foreground"
              }`}
            >
              {footnote}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
