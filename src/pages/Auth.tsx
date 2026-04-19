import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Mail, Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { settings } = useSiteSettings();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Connexion réussie");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const hasBgImage = !!settings.login_bg_image_url;
  const bgStyle: React.CSSProperties = hasBgImage
    ? {
        backgroundImage: `url(${settings.login_bg_image_url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }
    : settings.login_bg_color && settings.login_bg_color !== "#FFFFFF"
    ? { backgroundColor: settings.login_bg_color }
    : {};

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={bgStyle}>
      {hasBgImage && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/40" />
      )}
      <div className="w-full max-w-md animate-fade-in relative z-10">
        <Card className={hasBgImage ? "bg-card/70 backdrop-blur-xl border-white/20 shadow-2xl" : ""}>
          <CardHeader className="text-center items-center">
            {settings.sidebar_logo_url ? (
              <img src={settings.sidebar_logo_url} alt="Logo" className="w-14 h-14 rounded-2xl mx-auto mb-3 object-cover" />
            ) : (
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-xl mx-auto mb-3">
                {settings.sidebar_initials || "ARE"}
              </div>
            )}
            <h1 className="text-xl font-bold text-foreground">{settings.site_title || "ARE App"}</h1>
            <p className="text-xs text-muted-foreground -mt-1">Système de Gestion Électronique du Courrier</p>
            <div className="w-12 h-px bg-border my-2" />
            <CardTitle className="text-lg">Connexion</CardTitle>
            <CardDescription>Accédez à votre espace de travail</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="agent@are-app.cloud"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {settings.show_remember_me !== "false" && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                  />
                  <Label htmlFor="remember" className="text-sm cursor-pointer">
                    Se souvenir de moi
                  </Label>
                </div>
              )}
              {settings.show_forgot_password !== "false" && (
                <div className="flex items-center justify-between">
                  <Link
                    to="/forgot-password"
                    className="text-sm text-primary hover:underline"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Chargement..." : "Se connecter"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
