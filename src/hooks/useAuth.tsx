import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AdminPermission {
  permission_key: string;
  label: string;
  is_enabled: boolean;
}

interface AuthContext {
  user: User | null;
  session: Session | null;
  role: string | null;
  profile: any | null;
  permissions: AdminPermission[];
  loading: boolean;
  tenantId: string | null;
  signOut: () => Promise<void>;
  hasPermission: (key: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContext>({
  user: null,
  session: null,
  role: null,
  profile: null,
  permissions: [],
  loading: true,
  tenantId: null,
  signOut: async () => {},
  hasPermission: () => false,
  refreshPermissions: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = async () => {
    const { data } = await supabase
      .from("admin_permissions")
      .select("permission_key, label, is_enabled");
    setPermissions(data || []);
  };

  const fetchUserData = async (userId: string) => {
    const [{ data: roleData }, { data: profileData }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).single(),
      supabase.from("profiles").select("*").eq("id", userId).single(),
    ]);
    const userRole = roleData?.role || null;
    setRole(userRole);
    setProfile(profileData || null);

    // Fetch permissions for admin and superadmin
    if (userRole === "admin" || userRole === "superadmin") {
      await fetchPermissions();
    }
  };

  useEffect(() => {
    let initialSessionHandled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Use setTimeout to avoid Supabase deadlock, but await the result before clearing loading
          setTimeout(async () => {
            await fetchUserData(session.user.id);
            setLoading(false);
          }, 0);
        } else {
          setRole(null);
          setProfile(null);
          setPermissions([]);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (initialSessionHandled) return;
      initialSessionHandled = true;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setProfile(null);
    setPermissions([]);
  };

  const hasPermission = (key: string): boolean => {
    if (role === "superadmin") return true;
    const perm = permissions.find((p) => p.permission_key === key);
    return perm?.is_enabled ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, session, role, profile, permissions, loading, tenantId: profile?.tenant_id || null, signOut, hasPermission, refreshPermissions: fetchPermissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
