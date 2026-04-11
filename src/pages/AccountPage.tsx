import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  LayoutDashboard,
  BarChart3,
  ClipboardList,
  User,
  Mail,
  Users,
  GitBranch,
  Settings,
  Archive,
  LogOut,
  ChevronRight,
  Moon,
} from "lucide-react";

interface MenuEntry {
  label: string;
  path: string;
  icon: React.ElementType;
  roles: string[] | "all";
  permissionKey?: string;
  excludeRoles?: string[];
}

const menuItems: MenuEntry[] = [
  { label: "Tableau de bord", path: "/", icon: LayoutDashboard, roles: ["superadmin", "admin", "ministre", "dircab"] },
  { label: "Statistiques", path: "/analytics", icon: BarChart3, roles: "all", excludeRoles: ["reception"] },
  { label: "Tableau de suivi", path: "/suivi", icon: ClipboardList, roles: ["ministre", "dircab", "superadmin", "admin"] },
  { label: "Profil", path: "/profile", icon: User, roles: "all" },
  { label: "Enregistrement", path: "/mail-entry", icon: Mail, roles: ["reception", "admin", "superadmin"] },
  { label: "Administration", path: "/admin", icon: Users, roles: ["superadmin"], permissionKey: "manage_users" },
  { label: "Workflow", path: "/workflow", icon: GitBranch, roles: ["superadmin"], permissionKey: "manage_workflow" },
  { label: "Configuration système", path: "/system-config", icon: Settings, roles: ["superadmin"] },
  { label: "Archives", path: "/archive", icon: Archive, roles: "all", excludeRoles: ["reception"] },
];

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, role, profile, signOut, hasPermission } = useAuth();
  const { settings } = useSiteSettings();

  const visibleItems = menuItems.filter((item) => {
    if (!role) return false;
    if (item.excludeRoles?.includes(role)) return false;
    if (item.roles === "all") return true;
    if (item.roles.includes(role)) return true;
    // Admin with specific permission
    if (role === "admin" && item.permissionKey && hasPermission(item.permissionKey)) return true;
    return false;
  });

  const initials = (profile?.full_name || user?.email || "U")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const roleLabels: Record<string, string> = {
    superadmin: "Super Administrateur",
    admin: "Administrateur",
    ministre: "Ministre",
    dircab: "Directeur de Cabinet",
    dircaba: "Dir. Cab. Adjoint",
    conseiller: "Conseiller",
    conseiller_juridique: "Conseiller Juridique",
    secretariat: "Secrétariat",
    supervisor: "Superviseur",
    agent: "Agent",
    reception: "Réception",
  };

  return (
    <div className="space-y-6 pb-24 animate-fade-in">
      {/* User header */}
      <div className="flex items-center gap-4 p-4 rounded-xl border bg-card">
        <Avatar className="h-14 w-14">
          <AvatarImage src={profile?.avatar_url} />
          <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-lg">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base truncate">{profile?.full_name || "Utilisateur"}</p>
          <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {roleLabels[role || ""] || role}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <p className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">Navigation</p>
        {visibleItems.map((item, i) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors ${
              i < visibleItems.length - 1 ? "border-b" : ""
            }`}
          >
            <item.icon className="h-5 w-5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1">{item.label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </button>
        ))}
      </div>

      {/* Preferences */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <p className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">Préférences</p>
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Moon className="h-5 w-5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium flex-1">Mode sombre</span>
          <ThemeToggle />
        </div>
        <button
          onClick={() => navigate("/profile")}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
        >
          <User className="h-5 w-5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium flex-1">Modifier le mot de passe</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
        </button>
      </div>

      {/* Logout */}
      <Button
        variant="destructive"
        className="w-full"
        onClick={async () => {
          await signOut();
          navigate("/auth");
        }}
      >
        <LogOut className="h-4 w-4 mr-2" />
        Se déconnecter
      </Button>
    </div>
  );
}
