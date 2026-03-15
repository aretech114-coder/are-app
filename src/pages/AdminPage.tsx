import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Constants } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, UserPlus, Loader2, RefreshCw, Pencil, Plus, Tags, DatabaseBackup } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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

export default function AdminPage() {
  const { role: currentUserRole } = useAuth();
  const isSuperAdmin = currentUserRole === "superadmin";
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

  const fetchRoles = async () => {
    setRolesLoading(true);
    try {
      // Primary source: enum values from generated types (always reliable)
      const enumValues = Constants.public.Enums.app_role;
      const roles = enumValues.map((value: string) => ({
        value,
        label: DEFAULT_ROLE_LABELS[value] || value,
      }));
      setAllRoles(roles);

      // Try to enrich with dynamic roles from edge function
      try {
        const res = await supabase.functions.invoke("manage-roles", {
          body: { action: "list" },
        });
        if (res.data?.roles) {
          const dynamicRoles = res.data.roles.map((r: any) => ({
            value: typeof r === "string" ? r : r.value,
            label: DEFAULT_ROLE_LABELS[typeof r === "string" ? r : r.value] || (typeof r === "string" ? r : r.value),
          }));
          // Merge: keep all enum roles + add any dynamic ones not already present
          const existingValues = new Set(roles.map((r: any) => r.value));
          const merged = [...roles, ...dynamicRoles.filter((r: any) => !existingValues.has(r.value))];
          setAllRoles(merged);
        }
      } catch {
        // Edge function failed, enum values are already set — no problem
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
        console.error("[AdminPage] Erreur profiles:", profilesRes.error.message, profilesRes.error);
        toast.error("Erreur chargement profils: " + profilesRes.error.message);
      }
      if (rolesRes.error) {
        console.error("[AdminPage] Erreur user_roles:", rolesRes.error.message, rolesRes.error);
      }
      
      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];
      console.log("[AdminPage] Profils chargés:", profiles.length, "| Rôles chargés:", roles.length);
      
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

  useEffect(() => {
    fetchRoles();
    fetchUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
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
        // Small delay to allow the database trigger to create the profile/role
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
        // Update local label map and refresh
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
    setSaving(true);
    try {
      const body: any = { user_id: editUser.id };
      if (editFullName !== editUser.full_name) body.full_name = editFullName;
      if (editEmail !== editUser.email) body.email = editEmail;
      if (editPassword) body.password = editPassword;
      const currentRole = editUser.user_roles?.[0]?.role || "agent";
      if (editRole !== currentRole) body.role = editRole;

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
      const res = await supabase.functions.invoke("sync-users");
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

  const getRoleLabel = (roleValue: string) => {
    return allRoles.find((r) => r.value === roleValue)?.label || DEFAULT_ROLE_LABELS[roleValue] || roleValue;
  };

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
          {/* Creation Form - Only for SuperAdmin */}
          {isSuperAdmin && (
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

          {/* Users Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Utilisateurs ({users.length})</CardTitle>
                <CardDescription>Liste de tous les comptes enregistrés</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Inscrit le</TableHead>
                    <TableHead className="w-12"></TableHead>
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
                            <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
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
          {/* Create Role */}
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

          {/* Roles List */}
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
            <DialogDescription>Modifiez les informations ci-dessous. Laissez le mot de passe vide pour ne pas le changer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editFullName">Nom complet</Label>
              <Input id="editFullName" value={editFullName} onChange={(e) => setEditFullName(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEmail">Email</Label>
              <Input id="editEmail" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editPassword">Nouveau mot de passe</Label>
              <Input id="editPassword" type="password" placeholder="Laisser vide pour ne pas changer" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select value={editRole} onValueChange={setEditRole} disabled={saving}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allRoles.filter(r => isSuperAdmin ? r.value !== "superadmin" : r.value !== "superadmin").map((r) => (
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
    </div>
  );
}
