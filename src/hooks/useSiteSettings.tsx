import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SiteSettings {
  site_title: string;
  site_subtitle: string;
  sidebar_initials: string;
  favicon_url: string;
  sidebar_logo_url: string;
  allow_indexing: string;
}

const defaults: SiteSettings = {
  site_title: "CourierPro",
  site_subtitle: "Gestion Courrier",
  sidebar_initials: "CP",
  favicon_url: "",
  sidebar_logo_url: "",
  allow_indexing: "false",
};

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

  // Apply side effects: title, favicon, meta robots
  useEffect(() => {
    document.title = settings.site_title || "CourierPro";

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
