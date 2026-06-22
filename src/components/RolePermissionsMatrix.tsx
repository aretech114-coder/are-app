import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Shield, Loader2, RotateCcw } from "lucide-react";
import { Constants } from "@/integrations/supabase/types";
import { getRoleLabel } from "@/lib/labels";
import {
  PERMISSION_RESOURCES,
  buildDefaultPermissionsForRole,
  type PermissionAction,
} from "@/lib/role-permissions";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface MatrixRow {
  resource_key: string;
  action: string;
  is_allowed: boolean;
}

const MANAGEABLE_ROLES = Constants.public.Enums.app_role.filter((r) => r !== "superadmin");
const ALL_ACTIONS = ["view", "create", "edit", "delete", "download", "export", "treat", "manage"] as const;

export function RolePermissionsMatrix() {
  const [selectedRole, setSelectedRole] = useState<AppRole>("agent");
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadMatrix = async (role: AppRole) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("role_permissions")
      .select("resource_key, action, is_allowed")
      .eq("role", role);
    if (error) {
      console.error("loadMatrix failed:", error);
      toast.error("Impossible de charger la matrice — migration AA appliquée ?");
      setRows(buildDefaultPermissionsForRole(role));
    } else {
      const existing = data ?? [];
      const merged: MatrixRow[] = [];
      for (const res of PERMISSION_RESOURCES) {
        for (const action of res.actions) {
          const found = existing.find((r) => r.resource_key === res.resource_key && r.action === action);
          merged.push({
            resource_key: res.resource_key,
            action,
            is_allowed:
              found?.is_allowed ??
              buildDefaultPermissionsForRole(role).find(
                (d) => d.resource_key === res.resource_key && d.action === action
              )?.is_allowed ??
              true,
          });
        }
      }
      setRows(merged);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMatrix(selectedRole);
  }, [selectedRole]);

  const isAllowed = (resource: string, action: string) =>
    rows.find((r) => r.resource_key === resource && r.action === action)?.is_allowed ?? false;

  const setAllowed = (resource: string, action: string, allowed: boolean) => {
    setRows((prev) =>
      prev.map((r) =>
        r.resource_key === resource && r.action === action ? { ...r, is_allowed: allowed } : r
      )
    );
  };

  const persistRow = async (resource: string, action: string, allowed: boolean) => {
    setSaving(true);
    const { error } = await supabase.from("role_permissions").upsert(
      {
        role: selectedRole,
        resource_key: resource,
        action,
        is_allowed: allowed,
      },
      { onConflict: "role,resource_key,action" }
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      await loadMatrix(selectedRole);
    }
  };

  const handleToggle = async (resource: string, action: string, checked: boolean) => {
    setAllowed(resource, action, checked);
    await persistRow(resource, action, checked);
  };

  const applyBulk = async (mode: "default" | "allow" | "deny") => {
    setSaving(true);
    const defaults =
      mode === "default"
        ? buildDefaultPermissionsForRole(selectedRole)
        : PERMISSION_RESOURCES.flatMap((res) =>
            res.actions.map((action) => ({
              role: selectedRole,
              resource_key: res.resource_key,
              action,
              is_allowed: mode === "allow",
            }))
          );

    const { error } = await supabase.from("role_permissions").upsert(
      defaults.map(({ role, resource_key, action, is_allowed }) => ({
        role,
        resource_key,
        action,
        is_allowed,
      })),
      { onConflict: "role,resource_key,action" }
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(
        mode === "default"
          ? "Réinitialisé au comportement par défaut"
          : mode === "allow"
            ? "Toutes les permissions accordées"
            : "Toutes les permissions révoquées"
      );
      await loadMatrix(selectedRole);
    }
  };

  const actionLabel = (action: PermissionAction) => {
    const labels: Record<string, string> = {
      view: "Voir",
      create: "Créer",
      edit: "Modifier",
      delete: "Supprimer",
      download: "Télécharger",
      export: "Exporter",
      treat: "Traiter",
      manage: "Gérer",
    };
    return labels[action] || action;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Autorisations par rôle
        </CardTitle>
        <CardDescription>
          Matrice module × action configurable par rôle. Les changements UI sont immédiats ; la
          sécurité RLS suit progressivement. Distinct des droits délégués à l&apos;Admin Entreprise.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 min-w-[220px]">
            <Label>Rôle</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANAGEABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {getRoleLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={saving} onClick={() => applyBulk("default")}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Réinitialiser au défaut
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={saving}>
                  Tout autoriser
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tout autoriser pour {getRoleLabel(selectedRole)} ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Toutes les cases seront cochées pour ce rôle.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={() => applyBulk("allow")}>Confirmer</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={saving} className="text-destructive">
                  Tout interdire
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tout interdire pour {getRoleLabel(selectedRole)} ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Le rôle perdra l&apos;accès à tous les modules configurés ici (UI uniquement tant
                    que RLS n&apos;est pas raccordée).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={() => applyBulk("deny")}>Confirmer</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
            Chargement…
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left p-3 font-medium">Module</th>
                  {ALL_ACTIONS.map((a) => (
                    <th key={a} className="p-2 text-center text-xs font-medium text-muted-foreground w-16">
                      {actionLabel(a)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_RESOURCES.map((res) => (
                  <tr key={res.resource_key} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="p-3 font-medium">{res.label}</td>
                    {ALL_ACTIONS.map((action) => {
                      const applicable = res.actions.includes(action);
                      return (
                        <td key={action} className="p-2 text-center">
                          {applicable ? (
                            <Switch
                              checked={isAllowed(res.resource_key, action)}
                              disabled={saving}
                              onCheckedChange={(checked) =>
                                handleToggle(res.resource_key, action, checked)
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
