import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

import { Constants } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, UserPlus, Loader2, RefreshCw, Pencil, Plus, Tags, DatabaseBackup, Trash2, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DEFAULT_ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  supervisor: "Superviseur",
  agent: "Agent",
  ministre: "Ministre",
  dircab: "Directeur de Cabinet",
  dircaba: "Dir. Cabinet Adjoint",
  conseiller_juridique: "Conseiller Juridique",
  secretariat: "Secrétariat",
};

const roleBadgeVariant = (role: string) => {
  switch (role) {
    case "superadmin": return "destructive";
    case "admin": return "default";
    case "ministre":
    case "dircab": return "secondary";
    default: return "outline";
  }
};

const ADMIN_USER_PERMISSION_KEYS = [
  "manage_users",
  "create_users",
  "edit_users",
  "delete_users",
  "impersonate_users",
  "reset_passwords",
] as const;

interface AdminUserPermission {
  id: string;
  permission_key: typeof ADMIN_USER_PERMISSION_KEYS[number];
  label: string;
  description: string | null;
  is_enabled: boolean;
}

export default function AdminPage() {
  const { role: currentUserRole, user, hasPermission } = useAuth();
  const [impersonateTarget, setImpersonateTarget] = useState<any>(null);
  const [impersonating, setImpersonating] = useState(false);
  const isSuperAdmin = currentUserRole === "superadmin";
  const isAdmin = currentUserRole === "admin";

  const canAccessUserManagement = isSuperAdmin || (isAdmin && hasPermission("manage_users"));
  const canCreateUsers = isSuperAdmin || (isAdmin && hasPermission("create_users"));
  const canEditUsers = isSuperAdmin || (isAdmin && hasPermission("edit_users"));
  const canDeleteUsers = isSuperAdmin || (isAdmin && hasPermission("delete_users"));
  const canResetPasswords = isSuperAdmin || (isAdmin && hasPermission("reset_passwords"));
  const canImpersonate = isSuperAdmin || (isAdmin && hasPermission("impersonate_users"));
  const canOpenEditDialog = canEditUsers || canResetPasswords;

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("agent");

  // Dynamic roles
  const [allRoles, setAllRoles] = useState<{ value: string; label: string }[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // New role creation
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  // SuperAdmin toggles for Admin user-management capabilities
  const [adminUserPermissions, setAdminUserPermissions] = useState<AdminUserPermission[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);

  const fetchRoles = async () => {
    setRolesLoading(true);
    try {
      const enumValues = Constants.public.Enums.app_role;
      const roles = enumValues.map((value: string) => ({
        value,
        label: DEFAULT_ROLE_LABELS[value] || value,
      }));
      setAllRoles(roles);

      try {
        const res = await supabase.functions.invoke("manage-roles", {
          body: { action: "list" },
        });
        if (res.data?.roles) {
          const dynamicRoles = res.data.roles.map((r: any) => ({
            value: typeof r === "string" ? r : r.value,
            label: DEFAULT_ROLE_LABELS[typeof r === "string" ? r : r.value] || (typeof r === "string" ? r : r.value),
          }));
          const existingValues = new Set(roles.map((r: any) => r.value));
          const merged = [...roles, ...dynamicRoles.filter((r: any) => !existingValues.has(r.value))];
          setAllRoles(merged);
        }
      } catch {
        // Edge function failed, enum values are already set
      }
    } catch {
      setAllRoles(Object.entries(DEFAULT_ROLE_LABELS).map(([value, label]) => ({ value, label })));
    } finally {
      setRolesLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);

      if (profilesRes.error) {
        console.error("[AdminPage] Erreur profiles:", profilesRes.error.message);
        toast.error("Erreur chargement profils: " + profilesRes.error.message);
      }
      if (rolesRes.error) {
        console.error("[AdminPage] Erreur user_roles:", rolesRes.error.message);
      }

      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];
      const rolesMap = new Map(roles.map((r: any) => [r.user_id, r.role]));
      const merged = profiles.map((p: any) => ({
        ...p,
        user_roles: rolesMap.has(p.id) ? [{ role: rolesMap.get(p.id) }] : [],
      }));
      setUsers(merged);
    } catch (err: any) {
      console.error("[AdminPage] Erreur inattendue fetchUsers:", err);
      toast.error("Erreur chargement: " + (err.message || "connexion échouée"));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminUserPermissions = async () => {
    if (!isSuperAdmin) return;

    setPermissionsLoading(true);
    const { data, error } = await supabase
      .from("admin_permissions")
      .select("id, permission_key, label, description, is_enabled")
      .in("permission_key", [...ADMIN_USER_PERMISSION_KEYS]);

    if (error) {
      toast.error("Erreur chargement permissions admin: " + error.message);
      setPermissionsLoading(false);
      return;
    }

    const order = new Map(ADMIN_USER_PERMISSION_KEYS.map((key, index) => [key, index]));
    const sorted = (data || []).sort(
      (a: any, b: any) => (order.get(a.permission_key as any) ?? 999) - (order.get(b.permission_key as any) ?? 999)
    ) as AdminUserPermission[];

    setAdminUserPermissions(sorted);
    setPermissionsLoading(false);
  };

  const toggleAdminUserPermission = async (permissionId: string, currentValue: boolean) => {
    const { error } = await supabase
      .from("admin_permissions")
      .update({ is_enabled: !currentValue })
      .eq("id", permissionId);

    if (error) {
      toast.error("Impossible de mettre à jour la permission: " + error.message);
      return;
    }

    setAdminUserPermissions((prev) =>
      prev.map((permission) =>
        permission.id === permissionId
          ? { ...permission, is_enabled: !currentValue }
          : permission
      )
    );

    toast.success("Permission admin mise à jour");
  };

  useEffect(() => {
    fetchRoles();
    fetchUsers();
    if (isSuperAdmin) fetchAdminUserPermissions();
  }, [isSuperAdmin]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canCreateUsers) {
      toast.error("Vous n'avez pas la permission de créer des utilisateurs");
      return;
    }

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      toast.error("Tous les champs sont requis");
      return;
    }
    if (password.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }

    setCreating(true);
    try {
      const res = await supabase.functions.invoke("create-user", {
        body: { email: email.trim(), password, full_name: fullName.trim(), role },
      });

      if (res.error) {
        toast.error(res.error.message || "Erreur lors de la création");
      } else if (res.data?.error) {
        toast.error(res.data.error);
      } else {
        toast.success(`Utilisateur "${fullName}" créé avec succès`);
        setFullName("");
        setEmail("");
        setPassword("");
        setRole("agent");
        setTimeout(() => fetchUsers(), 1500);
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur inattendue");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim() || !newRoleLabel.trim()) {
      toast.error("Le nom technique et le libellé sont requis");
      return;
    }

    setCreatingRole(true);
    try {
      const res = await supabase.functions.invoke("manage-roles", {
        body: { action: "create", role_name: newRoleName.trim().toLowerCase(), role_label: newRoleLabel.trim() },
      });

      if (res.error) {
        toast.error(res.error.message || "Erreur");
      } else if (res.data?.error) {
        toast.error(res.data.error);
      } else {
        toast.success(`Rôle "${newRoleLabel}" créé avec succès`);
        setNewRoleName("");
        setNewRoleLabel("");
        DEFAULT_ROLE_LABELS[newRoleName.trim().toLowerCase()] = newRoleLabel.trim();
        fetchRoles();
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur inattendue");
    } finally {
      setCreatingRole(false);
    }
  };

  const openEdit = (u: any) => {
    const userRole = u.user_roles?.[0]?.role || "agent";
    setEditUser(u);
    setEditFullName(u.full_name || "");
    setEditEmail(u.email || "");
    setEditPassword("");
    setEditRole(userRole);
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editUser) return;

    if (!canOpenEditDialog) {
      toast.error("Vous n'avez pas la permission de modifier cet utilisateur");
      return;
    }

    setSaving(true);
    try {
      const body: any = { user_id: editUser.id };
      const currentRole = editUser.user_roles?.[0]?.role || "agent";

      if (canEditUsers) {
        if (editFullName !== editUser.full_name) body.full_name = editFullName;
        if (editEmail !== editUser.email) body.email = editEmail;
        if (editRole !== currentRole) body.role = editRole;
      }

      if (canResetPasswords && editPassword) {
        body.password = editPassword;
      }

      if (Object.keys(body).length === 1) {
        toast.error("Aucune modification autorisée à enregistrer");
        setSaving(false);
        return;
      }

      const res = await supabase.functions.invoke("update-user", { body });
      if (res.error) {
        toast.error(res.error.message || "Erreur");
      } else if (res.data?.error) {
        toast.error(res.data.error);
      } else {
        toast.success("Utilisateur mis à jour");
        setEditOpen(false);
        fetchUsers();
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur inattendue");
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      let res = await supabase.functions.invoke("sync-users", { body: {} });

      // Fallback HTTP call for environments where invoke() fails with transport-level errors
      if (res.error?.message?.toLowerCase().includes("failed to send a request")) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          toast.error("Session expirée. Reconnectez-vous puis relancez la synchronisation.");
          return;
        }

        const fallbackResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({}),
        });

        const fallbackData = await fallbackResponse.json().catch(() => ({}));

        if (!fallbackResponse.ok) {
          toast.error(fallbackData?.error || `Erreur de synchronisation (${fallbackResponse.status})`);
          return;
        }

        res = { data: fallbackData, error: null } as any;
      }

      if (res.error) {
        toast.error(res.error.message || "Erreur de synchronisation");
      } else if (res.data?.error) {
        toast.error(res.data.error);
      } else {
        const { profiles_created, roles_created, auth_users_total } = res.data;
        if (profiles_created === 0 && roles_created === 0) {
          toast.success(`Tout est synchronisé (${auth_users_total} utilisateurs)`);
        } else {
          toast.success(`Synchronisé : ${profiles_created} profil(s) et ${roles_created} rôle(s) créé(s)`);
        }
        fetchUsers();
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur inattendue");
    } finally {
      setSyncing(false);
    }
  };

  const openDeleteDialog = (u: any) => {
    setDeleteUser(u);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteUser) return;

    if (!canDeleteUsers) {
      toast.error("Vous n'avez pas la permission de supprimer des utilisateurs");
      return;
    }

    setDeleting(true);
    try {
      const res = await supabase.functions.invoke("delete-user", {
        body: { user_id: deleteUser.id },
      });
      if (res.error) {
        toast.error(res.error.message || "Erreur de suppression");
      } else if (res.data?.error) {
        toast.error(res.data.error);
      } else {
        toast.success(`Utilisateur "${deleteUser.full_name}" supprimé`);
        setDeleteOpen(false);
        setDeleteUser(null);
        fetchUsers();
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur inattendue");
    } finally {
      setDeleting(false);
    }
  };

  const handleImpersonate = (u: any) => {
    if (!canImpersonate) {
      toast.error("Vous n'avez pas la permission d'impersonation");
      return;
    }
    setImpersonateTarget(u);
  };

  const confirmImpersonate = async () => {
    if (!impersonateTarget) return;
    setImpersonating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        toast.error("Session expirée. Reconnectez-vous.");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/impersonate-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            target_user_id: impersonateTarget.id,
            redirect_url: window.location.origin,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "Erreur d'impersonation");
        return;
      }

      if (result.url) {
        window.open(result.url, "_blank");
        toast.success(`Onglet ouvert en tant que ${impersonateTarget.full_name}`);
      } else {
        toast.error("Lien d'accès non généré");
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur inattendue");
    } finally {
      setImpersonating(false);
      setImpersonateTarget(null);
    }
  };

  const getRoleLabel = (roleValue: string) => {
    return allRoles.find((r) => r.value === roleValue)?.label || DEFAULT_ROLE_LABELS[roleValue] || roleValue;
  };

  if (!canAccessUserManagement) {
    return (
      <div className="animate-fade-in space-y-2">
        <h1 className="page-header">Gestion des Utilisateurs</h1>
        <p className="page-description">Accès refusé : activez la permission « Gérer les utilisateurs » pour le rôle Admin.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="page-header flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Gestion des Utilisateurs & Rôles
        </h1>
        <p className="page-description">Créez et gérez les comptes utilisateurs et les rôles du système</p>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Utilisateurs
          </TabsTrigger>
          {isSuperAdmin && (
          <TabsTrigger value="roles" className="flex items-center gap-2">
            <Tags className="h-4 w-4" />
            Rôles
          </TabsTrigger>
          )}
        </TabsList>

        {/* ========== USERS TAB ========== */}
        <TabsContent value="users" className="space-y-6">
          {/* Creation Form - SuperAdmin or Admin with explicit permission */}
          {canCreateUsers && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="h-5 w-5" />
                Créer un utilisateur
              </CardTitle>
              <CardDescription>
                Le compte sera actif immédiatement (email confirmé automatiquement)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nom complet</Label>
                  <Input id="fullName" placeholder="Jean Dupont" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={creating} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="jean@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={creating} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={creating} />
                </div>
                <div className="space-y-2">
                  <Label>Rôle</Label>
                  <Select value={role} onValueChange={setRole} disabled={creating}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allRoles.filter(r => r.value !== "superadmin").map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={creating} className="h-10">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  <span className="ml-2">{creating ? "Création..." : "Créer"}</span>
                </Button>
              </form>
            </CardContent>
          </Card>
          )}

          {/* SuperAdmin toggles for Admin user-management rights */}
          {isSuperAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Droits Admin • Gestion des utilisateurs</CardTitle>
                <CardDescription>
                  Activez précisément ce que le rôle Admin peut faire : accès, ajout, modification, suppression, impersonation et reset mot de passe.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {permissionsLoading ? (
                  <div className="flex items-center justify-center py-4 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Chargement des permissions...
                  </div>
                ) : (
                  adminUserPermissions.map((permission) => (
                    <div
                      key={permission.id}
                      className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3"
                    >
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">{permission.label}</Label>
                        {permission.description && (
                          <p className="text-xs text-muted-foreground">{permission.description}</p>
                        )}
                      </div>
                      <Switch
                        checked={permission.is_enabled}
                        onCheckedChange={() => toggleAdminUserPermission(permission.id, permission.is_enabled)}
                      />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {/* Users Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Utilisateurs ({users.length})</CardTitle>
                <CardDescription>Liste de tous les comptes enregistrés</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {isSuperAdmin && (
                  <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} title="Synchroniser les utilisateurs manquants">
                    <DatabaseBackup className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
                    {syncing ? "Sync..." : "Sync"}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Inscrit le</TableHead>
                    <TableHead className="w-32 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Aucun utilisateur
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((u) => {
                      const userRole = u.user_roles?.[0]?.role || "agent";
                      const isSelf = u.id === user?.id;
                      const isTargetSuperAdmin = userRole === "superadmin";
                      return (
                        <TableRow key={u.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={u.avatar_url} />
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                  {u.full_name?.charAt(0)?.toUpperCase() || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-medium">{u.full_name || "Sans nom"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                          <TableCell>
                            <Badge variant={roleBadgeVariant(userRole) as any}>{getRoleLabel(userRole)}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(u.created_at).toLocaleDateString("fr-FR")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {/* Impersonate button - not on self, admin can't impersonate superadmin */}
                              {canImpersonate && !isSelf && !(isAdmin && isTargetSuperAdmin) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleImpersonate(u)}
                                  title={`Voir en tant que ${u.full_name}`}
                                  className="h-8 w-8"
                                >
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              )}
                              {/* Edit button - requires edit/reset permission; admin can't edit superadmin */}
                              {canOpenEditDialog && !(isAdmin && isTargetSuperAdmin) && (
                                <Button variant="ghost" size="icon" onClick={() => openEdit(u)} className="h-8 w-8">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {/* Delete button - requires delete permission, not self, not superadmin target */}
                              {canDeleteUsers && !isSelf && !isTargetSuperAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openDeleteDialog(u)}
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  title="Supprimer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== ROLES TAB ========== */}
        <TabsContent value="roles" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="h-5 w-5" />
                Créer un nouveau rôle
              </CardTitle>
              <CardDescription>
                Ajoutez un nouveau type de rôle au système. Le nom technique sera utilisé en interne.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateRole} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="newRoleName">Nom technique</Label>
                  <Input
                    id="newRoleName"
                    placeholder="chef_service"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    disabled={creatingRole}
                  />
                  <p className="text-xs text-muted-foreground">Lettres minuscules, chiffres et underscores uniquement</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newRoleLabel">Libellé affiché</Label>
                  <Input
                    id="newRoleLabel"
                    placeholder="Chef de Service"
                    value={newRoleLabel}
                    onChange={(e) => setNewRoleLabel(e.target.value)}
                    disabled={creatingRole}
                  />
                </div>
                <Button type="submit" disabled={creatingRole} className="h-10">
                  {creatingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span className="ml-2">{creatingRole ? "Création..." : "Créer le rôle"}</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Rôles du système ({allRoles.length})</CardTitle>
                <CardDescription>Liste de tous les rôles disponibles</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchRoles} disabled={rolesLoading}>
                <RefreshCw className={`h-4 w-4 ${rolesLoading ? "animate-spin" : ""}`} />
              </Button>
            </CardHeader>
            <CardContent>
              {rolesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {allRoles.map((r) => {
                    const isDefault = !!DEFAULT_ROLE_LABELS[r.value];
                    const usersWithRole = users.filter((u) => u.user_roles?.[0]?.role === r.value).length;
                    return (
                      <div
                        key={r.value}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={roleBadgeVariant(r.value) as any}>{r.label}</Badge>
                            {isDefault && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">système</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono">{r.value}</p>
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">{usersWithRole}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l'utilisateur</DialogTitle>
            <DialogDescription>
              {canEditUsers
                ? "Modifiez les informations ci-dessous. Laissez le mot de passe vide pour ne pas le changer."
                : "Vous pouvez uniquement définir un nouveau mot de passe pour cet utilisateur."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editFullName">Nom complet</Label>
              <Input
                id="editFullName"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                disabled={saving || !canEditUsers}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEmail">Email</Label>
              <Input
                id="editEmail"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                disabled={saving || !canEditUsers}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editPassword">Nouveau mot de passe</Label>
              <Input
                id="editPassword"
                type="password"
                placeholder={canResetPasswords ? "Laisser vide pour ne pas changer" : "Permission reset requise"}
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                disabled={saving || !canResetPasswords}
              />
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select value={editRole} onValueChange={setEditRole} disabled={saving || !canEditUsers}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allRoles.filter(r => r.value !== "superadmin").map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'utilisateur</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{deleteUser?.full_name}</strong> ({deleteUser?.email}) ? 
              Cette action est irréversible. Le compte, le profil et le rôle seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Impersonate Confirmation */}
      <AlertDialog open={!!impersonateTarget} onOpenChange={(open) => { if (!open) setImpersonateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Se connecter en tant que</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous ouvrir un nouvel onglet connecté en tant que <strong>{impersonateTarget?.full_name}</strong> ({impersonateTarget?.email}) ?
              Votre session actuelle restera intacte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={impersonating}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImpersonate} disabled={impersonating}>
              {impersonating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              Ouvrir la session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
