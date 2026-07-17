import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  canUseQiModeSwitch,
  isQiPathAllowedForRole,
  navForProfile,
  type QiWorkspaceMode,
  roleLabels,
} from "@/lib/auth/roles";
import { supabase } from "@/lib/supabase/client";
import type { Organization } from "@/lib/supabase/types";

export function QiDashboardLayout() {
  const { profile, user, qiMode, setQiMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Pick<
    Organization,
    "name" | "logo_url"
  > | null>(null);

  useEffect(() => {
    const loadCompany = () => {
      void supabase
        .from("organizations")
        .select("name, logo_url")
        .eq("type", "platform")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          setCompany(
            (data as Pick<Organization, "name" | "logo_url"> | null) ?? null,
          );
        });
    };

    loadCompany();
    const onBrandUpdated = () => loadCompany();
    window.addEventListener("qi-brand-updated", onBrandUpdated);
    return () => window.removeEventListener("qi-brand-updated", onBrandUpdated);
  }, []);

  if (!profile) return null;

  if (!isQiPathAllowedForRole(profile.role, location.pathname, qiMode)) {
    return <Navigate to="/dashboard/quality-international" replace />;
  }

  const staffName =
    profile.full_name?.trim() ||
    profile.email?.split("@")[0] ||
    "QI Staff";
  const companyName = company?.name?.trim() || "Quality Engineering";
  const showModeSwitch = canUseQiModeSwitch(profile.role);

  function selectMode(mode: QiWorkspaceMode) {
    setQiMode(mode);
    if (mode === "trainer") {
      navigate("/dashboard/quality-international/assign-programmes");
    }
  }

  const modeSwitch = showModeSwitch ? (
    <div
      className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm"
      aria-label="QI workspace mode"
    >
      {(["admin", "trainer"] as const).map((mode) => {
        const active = qiMode === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => selectMode(mode)}
            className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition sm:px-3 ${
              active
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {mode === "admin" ? "Admin Mode" : "Trainer Mode"}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <DashboardShell
      portalLabel={companyName}
      portalAccent="indigo"
      userEmail={profile.email ?? user?.email ?? ""}
      userName={staffName}
      userRoleLabel={
        qiMode === "trainer" ? "Trainer Mode" : roleLabels[profile.role]
      }
      brand={{
        name: companyName,
        logoUrl: company?.logo_url ?? null,
        subtitle:
          qiMode === "trainer" ? "Trainer Mode" : roleLabels[profile.role],
        markMode: "org",
      }}
      workspaceTitle={companyName}
      workspaceControls={modeSwitch}
      navItems={navForProfile(profile.role, qiMode)}
    >
      <Outlet />
    </DashboardShell>
  );
}

export function OrgDashboardLayout() {
  const { profile, user } = useAuth();
  const [org, setOrg] = useState<Pick<Organization, "name" | "logo_url"> | null>(
    null,
  );

  useEffect(() => {
    if (!profile?.org_id) return;

    const loadOrg = () => {
      void supabase
        .from("organizations")
        .select("name, logo_url")
        .eq("id", profile.org_id!)
        .maybeSingle()
        .then(({ data }) => {
          setOrg(
            (data as Pick<Organization, "name" | "logo_url"> | null) ?? null,
          );
        });
    };

    loadOrg();
    const onBrandUpdated = () => loadOrg();
    window.addEventListener("org-brand-updated", onBrandUpdated);
    return () => window.removeEventListener("org-brand-updated", onBrandUpdated);
  }, [profile?.org_id]);

  if (!profile) return null;

  const orgName = org?.name ?? "Organization";

  return (
    <DashboardShell
      portalLabel="Organization"
      portalAccent="emerald"
      userEmail={profile.email ?? user?.email ?? ""}
      userName={profile.full_name}
      userRoleLabel={roleLabels[profile.role]}
      brand={{
        name: orgName,
        logoUrl: org?.logo_url,
        subtitle: "Organization",
      }}
      workspaceTitle={orgName}
      navItems={navForProfile(profile.role)}
    >
      <Outlet />
    </DashboardShell>
  );
}

export function IndividualDashboardLayout() {
  const { profile, user } = useAuth();
  const [org, setOrg] = useState<Pick<Organization, "name" | "logo_url"> | null>(
    null,
  );

  useEffect(() => {
    if (!profile?.org_id) {
      setOrg(null);
      return;
    }

    const loadOrg = () => {
      void supabase
        .from("organizations")
        .select("name, logo_url")
        .eq("id", profile.org_id!)
        .maybeSingle()
        .then(({ data }) => {
          setOrg(
            (data as Pick<Organization, "name" | "logo_url"> | null) ?? null,
          );
        });
    };

    loadOrg();
    const onBrandUpdated = () => loadOrg();
    window.addEventListener("org-brand-updated", onBrandUpdated);
    return () => window.removeEventListener("org-brand-updated", onBrandUpdated);
  }, [profile?.org_id]);

  if (!profile) return null;

  const isOrgLearner = profile.role === "org_employee";
  const learnerName = profile.full_name?.trim() || "Learner";
  const orgName = org?.name ?? (isOrgLearner ? "Organization" : null);
  const portalAccent = isOrgLearner ? "emerald" : "amber";
  const portalLabel = isOrgLearner ? "Organization" : "Individual";

  return (
    <DashboardShell
      portalLabel={portalLabel}
      portalAccent={portalAccent}
      userEmail={profile.email ?? user?.email ?? ""}
      userName={profile.full_name}
      userRoleLabel={roleLabels[profile.role]}
      brand={
        isOrgLearner && orgName
          ? {
              name: orgName,
              logoUrl: org?.logo_url,
              subtitle: portalLabel,
              markMode: "org",
            }
          : {
              name: learnerName,
              logoUrl: null,
              subtitle: portalLabel,
              markMode: "person",
            }
      }
      workspaceTitle={learnerName}
      navItems={navForProfile(profile.role)}
    >
      <Outlet />
    </DashboardShell>
  );
}
