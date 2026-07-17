import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, siteUrl } from "@/lib/supabase/client";
import type { AppRole, Profile } from "@/lib/supabase/types";
import {
  effectiveQiMode,
  dashboardPathForRole,
  type QiWorkspaceMode,
  type LoginRole,
  roleConfigMap,
} from "@/lib/auth/roles";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  qiMode: QiWorkspaceMode;
  setQiMode: (mode: QiWorkspaceMode) => void;
  isTrainerView: boolean;
  loading: boolean;
  refreshProfile: () => Promise<Profile | null>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    portal: LoginRole,
    form: Record<string, string>,
  ) => Promise<{ error?: string; message?: string }>;
  signOut: () => Promise<void>;
  assertPortalAccess: (portal: LoginRole) => string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error(error);
    return null;
  }
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [preferredQiMode, setPreferredQiMode] =
    useState<QiWorkspaceMode>("admin");
  const [loading, setLoading] = useState(true);

  const qiMode = effectiveQiMode(profile?.role, preferredQiMode);
  const isTrainerView = qiMode === "trainer";

  useEffect(() => {
    if (!profile?.id) {
      setPreferredQiMode("admin");
      return;
    }
    try {
      const stored = localStorage.getItem(`tm-qi-mode:${profile.id}`);
      setPreferredQiMode(stored === "trainer" ? "trainer" : "admin");
    } catch {
      setPreferredQiMode("admin");
    }
  }, [profile?.id]);

  const setQiMode = useCallback(
    (mode: QiWorkspaceMode) => {
      const next = effectiveQiMode(profile?.role, mode);
      setPreferredQiMode(next);
      if (profile?.id) {
        try {
          localStorage.setItem(`tm-qi-mode:${profile.id}`, next);
        } catch {
          /* local storage may be unavailable */
        }
      }
    },
    [profile?.id, profile?.role],
  );

  const refreshProfile = useCallback(async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) {
      setProfile(null);
      return null;
    }
    const next = await fetchProfile(userId);
    setProfile(next);
    return next;
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        void fetchProfile(data.session.user.id).then((p) => {
          if (mounted) {
            setProfile(p);
            setLoading(false);
          }
        });
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) {
        void fetchProfile(next.user.id).then((p) => {
          if (mounted) setProfile(p);
        });
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { error: error.message };
    await refreshProfile();
    return {};
  }, [refreshProfile]);

  const signUp = useCallback(
    async (portal: LoginRole, form: Record<string, string>) => {
      const email = form.email?.trim();
      const password = form.password;
      if (!email || !password) {
        return { error: "Email and password are required." };
      }
      if (form.confirmPassword && form.confirmPassword !== password) {
        return { error: "Password and Retype Password do not match." };
      }
      if (password.length < 8) {
        return { error: "Password must be at least 8 characters." };
      }

      const metadata: Record<string, string> = {
        portal,
        full_name: form.fullName ?? "",
        designation: form.designation ?? "",
        mobile: form.mobile ?? "",
        city: form.city ?? "",
        country: form.country ?? "",
        organization_name: form.organizationName ?? "",
        industry: form.industry ?? "",
        employee_count: form.employeeCount ?? "",
        occupation: form.occupation ?? "",
        qualification: form.qualification ?? "",
        date_of_birth: form.dateOfBirth ?? "",
        invite_token: form.inviteToken ?? "",
        gst_number: form.gstNumber ?? "",
        address: form.address ?? "",
        pin_code: form.pinCode ?? "",
        state: form.state ?? "",
      };

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          emailRedirectTo: `${siteUrl}/auth/callback`,
        },
      });

      if (error) return { error: error.message };

      if (data.session) {
        await refreshProfile();
        return { message: "Account created. You are signed in." };
      }

      return {
        message:
          "Account created. Check your email to verify, then sign in.",
      };
    },
    [refreshProfile],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const assertPortalAccess = useCallback(
    (portal: LoginRole) => {
      if (!profile) return "Please sign in.";
      if (profile.approval_status === "pending") {
        return "Your account is pending approval by a super admin.";
      }
      if (profile.approval_status === "rejected") {
        return "Your account was rejected. Contact Quality International.";
      }
      if (!profile.is_active) {
        return "Your account is inactive.";
      }
      const allowed = roleConfigMap[portal].allowedAppRoles;
      if (!allowed.includes(profile.role as AppRole)) {
        return "You are not authorized for this login portal.";
      }
      return null;
    },
    [profile],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      qiMode,
      setQiMode,
      isTrainerView,
      loading,
      refreshProfile,
      signIn,
      signUp,
      signOut,
      assertPortalAccess,
    }),
    [
      session,
      profile,
      qiMode,
      setQiMode,
      isTrainerView,
      loading,
      refreshProfile,
      signIn,
      signUp,
      signOut,
      assertPortalAccess,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useRequireAuth(portal?: LoginRole) {
  const auth = useAuth();
  const gateError =
    portal && auth.profile && !auth.loading
      ? auth.assertPortalAccess(portal)
      : null;
  return { ...auth, gateError, homePath: auth.profile ? dashboardPathForRole(auth.profile.role) : "/" };
}
