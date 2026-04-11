import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Menu, User, LogOut, Settings } from "lucide-react";

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const displayName = profile?.full_name || "Agent";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {/* Sidebar hidden on mobile */}
        <div className="hidden md:flex">
          <AppSidebar />
        </div>
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b px-4 bg-card shrink-0">
            {!isMobile ? (
              <SidebarTrigger>
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
            ) : (
              <span className="text-sm font-semibold truncate">ARE App</span>
            )}
            {/* Avatar dropdown hidden on mobile (replaced by Compte tab) */}
            <div className="hidden md:block">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 hover:opacity-80 transition-opacity outline-none">
                  <span className="text-sm text-muted-foreground hidden sm:block">
                    {displayName}
                  </span>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {displayName?.charAt(0)?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{displayName}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {role === "superadmin" ? "Super Admin" : role || "agent"}
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
            </div>
          </header>
          <div className={`flex-1 overflow-auto p-3 md:p-6 ${isMobile ? "pb-20" : ""}`}>
            {children}
          </div>
        </main>
        {/* Mobile bottom navigation */}
        {isMobile && <MobileBottomNav />}
      </div>
    </SidebarProvider>
  );
}
