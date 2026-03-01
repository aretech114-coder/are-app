import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Chargement...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { role, hasPermission } = useAuth();
  if (role !== "admin" && role !== "superadmin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  if (role !== "superadmin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/mail-entry" element={<ProtectedRoute><MailEntry /></ProtectedRoute>} />
      <Route path="/inbox" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
      <Route path="/archive" element={<ProtectedRoute><ArchivePage /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><SuperAdminRoute><AdminPage /></SuperAdminRoute></ProtectedRoute>} />
      <Route path="/workflow" element={<ProtectedRoute><AdminRoute><WorkflowPage /></AdminRoute></ProtectedRoute>} />
      <Route path="/missions" element={<ProtectedRoute><MissionsPage /></ProtectedRoute>} />
      <Route path="/reunions" element={<ProtectedRoute><ReunionsPage /></ProtectedRoute>} />
      <Route path="/suivi" element={<ProtectedRoute><SuiviPage /></ProtectedRoute>} />
      <Route path="/system-config" element={<ProtectedRoute><SuperAdminRoute><SystemConfigPage /></SuperAdminRoute></ProtectedRoute>} />
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
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
