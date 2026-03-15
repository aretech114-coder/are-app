import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Menu, User, LogOut, Settings, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const { impersonatedUser, isImpersonating, stopImpersonation } = useImpersonation();
  const navigate = useNavigate();

  // When impersonating, show impersonated user info
  const displayName = isImpersonating ? impersonatedUser!.full_name : (profile?.full_name || "Agent");
  const displayRole = isImpersonating ? impersonatedUser!.role : role;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          {/* Impersonation Banner */}
          {isImpersonating && (
            <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-medium shrink-0">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                <span>
                  Vous voyez l'application en tant que <strong>{impersonatedUser!.full_name}</strong> ({impersonatedUser!.role})
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={stopImpersonation}
                className="h-7 px-2 text-amber-950 hover:bg-amber-600 hover:text-amber-950"
              >
                <X className="h-4 w-4 mr-1" />
                Quitter
              </Button>
            </div>
          )}
          <header className="h-14 flex items-center justify-between border-b px-4 bg-card shrink-0">
            <SidebarTrigger>
              <Menu className="h-5 w-5" />
            </SidebarTrigger>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 hover:opacity-80 transition-opacity outline-none">
                <span className="text-sm text-muted-foreground hidden sm:block">
                  {displayName}
                </span>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={isImpersonating ? undefined : profile?.avatar_url} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {displayName?.charAt(0)?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {displayRole === "superadmin" ? "Super Admin" : displayRole || "agent"}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <User className="h-4 w-4 mr-2" /> Mon Profil
                </DropdownMenuItem>
                {role === "superadmin" && (
                  <DropdownMenuItem onClick={() => navigate("/system-config")}>
                    <Settings className="h-4 w-4 mr-2" /> Configuration
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <div className="flex-1 overflow-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
