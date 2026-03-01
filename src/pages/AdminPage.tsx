import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, UserPlus, Loader2, RefreshCw } from "lucide-react";

const ROLES = [
  { value: "superadmin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "supervisor", label: "Superviseur" },
  { value: "agent", label: "Agent" },
  { value: "ministre", label: "Ministre" },
  { value: "dircab", label: "Directeur de Cabinet" },
  { value: "dircaba", label: "Dir. Cabinet Adjoint" },
  { value: "conseiller_juridique", label: "Conseiller Juridique" },
  { value: "secretariat", label: "Secrétariat" },
];

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
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("agent");

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*, user_roles(role)")
      .order("created_at", { ascending: false });
    setUsers(profiles || []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

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
      const { data: { session } } = await supabase.auth.getSession();
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
        fetchUsers();
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur inattendue");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="page-header flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Gestion des Utilisateurs
        </h1>
        <p className="page-description">Créez et gérez les comptes utilisateurs du système</p>
      </div>

      {/* Creation Form */}
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
              <Input
                id="fullName"
                placeholder="Jean Dupont"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="jean@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select value={role} onValueChange={setRole} disabled={creating}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Aucun utilisateur
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => {
                  const userRole = u.user_roles?.[0]?.role || "agent";
                  const roleLabel = ROLES.find((r) => r.value === userRole)?.label || userRole;
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
                        <Badge variant={roleBadgeVariant(userRole) as any}>{roleLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("fr-FR")}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
