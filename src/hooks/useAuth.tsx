import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { prefetchAvatarSrc, resolveAvatarSrc } from "@/lib/avatar-storage";
import {
  clearPersistedAvatarSrc,
  loadPersistedAvatarSrc,
  persistAvatarSrc,
} from "@/lib/avatar-session";

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
  refreshProfile: () => Promise<void>;
  patchProfile: (patch: Record<string, unknown>) => void;
  verifiedAvatarSrc: string | null;
  setVerifiedAvatarSrc: (src: string | null, avatarPath?: string | null) => void;
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
  refreshProfile: async () => {},
  patchProfile: () => {},
  verifiedAvatarSrc: null,
  setVerifiedAvatarSrc: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifiedAvatarSrc, setVerifiedAvatarSrc] = useState<string | null>(null);

  const fetchPermissions = async () => {
    const { data } = await supabase
      .from("admin_permissions")
      .select("permission_key, label, is_enabled");
    setPermissions(data || []);
  };

  const applyAvatarFromProfile = (userId: string, avatarUrl: string | null | undefined, updatedAt?: string | null) => {
    const persisted = loadPersistedAvatarSrc(userId, avatarUrl);
    if (persisted) {
      setVerifiedAvatarSrc(persisted);
    }

    if (!avatarUrl?.trim()) {
      clearPersistedAvatarSrc(userId);
      setVerifiedAvatarSrc(null);
      return;
    }

    prefetchAvatarSrc(avatarUrl, updatedAt);
    void resolveAvatarSrc(avatarUrl, updatedAt).then((src) => {
      if (src) {
        setVerifiedAvatarSrc(src);
        persistAvatarSrc(userId, avatarUrl, src);
      }
    });
  };

  const fetchUserData = async (userId: string) => {
    const [{ data: roleRows }, { data: profileRows }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).limit(1),
      supabase.from("profiles").select("*").eq("id", userId).limit(1),
    ]);
    const roleData = roleRows?.[0] ?? null;
    const profileData = profileRows?.[0] ?? null;
    const userRole = roleData?.role || null;
    setRole(userRole);
    setProfile(profileData || null);

    applyAvatarFromProfile(userId, profileData?.avatar_url, profileData?.updated_at);

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
          setTimeout(async () => {
            await fetchUserData(session.user.id);
            setLoading(false);
          }, 0);
        } else {
          setRole(null);
          setProfile(null);
          setPermissions([]);
          setVerifiedAvatarSrc(null);
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
    if (user?.id) {
      clearPersistedAvatarSrc(user.id);
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setProfile(null);
    setPermissions([]);
    setVerifiedAvatarSrc(null);
  };

  const hasPermission = (key: string): boolean => {
    if (role === "superadmin") return true;
    const perm = permissions.find((p) => p.permission_key === key);
    return perm?.is_enabled ?? false;
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchUserData(user.id);
    }
  };

  const patchProfile = (patch: Record<string, unknown>) => {
    setProfile((prev: Record<string, unknown> | null) => (prev ? { ...prev, ...patch } : prev));
  };

  const setVerifiedAvatarSrcPersisted = (src: string | null, avatarPath?: string | null) => {
    setVerifiedAvatarSrc(src);
    const path = avatarPath ?? profile?.avatar_url;
    if (user?.id && path && src) {
      persistAvatarSrc(user.id, path, src);
    }
    if (!src && user?.id) {
      clearPersistedAvatarSrc(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        profile,
        permissions,
        loading,
        tenantId: profile?.tenant_id || null,
        signOut,
        hasPermission,
        refreshPermissions: fetchPermissions,
        refreshProfile,
        patchProfile,
        verifiedAvatarSrc,
        setVerifiedAvatarSrc: setVerifiedAvatarSrcPersisted,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
