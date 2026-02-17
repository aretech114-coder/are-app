import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings, Shield } from "lucide-react";

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
          Contrôlez les fonctionnalités accessibles à l'Admin Entreprise
        </p>
      </div>

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
