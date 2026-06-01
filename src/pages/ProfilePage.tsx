import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Camera, Lock, Save, LogOut, UserCheck, UserX } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export default function ProfilePage() {
  const { user, profile, role, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean>(true);
  const [savingAvailability, setSavingAvailability] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("is_available")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data && (data as any).is_available !== undefined) {
          setIsAvailable(((data as any).is_available as boolean) ?? true);
        }
      });
  }, [user]);

  const toggleAvailability = async (next: boolean) => {
    if (!user) return;
    setSavingAvailability(true);
    setIsAvailable(next);
    const { error } = await supabase
      .from("profiles")
      .update({ is_available: next } as any)
      .eq("id", user.id);
    if (error) {
      toast.error(error.message);
      setIsAvailable(!next);
    } else {
      toast.success(next ? "Vous êtes maintenant disponible" : "Vous êtes marqué comme absent");
    }
    setSavingAvailability(false);
  };

  const updateProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    if (error) toast.error(error.message);
    else toast.success("Profil mis à jour");
    setSaving(false);
  };

  const changePassword = async () => {
    if (!currentPassword) {
      toast.error("Veuillez saisir votre mot de passe actuel");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      toast.error("Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial");
      return;
    }

    setChangingPassword(true);
    try {
      // Verify current password
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });
      if (verifyError) {
        toast.error("Mot de passe actuel incorrect");
        setChangingPassword(false);
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Mot de passe mis à jour");
        if (user) {
          await supabase.from("profiles").update({ password_changed_at: new Date().toISOString(), first_login: false }).eq("id", user.id);
        }
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      toast.error("Erreur lors du changement de mot de passe");
    } finally {
      setChangingPassword(false);
    }
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const path = `${user.id}/avatar.${file.name.split(".").pop()}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadError) { toast.error(uploadError.message); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    toast.success("Photo de profil mise à jour");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header">Mon Profil</h1>
        <p className="page-description">Gérez vos informations et votre sécurité</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Informations Personnelles</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">
                  {profile?.full_name?.charAt(0)?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <label className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors">
                <Camera className="h-3 w-3" />
                <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
              </label>
            </div>
            <div>
              <p className="font-medium">{profile?.full_name || "Agent"}</p>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">Rôle : {role}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nom complet</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <Button onClick={updateProfile} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            {isAvailable ? <UserCheck className="h-5 w-5 text-success" /> : <UserX className="h-5 w-5 text-destructive" />}
            Disponibilité
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">
                {isAvailable ? "Disponible" : "Absent / Indisponible"}
              </p>
              <p className="text-xs text-muted-foreground">
                Quand vous êtes marqué absent, le workflow bascule automatiquement vers le suppléant configuré (si existant).
              </p>
            </div>
            <Switch checked={isAvailable} onCheckedChange={toggleAvailability} disabled={savingAvailability} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Sécurité</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Mot de passe actuel</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <Label>Nouveau mot de passe</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <Label>Confirmer le nouveau mot de passe</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <p className="text-xs text-muted-foreground">
            Min. 8 caractères, 1 majuscule, 1 chiffre, 1 caractère spécial.
          </p>
          <Button variant="outline" onClick={changePassword} disabled={changingPassword}>
            <Lock className="h-4 w-4 mr-2" />
            {changingPassword ? "Vérification..." : "Changer le mot de passe"}
          </Button>
        </CardContent>
      </Card>

      {/* Déconnexion */}
      <Card className="border-destructive/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Se déconnecter</p>
              <p className="text-xs text-muted-foreground">Fermer votre session sur cet appareil</p>
            </div>
            <Button variant="destructive" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Déconnexion
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
