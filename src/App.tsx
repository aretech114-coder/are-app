// Git flow verify: ce commit doit apparaître dans develop uniquement
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SiteSettingsProvider } from "@/hooks/useSiteSettings";

import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import MailEntry from "./pages/MailEntry";
import InboxPage from "./pages/InboxPage";
import HistoryPage from "./pages/HistoryPage";
import ArchivePage from "./pages/ArchivePage";
import AnalyticsPage from "./pages/AnalyticsPage";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import SystemConfigPage from "./pages/SystemConfigPage";
import WorkflowPage from "./pages/WorkflowPage";
import MissionsPage from "./pages/MissionsPage";
import ReunionsPage from "./pages/ReunionsPage";
import SuiviPage from "./pages/SuiviPage";
import ReceptionDashboard from "./pages/ReceptionDashboard";
import RegistrePage from "./pages/RegistrePage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotFound from "./pages/NotFound";
import IntegrationsPage from "./pages/IntegrationsPage";
import NotificationsTestPage from "./pages/NotificationsTestPage";
import AuditLogPage from "./pages/AuditLogPage";
import AccountPage from "./pages/AccountPage";
import { useWorkflowTrackingAccess } from "@/hooks/useWorkflowTrackingAccess";
import { canAccessSuiviPage } from "@/lib/workflow-tracking";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Chargement...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { role, hasPermission } = useAuth();

  if (role === "superadmin") return <>{children}</>;
  if (role === "admin" && hasPermission("manage_users")) return <>{children}</>;

  return <Navigate to="/" replace />;
}

function WorkflowRoute({ children }: { children: React.ReactNode }) {
  const { role, hasPermission } = useAuth();

  if (role === "superadmin") return <>{children}</>;
  if (role === "admin" && hasPermission("manage_workflow")) return <>{children}</>;

  return <Navigate to="/" replace />;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  if (role !== "superadmin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ReceptionRoute({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  if (role === "reception") return <Navigate to="/registre" replace />;
  return <>{children}</>;
}

function SuiviRoute({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const { grantedRoles, loading } = useWorkflowTrackingAccess();

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground">
        Chargement...
      </div>
    );
  }

  if (!canAccessSuiviPage(role, grantedRoles)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading, role } = useAuth();
  if (loading) return null;

  const defaultRoute = role === "reception" ? "/registre" : "/inbox";

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to={defaultRoute} replace /> : <Auth />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/forgot-password" element={user ? <Navigate to={defaultRoute} replace /> : <ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          {role === "reception" ? <Navigate to="/registre" replace /> : <Dashboard />}
        </ProtectedRoute>
      } />
      <Route path="/registre" element={<ProtectedRoute><RegistrePage /></ProtectedRoute>} />
      <Route path="/mail-entry" element={<Navigate to="/registre" replace />} />
      <Route path="/reception-dashboard" element={<Navigate to="/registre" replace />} />
      <Route path="/inbox" element={<ProtectedRoute><ReceptionRoute><InboxPage /></ReceptionRoute></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><ReceptionRoute><HistoryPage /></ReceptionRoute></ProtectedRoute>} />
      <Route path="/archive" element={<ProtectedRoute><ReceptionRoute><ArchivePage /></ReceptionRoute></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><ReceptionRoute><AnalyticsPage /></ReceptionRoute></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminPage /></AdminRoute></ProtectedRoute>} />
      <Route path="/workflow" element={<ProtectedRoute><WorkflowRoute><WorkflowPage /></WorkflowRoute></ProtectedRoute>} />
      <Route path="/missions" element={<ProtectedRoute><ReceptionRoute><MissionsPage /></ReceptionRoute></ProtectedRoute>} />
      <Route path="/reunions" element={<ProtectedRoute><ReceptionRoute><ReunionsPage /></ReceptionRoute></ProtectedRoute>} />
      <Route path="/suivi" element={<ProtectedRoute><SuiviRoute><SuiviPage /></SuiviRoute></ProtectedRoute>} />
      <Route path="/system-config" element={<ProtectedRoute><SuperAdminRoute><SystemConfigPage /></SuperAdminRoute></ProtectedRoute>} />
      <Route path="/integrations" element={<ProtectedRoute><AdminRoute><IntegrationsPage /></AdminRoute></ProtectedRoute>} />
      <Route path="/notifications-test" element={<ProtectedRoute><SuperAdminRoute><NotificationsTestPage /></SuperAdminRoute></ProtectedRoute>} />
      <Route path="/audit" element={<ProtectedRoute><SuperAdminRoute><AuditLogPage /></SuperAdminRoute></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
            <SiteSettingsProvider>
              <AppRoutes />
            </SiteSettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
