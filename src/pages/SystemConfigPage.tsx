import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Settings, Shield, Globe, Palette, Save } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface Permission {
  id: string;
  permission_key: string;
  label: string;
  description: string | null;
  is_enabled: boolean;
}

export default function SystemConfigPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const { settings, updateSetting, refresh } = useSiteSettings();

  // Local state for text fields
  const [siteTitle, setSiteTitle] = useState("");
  const [siteSubtitle, setSiteSubtitle] = useState("");
  const [sidebarInitials, setSidebarInitials] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [sidebarLogoUrl, setSidebarLogoUrl] = useState("");

  useEffect(() => {
    setSiteTitle(settings.site_title);
    setSiteSubtitle(settings.site_subtitle);
    setSidebarInitials(settings.sidebar_initials);
    setFaviconUrl(settings.favicon_url);
    setSidebarLogoUrl(settings.sidebar_logo_url);
  }, [settings]);

  useEffect(() => {
    fetchPermissions();
  }, []);

  const fetchPermissions = async () => {
    const { data, error } = await supabase
      .from("admin_permissions")
      .select("*")
      .order("permission_key");
    if (error) toast.error(error.message);
    else setPermissions(data || []);
    setLoading(false);
  };

  const togglePermission = async (id: string, currentValue: boolean) => {
    const { error } = await supabase
      .from("admin_permissions")
      .update({ is_enabled: !currentValue })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPermissions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_enabled: !currentValue } : p))
    );
    toast.success("Permission mise à jour");
  };

  const saveBranding = async () => {
    try {
      await Promise.all([
        updateSetting("site_title", siteTitle),
        updateSetting("site_subtitle", siteSubtitle),
        updateSetting("sidebar_initials", sidebarInitials),
        updateSetting("favicon_url", faviconUrl),
        updateSetting("sidebar_logo_url", sidebarLogoUrl),
      ]);
      toast.success("Paramètres de branding sauvegardés");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    }
  };

  const toggleIndexing = async () => {
    const newValue = settings.allow_indexing === "true" ? "false" : "true";
    await updateSetting("allow_indexing", newValue);
    toast.success(newValue === "true" ? "Indexation activée" : "Indexation désactivée");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Chargement...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Configuration Système
        </h1>
        <p className="page-description">
          Contrôlez les fonctionnalités, le branding et le SEO de la plateforme
        </p>
      </div>

      {/* SEO / Indexation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Indexation SEO
          </CardTitle>
          <CardDescription>
            Contrôlez si les moteurs de recherche peuvent indexer votre plateforme.
            Par défaut, l'indexation est désactivée.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-3 px-4 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Autoriser l'indexation</Label>
              <p className="text-xs text-muted-foreground">
                {settings.allow_indexing === "true"
                  ? "Les moteurs de recherche peuvent indexer votre site"
                  : "Votre site est masqué des moteurs de recherche (noindex)"}
              </p>
            </div>
            <Switch
              checked={settings.allow_indexing === "true"}
              onCheckedChange={toggleIndexing}
            />
          </div>
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Branding & Identité
          </CardTitle>
          <CardDescription>
            Personnalisez le titre, le logo et le favicon de la plateforme.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="site_title">Titre de la plateforme</Label>
              <Input
                id="site_title"
                value={siteTitle}
                onChange={(e) => setSiteTitle(e.target.value)}
                placeholder="CourierPro"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site_subtitle">Sous-titre</Label>
              <Input
                id="site_subtitle"
                value={siteSubtitle}
                onChange={(e) => setSiteSubtitle(e.target.value)}
                placeholder="Gestion Courrier"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sidebar_initials">Initiales du logo</Label>
              <Input
                id="sidebar_initials"
                value={sidebarInitials}
                onChange={(e) => setSidebarInitials(e.target.value)}
                placeholder="CP"
                maxLength={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="favicon_url">URL du Favicon</Label>
              <Input
                id="favicon_url"
                value={faviconUrl}
                onChange={(e) => setFaviconUrl(e.target.value)}
                placeholder="https://exemple.com/favicon.png"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sidebar_logo_url">URL du logo (barre latérale)</Label>
            <Input
              id="sidebar_logo_url"
              value={sidebarLogoUrl}
              onChange={(e) => setSidebarLogoUrl(e.target.value)}
              placeholder="https://exemple.com/logo.png"
            />
            <p className="text-xs text-muted-foreground">
              Si renseigné, cette image remplacera les initiales dans la barre latérale.
            </p>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/20">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Aperçu :</span>
            {sidebarLogoUrl ? (
              <img src={sidebarLogoUrl} alt="Logo preview" className="w-9 h-9 rounded-lg object-cover" />
            ) : (
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                {sidebarInitials || "CP"}
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{siteTitle || "CourierPro"}</span>
              <span className="text-xs text-muted-foreground">{siteSubtitle || "Gestion Courrier"}</span>
            </div>
          </div>

          <Button onClick={saveBranding} className="w-full sm:w-auto">
            <Save className="h-4 w-4 mr-2" />
            Enregistrer le branding
          </Button>
        </CardContent>
      </Card>

      {/* Admin Permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Droits de l'Admin Entreprise
          </CardTitle>
          <CardDescription>
            Activez ou désactivez les fonctionnalités que l'administrateur peut utiliser.
            Vous (SuperAdmin) conservez toujours un accès complet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {permissions.map((perm) => (
            <div
              key={perm.id}
              className="flex items-center justify-between py-3 px-4 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="space-y-0.5">
                <Label className="text-sm font-medium cursor-pointer">
                  {perm.label}
                </Label>
                {perm.description && (
                  <p className="text-xs text-muted-foreground">{perm.description}</p>
                )}
              </div>
              <Switch
                checked={perm.is_enabled}
                onCheckedChange={() => togglePermission(perm.id, perm.is_enabled)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
