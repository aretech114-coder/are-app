import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Settings, Shield, Globe, Palette, Save, Upload, X, KeyRound, RotateCcw, Type, Key, Copy, Trash2, Plus, Building2, Loader2 } from "lucide-react";
import { APP_URL } from "@/lib/constants";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface Permission {
  id: string;
  permission_key: string;
  label: string;
  description: string | null;
  is_enabled: boolean;
}

interface ApiKeyRow {
  id: string;
  label: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;

}

const FONT_OPTIONS = [
  "Inter",
  "Poppins",
  "Roboto",
  "Nunito",
  "DM Sans",
  "Montserrat",
  "Open Sans",
  "Lato",
];

const COLOR_DEFAULTS: Record<string, string> = {
  primary_color: "#0EA5E9",
  secondary_color: "#1E293B",
  accent_color: "#0EA5E9",
  sidebar_bg_color: "#1E293B",
  background_color: "#F8FAFC",
  link_color: "#0EA5E9",
};

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

const isValidHex = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);

export default function SystemConfigPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const { settings, updateSetting } = useSiteSettings();

  const [siteTitle, setSiteTitle] = useState("");
  const [siteSubtitle, setSiteSubtitle] = useState("");
  const [siteTagline, setSiteTagline] = useState("");
  const [sidebarInitials, setSidebarInitials] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [sidebarLogoUrl, setSidebarLogoUrl] = useState("");
  const [pwaIconUrl, setPwaIconUrl] = useState("");
  const [loginBgColor, setLoginBgColor] = useState("#FFFFFF");
  const [loginBgImageUrl, setLoginBgImageUrl] = useState("");
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPwaIcon, setUploadingPwaIcon] = useState(false);
  const [uploadingLoginBg, setUploadingLoginBg] = useState(false);

  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);

  // Colors & fonts
  const [colors, setColors] = useState<Record<string, string>>({ ...COLOR_DEFAULTS });
  const [fontHeading, setFontHeading] = useState("Inter");
  const [fontBody, setFontBody] = useState("Inter");

  const faviconInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const pwaIconInputRef = useRef<HTMLInputElement>(null);
  const loginBgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSiteTitle(settings.site_title);
    setSiteSubtitle(settings.site_subtitle);
    setSiteTagline(settings.site_tagline || "");
    setSidebarInitials(settings.sidebar_initials);
    setFaviconUrl(settings.favicon_url);
    setSidebarLogoUrl(settings.sidebar_logo_url);
    setPwaIconUrl((settings as any).pwa_icon_url || "");
    setLoginBgColor((settings as any).login_bg_color || "#FFFFFF");
    setLoginBgImageUrl((settings as any).login_bg_image_url || "");
    setColors({
      primary_color: settings.primary_color || COLOR_DEFAULTS.primary_color,
      secondary_color: settings.secondary_color || COLOR_DEFAULTS.secondary_color,
      accent_color: settings.accent_color || COLOR_DEFAULTS.accent_color,
      sidebar_bg_color: settings.sidebar_bg_color || COLOR_DEFAULTS.sidebar_bg_color,
      background_color: settings.background_color || COLOR_DEFAULTS.background_color,
      link_color: settings.link_color || COLOR_DEFAULTS.link_color,
    });
    setFontHeading(settings.font_heading || "Inter");
    setFontBody(settings.font_body || "Inter");
  }, [settings]);

  useEffect(() => {
    fetchPermissions();
    fetchApiKeys();
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

  const fetchApiKeys = async () => {
    const { data, error } = await supabase
      .from("api_keys" as any)
      .select("id, label, is_active, created_at, last_used_at")
      .order("created_at", { ascending: false });
    if (!error && data) setApiKeys(data as any);
  };

  const generateApiKey = async () => {
    if (!newKeyLabel.trim()) {
      toast.error("Veuillez saisir un libellé pour la clé");
      return;
    }
    setGeneratingKey(true);
    try {
      // Generate a random key
      const rawKey = crypto.randomUUID() + "-" + crypto.randomUUID();
      // Hash it
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawKey));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const keyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      const { error } = await supabase.from("api_keys" as any).insert({
        key_hash: keyHash,
        label: newKeyLabel.trim(),
        created_by: (await supabase.auth.getUser()).data.user?.id,
        permissions: ["read"],
      } as any);

      if (error) throw error;
      setGeneratedKey(rawKey);
      setNewKeyLabel("");
      fetchApiKeys();
      toast.success("Clé API créée");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la création");
    } finally {
      setGeneratingKey(false);
    }
  };

  const revokeApiKey = async (id: string) => {
    const { error } = await supabase
      .from("api_keys" as any)
      .update({ is_active: false } as any)
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Clé révoquée");
      fetchApiKeys();
    }
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

  const uploadFile = async (
    file: File,
    folder: string,
    setUploading: (v: boolean) => void,
    setUrl: (url: string) => void
  ) => {
    setUploading(true);
    try {
      const safeName = sanitizeFileName(file.name);
      const filePath = `${folder}/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage
        .from("branding")
        .upload(filePath, file, { upsert: true });
      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("branding")
        .getPublicUrl(filePath);
      setUrl(urlData.publicUrl);
      toast.success("Image uploadée avec succès");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const saveBranding = async () => {
    try {
      await Promise.all([
        updateSetting("site_title", siteTitle),
        updateSetting("site_subtitle", siteSubtitle),
        updateSetting("site_tagline", siteTagline),
        updateSetting("sidebar_initials", sidebarInitials),
        updateSetting("favicon_url", faviconUrl),
        updateSetting("sidebar_logo_url", sidebarLogoUrl),
        updateSetting("pwa_icon_url", pwaIconUrl),
        updateSetting("login_bg_color", loginBgColor),
        updateSetting("login_bg_image_url", loginBgImageUrl),
      ]);
      toast.success("Paramètres de branding sauvegardés");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    }
  };

  const saveColors = async () => {
    for (const [key, val] of Object.entries(colors)) {
      if (!isValidHex(val)) {
        toast.error(`Couleur invalide pour ${key}: ${val}`);
        return;
      }
    }
    try {
      await Promise.all([
        ...Object.entries(colors).map(([key, val]) => updateSetting(key, val)),
        updateSetting("font_heading", fontHeading),
        updateSetting("font_body", fontBody),
      ]);
      toast.success("Couleurs et polices sauvegardées");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    }
  };

  const resetColors = () => {
    setColors({ ...COLOR_DEFAULTS });
    setFontHeading("Inter");
    setFontBody("Inter");
  };

  const toggleIndexing = async () => {
    const newValue = settings.allow_indexing === "true" ? "false" : "true";
    await updateSetting("allow_indexing", newValue);
    toast.success(newValue === "true" ? "Indexation activée" : "Indexation désactivée");
  };

  const toggleForgotPassword = async () => {
    const newValue = settings.show_forgot_password === "true" ? "false" : "true";
    await updateSetting("show_forgot_password", newValue);
    toast.success(newValue === "true" ? "Lien activé" : "Lien désactivé");
  };

  const toggleRememberMe = async () => {
    const newValue = settings.show_remember_me === "true" ? "false" : "true";
    await updateSetting("show_remember_me", newValue);
    toast.success(newValue === "true" ? "Case activée" : "Case désactivée");
  };

  const colorFields = [
    { key: "primary_color", label: "Couleur primaire", desc: "Boutons, liens actifs, éléments principaux" },
    { key: "secondary_color", label: "Couleur secondaire", desc: "Arrière-plans secondaires" },
    { key: "accent_color", label: "Couleur d'accentuation", desc: "Éléments mis en avant" },
    { key: "sidebar_bg_color", label: "Fond de la sidebar", desc: "Arrière-plan de la barre latérale" },
    { key: "background_color", label: "Fond de page", desc: "Arrière-plan principal" },
    { key: "link_color", label: "Couleur des liens", desc: "Liens cliquables" },
  ];

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
          Contrôlez les fonctionnalités, le branding, les couleurs et le SEO de la plateforme
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

      {/* Auth Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Authentification
          </CardTitle>
          <CardDescription>
            Paramètres de la page de connexion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-3 px-4 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Lien « Mot de passe oublié ? »</Label>
              <p className="text-xs text-muted-foreground">
                {settings.show_forgot_password !== "false"
                  ? "Le lien est visible sur la page de connexion"
                  : "Le lien est masqué sur la page de connexion"}
              </p>
            </div>
            <Switch
              checked={settings.show_forgot_password !== "false"}
              onCheckedChange={toggleForgotPassword}
            />
          </div>
          <div className="flex items-center justify-between py-3 px-4 rounded-lg border bg-muted/30 mt-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Case « Se souvenir de moi »</Label>
              <p className="text-xs text-muted-foreground">
                {settings.show_remember_me !== "false"
                  ? "La case est visible sur la page de connexion"
                  : "La case est masquée sur la page de connexion"}
              </p>
            </div>
            <Switch
              checked={settings.show_remember_me !== "false"}
              onCheckedChange={toggleRememberMe}
            />
          </div>
        </CardContent>
      </Card>

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
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="site_title">Titre de la plateforme</Label>
              <Input
                id="site_title"
                value={siteTitle}
                onChange={(e) => setSiteTitle(e.target.value)}
                placeholder="ARE App"
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

          <div className="space-y-2">
            <Label htmlFor="site_tagline">Description courte (tagline mobile)</Label>
            <div className="relative">
              <Input
                id="site_tagline"
                value={siteTagline}
                onChange={(e) => {
                  if (e.target.value.length <= 40) setSiteTagline(e.target.value);
                }}
                placeholder="Gestion des courriers"
                maxLength={40}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                {siteTagline.length}/40
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Affichée sous le titre dans le header mobile. Max 40 caractères.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sidebar_initials">Initiales du logo</Label>
            <Input
              id="sidebar_initials"
              value={sidebarInitials}
              onChange={(e) => setSidebarInitials(e.target.value)}
              placeholder="ARE"
              maxLength={4}
              className="max-w-32"
            />
          </div>

          {/* Favicon upload */}
          <div className="space-y-2">
            <Label>Favicon</Label>
            <div className="flex items-center gap-3">
              {faviconUrl ? (
                <div className="relative">
                  <img src={faviconUrl} alt="Favicon" className="w-10 h-10 rounded-lg object-cover border" />
                  <button
                    onClick={() => setFaviconUrl("")}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="w-10 h-10 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground">
                  <Upload className="h-4 w-4" />
                </div>
              )}
              <div className="flex flex-col gap-1.5 flex-1">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploadingFavicon}
                    onClick={() => faviconInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {uploadingFavicon ? "Upload..." : "Uploader une image"}
                  </Button>
                </div>
                <Input
                  value={faviconUrl}
                  onChange={(e) => setFaviconUrl(e.target.value)}
                  placeholder="Ou saisir une URL..."
                  className="text-xs h-8"
                />
                <input
                  ref={faviconInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFile(file, "favicon", setUploadingFavicon, setFaviconUrl);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </div>

          {/* Logo upload */}
          <div className="space-y-2">
            <Label>Logo de la barre latérale</Label>
            <div className="flex items-center gap-3">
              {sidebarLogoUrl ? (
                <div className="relative">
                  <img src={sidebarLogoUrl} alt="Logo" className="w-10 h-10 rounded-lg object-cover border" />
                  <button
                    onClick={() => setSidebarLogoUrl("")}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="w-10 h-10 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground">
                  <Upload className="h-4 w-4" />
                </div>
              )}
              <div className="flex flex-col gap-1.5 flex-1">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {uploadingLogo ? "Upload..." : "Uploader une image"}
                  </Button>
                </div>
                <Input
                  value={sidebarLogoUrl}
                  onChange={(e) => setSidebarLogoUrl(e.target.value)}
                  placeholder="Ou saisir une URL..."
                  className="text-xs h-8"
                />
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFile(file, "logo", setUploadingLogo, setSidebarLogoUrl);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Si renseigné, cette image remplacera les initiales dans la barre latérale.
            </p>
          </div>

          {/* PWA Icon upload */}
          <div className="space-y-2">
            <Label>Icône PWA (512×512)</Label>
            <div className="flex items-center gap-3">
              {pwaIconUrl ? (
                <div className="relative">
                  <img src={pwaIconUrl} alt="PWA Icon" className="w-10 h-10 rounded-lg object-cover border" />
                  <button
                    onClick={() => setPwaIconUrl("")}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="w-10 h-10 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground">
                  <Upload className="h-4 w-4" />
                </div>
              )}
              <div className="flex flex-col gap-1.5 flex-1">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploadingPwaIcon}
                    onClick={() => pwaIconInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {uploadingPwaIcon ? "Upload..." : "Uploader une icône"}
                  </Button>
                </div>
                <Input
                  value={pwaIconUrl}
                  onChange={(e) => setPwaIconUrl(e.target.value)}
                  placeholder="Ou saisir une URL..."
                  className="text-xs h-8"
                />
                <input
                  ref={pwaIconInputRef}
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFile(file, "pwa-icon", setUploadingPwaIcon, setPwaIconUrl);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Image PNG carrée 512×512 utilisée comme icône de l'application sur les appareils mobiles.
            </p>
          </div>

          {/* Login background */}
          <Separator className="my-2" />
          <p className="text-sm font-medium">Arrière-plan de la page de connexion</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Couleur de fond</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={loginBgColor}
                  onChange={(e) => setLoginBgColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border cursor-pointer p-0.5"
                />
                <Input
                  value={loginBgColor}
                  onChange={(e) => setLoginBgColor(e.target.value)}
                  placeholder="#FFFFFF"
                  className="font-mono text-xs h-10 flex-1"
                  maxLength={7}
                />
              </div>
              <p className="text-xs text-muted-foreground">Utilisé si aucune image n'est définie</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Image de fond (1920×1080)</Label>
              <div className="flex items-center gap-2">
                {loginBgImageUrl ? (
                  <div className="relative">
                    <img src={loginBgImageUrl} alt="BG" className="w-10 h-10 rounded-lg object-cover border" />
                    <button
                      onClick={() => setLoginBgImageUrl("")}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground">
                    <Upload className="h-4 w-4" />
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingLoginBg}
                  onClick={() => loginBgInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  {uploadingLoginBg ? "Upload..." : "Uploader"}
                </Button>
                <input
                  ref={loginBgInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFile(file, "login-bg", setUploadingLoginBg, setLoginBgImageUrl);
                    e.target.value = "";
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Prioritaire sur la couleur si définie</p>
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/20">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Aperçu :</span>
            {sidebarLogoUrl ? (
              <img src={sidebarLogoUrl} alt="Logo preview" className="w-9 h-9 rounded-lg object-cover" />
            ) : (
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                {sidebarInitials || "ARE"}
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{siteTitle || "ARE App"}</span>
              <span className="text-xs text-muted-foreground">{siteSubtitle || "Gestion Courrier"}</span>
            </div>
          </div>

          <Button onClick={saveBranding} className="w-full sm:w-auto">
            <Save className="h-4 w-4 mr-2" />
            Enregistrer le branding
          </Button>
        </CardContent>
      </Card>

      {/* Colors & Fonts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Type className="h-5 w-5" />
            Couleurs & Typographie
          </CardTitle>
          <CardDescription>
            Personnalisez les couleurs et les polices de la plateforme. Les changements sont appliqués en temps réel après sauvegarde.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Color pickers */}
          <div className="grid gap-4 sm:grid-cols-2">
            {colorFields.map(({ key, label, desc }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-sm font-medium">{label}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors[key] || COLOR_DEFAULTS[key]}
                    onChange={(e) => setColors((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-10 h-10 rounded-lg border cursor-pointer p-0.5"
                  />
                  <Input
                    value={colors[key] || ""}
                    onChange={(e) => setColors((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="#000000"
                    className="font-mono text-xs h-10 flex-1"
                    maxLength={7}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          {/* Font selectors */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Police des titres</Label>
              <Select value={fontHeading} onValueChange={setFontHeading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Police du texte</Label>
              <Select value={fontBody} onValueChange={setFontBody}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 rounded-lg border bg-muted/20 space-y-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Aperçu des couleurs</span>
            <div className="flex flex-wrap gap-2">
              {colorFields.map(({ key, label }) => (
                <div key={key} className="flex flex-col items-center gap-1">
                  <div
                    className="w-12 h-12 rounded-lg border shadow-sm"
                    style={{ backgroundColor: colors[key] || COLOR_DEFAULTS[key] }}
                  />
                  <span className="text-[10px] text-muted-foreground text-center leading-tight max-w-14">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={saveColors} className="flex-1 sm:flex-none">
              <Save className="h-4 w-4 mr-2" />
              Enregistrer les couleurs
            </Button>
            <Button variant="outline" onClick={resetColors}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5" />
            Clés API
          </CardTitle>
          <CardDescription>
            Générez des clés pour accéder à l'API REST publique. Les clés ne sont affichées qu'une seule fois à la création.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              placeholder="Libellé (ex: CRM interne)"
              className="flex-1"
            />
            <Button onClick={generateApiKey} disabled={generatingKey}>
              <Plus className="h-4 w-4 mr-1" />
              Générer
            </Button>
          </div>

          {generatedKey && (
            <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                ⚠️ Copiez cette clé maintenant — elle ne sera plus affichée.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded break-all font-mono">
                  {generatedKey}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedKey);
                    toast.success("Clé copiée");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                URL de base : <code className="bg-muted px-1 rounded">{APP_URL}/functions/v1/api-public</code>
              </p>
              <Button variant="ghost" size="sm" onClick={() => setGeneratedKey(null)} className="text-xs">
                Fermer
              </Button>
            </div>
          )}

          {apiKeys.length > 0 && (
            <div className="space-y-2">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className={`flex items-center justify-between py-2.5 px-3 rounded-lg border ${
                    key.is_active ? "bg-muted/30" : "bg-muted/10 opacity-50"
                  }`}
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{key.label || "Sans nom"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Créée {new Date(key.created_at).toLocaleDateString("fr-FR")}
                      {key.last_used_at && ` · Dernier usage ${new Date(key.last_used_at).toLocaleDateString("fr-FR")}`}
                      {!key.is_active && " · Révoquée"}
                    </p>
                  </div>
                  {key.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => revokeApiKey(key.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
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
