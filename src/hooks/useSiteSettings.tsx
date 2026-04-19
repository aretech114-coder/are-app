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

type SiteSettingKey = keyof SiteSettings;

type SettingMetadata = {
  description: string;
  label: string;
  setting_type: string;
};

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

const SETTING_METADATA: Record<SiteSettingKey, SettingMetadata> = {
  site_title: {
    label: "Titre de la plateforme",
    setting_type: "text",
    description: "Nom principal affiché dans l'application",
  },
  site_subtitle: {
    label: "Sous-titre",
    setting_type: "text",
    description: "Sous-titre affiché sous le nom de la plateforme",
  },
  site_tagline: {
    label: "Description courte",
    setting_type: "text",
    description: "Tagline mobile affichée dans l'en-tête",
  },
  sidebar_initials: {
    label: "Initiales du logo",
    setting_type: "text",
    description: "Initiales utilisées si aucun logo n'est défini",
  },
  favicon_url: {
    label: "Favicon",
    setting_type: "image",
    description: "Icône du navigateur",
  },
  sidebar_logo_url: {
    label: "Logo de la barre latérale",
    setting_type: "image",
    description: "Logo affiché dans la navigation principale",
  },
  pwa_icon_url: {
    label: "Icône PWA",
    setting_type: "image",
    description: "Icône utilisée pour l'installation mobile",
  },
  allow_indexing: {
    label: "Autoriser l'indexation",
    setting_type: "boolean",
    description: "Autorise ou bloque l'indexation SEO",
  },
  show_forgot_password: {
    label: "Afficher mot de passe oublié",
    setting_type: "boolean",
    description: "Affiche le lien mot de passe oublié sur la page de connexion",
  },
  show_remember_me: {
    label: "Afficher se souvenir de moi",
    setting_type: "boolean",
    description: "Affiche la case se souvenir de moi sur la page de connexion",
  },
  primary_color: {
    label: "Couleur primaire",
    setting_type: "color",
    description: "Couleur principale de l'interface",
  },
  secondary_color: {
    label: "Couleur secondaire",
    setting_type: "color",
    description: "Couleur secondaire de l'interface",
  },
  accent_color: {
    label: "Couleur d'accentuation",
    setting_type: "color",
    description: "Couleur d'accentuation de l'interface",
  },
  sidebar_bg_color: {
    label: "Fond de la sidebar",
    setting_type: "color",
    description: "Couleur d'arrière-plan de la barre latérale",
  },
  background_color: {
    label: "Fond de page",
    setting_type: "color",
    description: "Couleur de fond principale",
  },
  link_color: {
    label: "Couleur des liens",
    setting_type: "color",
    description: "Couleur utilisée pour les liens",
  },
  font_heading: {
    label: "Police des titres",
    setting_type: "select",
    description: "Police utilisée pour les titres",
  },
  font_body: {
    label: "Police du texte",
    setting_type: "select",
    description: "Police utilisée pour le texte courant",
  },
  login_bg_color: {
    label: "Couleur de fond connexion",
    setting_type: "color",
    description: "Couleur de fond de la page de connexion",
  },
  login_bg_image_url: {
    label: "Image de fond connexion",
    setting_type: "image",
    description: "Image de fond de la page de connexion",
  },
  login_logo_url: {
    label: "Logo de la page de connexion",
    setting_type: "image",
    description: "Logo affiché dans le formulaire de connexion",
  },
  show_login_title: {
    label: "Afficher le titre de connexion",
    setting_type: "boolean",
    description: "Affiche le titre et le sous-titre dans le formulaire de connexion",
  },
};

const PUBLIC_SETTING_KEYS = Object.keys(defaults) as SiteSettingKey[];

function mapSettingsRows(rows: Array<{ setting_key: string; setting_value: string | null }>): SiteSettings {
  const mapped = { ...defaults } as Record<SiteSettingKey, string>;

  rows.forEach((row) => {
    if (row.setting_key in mapped) {
      mapped[row.setting_key] = row.setting_value ?? "";
    }
  });

  return mapped;
}

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
    setLoading(true);

    try {
      const { data: authData } = await supabase.auth.getSession();
      const hasSession = !!authData.session?.user;

      if (hasSession) {
        const { data, error } = await supabase
          .from("site_settings")
          .select("setting_key, setting_value");

        if (!error && data) {
          setSettings(mapSettingsRows(data));
          return;
        }
      }

      const { data, error } = await supabase.functions.invoke("public-site-settings", {
        body: { keys: PUBLIC_SETTING_KEYS },
      });

      if (error) throw error;

      const publicSettings = Array.isArray(data?.settings) ? data.settings : [];
      setSettings(mapSettingsRows(publicSettings));
    } catch {
      setSettings(defaults);
    } finally {
      setLoading(false);
    }
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
    const typedKey = key as SiteSettingKey;
    const metadata = SETTING_METADATA[typedKey];

    const { error } = await supabase
      .from("site_settings")
      .upsert(
        {
          setting_key: key,
          setting_value: value,
          setting_type: metadata?.setting_type ?? "text",
          label: metadata?.label ?? key,
          description: metadata?.description ?? key,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" }
      );

    if (error) throw error;

    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Ctx.Provider value={{ settings, loading, updateSetting, refresh: fetchSettings }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSiteSettings = () => useContext(Ctx);
