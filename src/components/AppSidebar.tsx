import {
  Mail, Inbox, History, Archive, BarChart3, User, Shield, LogOut, Settings, Workflow, Plane, CalendarDays, Eye, ClipboardList,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";

const mainNav = [
  { title: "Enregistrement", url: "/mail-entry", icon: Mail, roles: ["reception", "superadmin", "admin"] },
  { title: "Registre", url: "/reception-dashboard", icon: ClipboardList, roles: ["reception"] },
  { title: "Boîte de réception", url: "/inbox", icon: Inbox, roles: ["__all__"] },
  { title: "Historique", url: "/history", icon: History, roles: ["__all__"] },
  { title: "Archives", url: "/archive", icon: Archive, roles: ["__all__"] },
  { title: "Statistiques", url: "/analytics", icon: BarChart3, roles: ["__all__"] },
  { title: "Missions", url: "/missions", icon: Plane, roles: ["__all__"] },
  { title: "Réunions", url: "/reunions", icon: CalendarDays, roles: ["__all__"] },
];

export function AppSidebar() {
  const { role, signOut, profile, hasPermission } = useAuth();
  const { settings } = useSiteSettings();

  const isSuperAdmin = role === "superadmin";
  const isAdmin = role === "admin";
  const isReception = role === "reception";
  const isMinisterOrDircab = role === "ministre" || role === "dircab" || isSuperAdmin || isAdmin;

  const canAccessAdminUsers = isSuperAdmin || (isAdmin && hasPermission("manage_users"));
  const canAccessWorkflow = isSuperAdmin || (isAdmin && hasPermission("manage_workflow"));

  const visibleNav = mainNav.filter((item) => {
    if (isSuperAdmin || isAdmin) return true;
    if (item.roles.includes("__all__") && !isReception) return true;
    return item.roles.includes(role || "");
  });

  return (
    <Sidebar className="sidebar-gradient border-r-0">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        {settings.sidebar_logo_url ? (
          <img src={settings.sidebar_logo_url} alt="Logo" className="w-9 h-9 rounded-lg object-cover" />
        ) : (
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            {settings.sidebar_initials || "CP"}
          </div>
        )}
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-sidebar-accent-foreground">{settings.site_title || "CourierPro"}</span>
          <span className="text-xs text-sidebar-foreground">{settings.site_subtitle || "Gestion Courrier"}</span>
        </div>
      </div>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs uppercase tracking-wider px-2 mb-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="text-sm">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Suivi for Ministre / DirCab */}
        {isMinisterOrDircab && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs uppercase tracking-wider px-2 mb-2 mt-4">
              Suivi
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/suivi"
                      end
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <Eye className="h-4 w-4 shrink-0" />
                      <span className="text-sm">Tableau de Suivi</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Admin section */}
        {(canAccessAdminUsers || canAccessWorkflow) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs uppercase tracking-wider px-2 mb-2 mt-4">
              Administration
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {canAccessAdminUsers && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to="/admin"
                        end
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <Shield className="h-4 w-4 shrink-0" />
                        <span className="text-sm">Gestion Utilisateurs</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canAccessWorkflow && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to="/workflow"
                        end
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <Workflow className="h-4 w-4 shrink-0" />
                        <span className="text-sm">Workflow</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* SuperAdmin only: System Configuration */}
        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs uppercase tracking-wider px-2 mb-2 mt-4">
              Système
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/system-config"
                      end
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <Settings className="h-4 w-4 shrink-0" />
                      <span className="text-sm">Configuration Système</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs uppercase tracking-wider px-2 mb-2 mt-4">
            Compte
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/profile"
                    end
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <User className="h-4 w-4 shrink-0" />
                    <span className="text-sm">Mon Profil</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    <span className="text-sm">Déconnexion</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <div className="mt-auto border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium text-sidebar-accent-foreground">
              {profile?.full_name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-sidebar-accent-foreground truncate">
                {profile?.full_name || "Agent"}
              </span>
              <span className="text-[10px] text-sidebar-foreground truncate capitalize">
                {role === "superadmin" ? "Super Admin" : role === "dircab" ? "Dir. Cabinet" : role === "ministre" ? "Ministre" : role === "secretariat" ? "Secrétariat" : role === "reception" ? "Réception" : role || "agent"}
              </span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </Sidebar>
  );
}
