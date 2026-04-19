import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SiteSettings {
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
}

const defaults: SiteSettings = {
  site_title: "ARE App",
  site_subtitle: "Gestion Courrier",
  site_tagline: "Gestion des courriers",
  sidebar_initials: "ARE",
  favicon_url: "",
  sidebar_logo_url: "",
  pwa_icon_url: "",
  allow_indexing: "false",
  show_forgot_password: "true",
  show_remember_me: "true",
  primary_color: "#0EA5E9",
  secondary_color: "#1E293B",
  accent_color: "#0EA5E9",
  sidebar_bg_color: "#1E293B",
  background_color: "#F8FAFC",
  link_color: "#0EA5E9",
  font_heading: "Inter",
  font_body: "Inter",
  login_bg_color: "#FFFFFF",
  login_bg_image_url: "",
  login_logo_url: "",
  show_login_title: "true",
};

function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

interface SiteSettingsContext {
  settings: SiteSettings;
  loading: boolean;
  updateSetting: (key: string, value: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SiteSettingsContext>({
  settings: defaults,
  loading: true,
  updateSetting: async () => {},
  refresh: async () => {},
});

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(defaults);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("setting_key, setting_value");
    if (data) {
      const map = { ...defaults } as Record<string, string>;
      data.forEach((row: any) => {
        if (row.setting_key in map) {
          map[row.setting_key] = row.setting_value;
        }
      });
      setSettings(map as unknown as SiteSettings);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Apply side effects: title, favicon, meta robots, colors, fonts, theme-color
  useEffect(() => {
    document.title = settings.site_title || "ARE App";

    // Favicon
    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = settings.favicon_url || "/favicon.png";

    // Meta robots
    let meta = document.querySelector("meta[name='robots']") as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = settings.allow_indexing === "true" ? "index, follow" : "noindex, nofollow";

    // Theme color for PWA status bar
    let themeColor = document.querySelector("meta[name='theme-color']") as HTMLMetaElement | null;
    if (!themeColor) {
      themeColor = document.createElement("meta");
      themeColor.name = "theme-color";
      document.head.appendChild(themeColor);
    }
    themeColor.content = settings.primary_color || "#0EA5E9";

    // Apple touch icon (PWA icon)
    if (settings.pwa_icon_url) {
      let appleIcon = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement | null;
      if (!appleIcon) {
        appleIcon = document.createElement("link");
        appleIcon.rel = "apple-touch-icon";
        document.head.appendChild(appleIcon);
      }
      appleIcon.href = settings.pwa_icon_url;
    }

    // Dynamic colors
    const root = document.documentElement;
    const colorMap: Record<string, string> = {
      primary_color: "--primary",
      accent_color: "--accent",
      sidebar_bg_color: "--sidebar-background",
    };
    for (const [key, cssVar] of Object.entries(colorMap)) {
      const val = settings[key as keyof SiteSettings];
      if (val) {
        const hsl = hexToHsl(val);
        if (hsl) root.style.setProperty(cssVar, hsl);
      }
    }

    // Fonts
    const loadGoogleFont = (font: string) => {
      if (!font || font === "Inter") return;
      const id = `gfont-${font.replace(/\s/g, "-")}`;
      if (document.getElementById(id)) return;
      const glink = document.createElement("link");
      glink.id = id;
      glink.rel = "stylesheet";
      glink.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;600;700&display=swap`;
      document.head.appendChild(glink);
    };

    if (settings.font_heading) {
      loadGoogleFont(settings.font_heading);
      root.style.setProperty("--font-heading", `"${settings.font_heading}", sans-serif`);
    }
    if (settings.font_body) {
      loadGoogleFont(settings.font_body);
      root.style.setProperty("--font-body", `"${settings.font_body}", sans-serif`);
    }
  }, [settings]);

  const updateSetting = async (key: string, value: string) => {
    await supabase
      .from("site_settings")
      .update({ setting_value: value, updated_at: new Date().toISOString() })
      .eq("setting_key", key);
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Ctx.Provider value={{ settings, loading, updateSetting, refresh: fetchSettings }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSiteSettings = () => useContext(Ctx);
