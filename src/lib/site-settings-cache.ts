import type { CSSProperties } from "react";

export const SITE_SETTINGS_CACHE_KEY = "are-app:public-site-settings:v1";

export interface CachedSiteSettings {
  site_title: string;
  site_subtitle: string;
  site_tagline: string;
  sidebar_initials: string;
  favicon_url: string;
  sidebar_logo_url: string;
  pwa_icon_url: string;
  allow_indexing: string;
  show_forgot_password: string;
  show_remember_me: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  sidebar_bg_color: string;
  background_color: string;
  link_color: string;
  font_heading: string;
  font_body: string;
  login_bg_color: string;
  login_bg_image_url: string;
  login_logo_url: string;
  show_login_title: string;
  authority_title_short: string;
  authority_title_long: string;
  max_upload_size_mb: string;
  step8_auto_advance_hours: string;
  ged_module_enabled: string;
}

export function getLoginBackgroundSignature(
  settings: Pick<CachedSiteSettings, "login_bg_image_url" | "login_bg_color">
): string {
  return `${settings.login_bg_image_url}|${settings.login_bg_color}`;
}

export function readCachedSiteSettings(): CachedSiteSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SITE_SETTINGS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSiteSettings;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedSiteSettings(settings: CachedSiteSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SITE_SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota / private mode errors
  }
}

export function getLoginBackgroundStyle(
  settings: Pick<CachedSiteSettings, "login_bg_image_url" | "login_bg_color">
): CSSProperties {
  const hasBgImage = !!settings.login_bg_image_url;
  if (hasBgImage) {
    return {
      backgroundImage: `url(${settings.login_bg_image_url})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }
  if (settings.login_bg_color && settings.login_bg_color !== "#FFFFFF") {
    return { backgroundColor: settings.login_bg_color };
  }
  return { backgroundColor: settings.login_bg_color || "#FFFFFF" };
}
