import { useLocation, useNavigate } from "react-router-dom";
import { Inbox, CalendarDays, History, Plane, User } from "lucide-react";

const tabs = [
  { label: "Réception", path: "/inbox", icon: Inbox },
  { label: "Réunions", path: "/reunions", icon: CalendarDays },
  { label: "Historique", path: "/history", icon: History },
  { label: "Missions", path: "/missions", icon: Plane },
  { label: "Compte", path: "/profile", icon: User },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path || location.pathname.startsWith(tab.path + "/");
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <tab.icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className={`text-[10px] leading-tight ${isActive ? "font-semibold" : ""}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
