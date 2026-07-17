import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  WorkspacePreviewProvider,
  type WorkspacePreviewState,
} from "@/features/workspace/WorkspacePreview";
import { roleLabels } from "@/lib/auth/roles";
import { supabase } from "@/lib/supabase/client";
import type { Organization, Profile } from "@/lib/supabase/types";

function orgWorkspaceNav(orgId: string) {
  const base = `/dashboard/quality-international/org-workspace/${orgId}`;
  return [
    { label: "Dashboard", href: base, icon: "DB" },
    { label: "Training Plan", href: `${base}/training-plan`, icon: "TP" },
    { label: "Programme Request", href: `${base}/programme-request`, icon: "PR" },
    {
      label: "Assigned Trainings",
      href: `${base}/assigned-trainings`,
      icon: "AT",
    },
    {
      label: "Training Payment",
      href: `${base}/training-payment`,
      icon: "PY",
    },
    {
      label: "Organization Employees",
      href: `${base}/employees`,
      icon: "EM",
      userMenu: true,
    },
    {
      label: "Organization Details",
      href: `${base}/details`,
      icon: "OR",
      userMenu: true,
    },
  ];
}

function individualWorkspaceNav(userId: string) {
  const base = `/dashboard/quality-international/individual-workspace/${userId}`;
  return [
    { label: "Dashboard", href: base, icon: "DB" },
    { label: "Training Plan", href: `${base}/training-plan`, icon: "TP" },
    { label: "Programme Request", href: `${base}/programme-request`, icon: "PR" },
    {
      label: "Assigned Trainings",
      href: `${base}/assigned-trainings`,
      icon: "AT",
    },
    {
      label: "Completed Trainings",
      href: `${base}/completed-trainings`,
      icon: "CT",
    },
    { label: "My Profile", href: `${base}/profile`, icon: "PF" },
  ];
}

function PreviewBanner({
  label,
  backTo,
  backLabel,
}: {
  label: string;
  backTo: string;
  backLabel: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          QI preview — view only
        </p>
        <p className="text-sm font-semibold text-indigo-950">{label}</p>
        <p className="mt-0.5 text-xs text-indigo-800/80">
          Super Administrator, QI Staff &amp; Trainer can view this dashboard
          but cannot edit or delete.
        </p>
      </div>
      <Link
        to={backTo}
        className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
      >
        {backLabel}
      </Link>
    </div>
  );
}

export function QiOrgWorkspaceLayout() {
  const { orgId } = useParams<{ orgId: string }>();
  const { profile, user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    void (async () => {
      const { data, error: loadError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .maybeSingle();
      if (loadError) {
        setError(loadError.message);
        setOrg(null);
        return;
      }
      setOrg((data as Organization | null) ?? null);
    })();
  }, [orgId]);

  const preview = useMemo<WorkspacePreviewState | null>(() => {
    if (!orgId || !org) return null;
    return {
      kind: "organization",
      orgId,
      label: org.name,
      backTo: "/dashboard/quality-international/organizations",
    };
  }, [org, orgId]);

  if (!profile) return null;
  if (!orgId) {
    return <p className="p-6 text-sm text-red-600">Organization not found.</p>;
  }
  if (error) {
    return <p className="p-6 text-sm text-red-600">{error}</p>;
  }
  if (!org || !preview) {
    return <p className="p-6 text-sm text-slate-500">Loading organization…</p>;
  }

  return (
    <WorkspacePreviewProvider value={preview}>
      <DashboardShell
        portalLabel="Organization"
        portalAccent="emerald"
        userEmail={profile.email ?? user?.email ?? ""}
        userName={profile.full_name}
        userRoleLabel={roleLabels[profile.role]}
        brand={{
          name: org.name,
          logoUrl: org.logo_url,
          subtitle: "Organization",
          markMode: "org",
        }}
        workspaceTitle={org.name}
        navItems={orgWorkspaceNav(orgId)}
      >
        <PreviewBanner
          label={org.name}
          backTo={preview.backTo}
          backLabel="← Back to Organizations"
        />
        <Outlet />
      </DashboardShell>
    </WorkspacePreviewProvider>
  );
}

export function QiIndividualWorkspaceLayout() {
  const { userId } = useParams<{ userId: string }>();
  const { profile, user } = useAuth();
  const [learner, setLearner] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const { data, error: loadError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (loadError) {
        setError(loadError.message);
        setLearner(null);
        return;
      }
      setLearner((data as Profile | null) ?? null);
    })();
  }, [userId]);

  const preview = useMemo<WorkspacePreviewState | null>(() => {
    if (!userId || !learner) return null;
    return {
      kind: "individual",
      userId,
      orgId: learner.org_id,
      label: learner.full_name?.trim() || learner.email || "Learner",
      backTo: "/dashboard/quality-international/individuals",
      user: learner,
    };
  }, [learner, userId]);

  if (!profile) return null;
  if (!userId) {
    return <p className="p-6 text-sm text-red-600">Learner not found.</p>;
  }
  if (error) {
    return <p className="p-6 text-sm text-red-600">{error}</p>;
  }
  if (!learner || !preview) {
    return <p className="p-6 text-sm text-slate-500">Loading learner…</p>;
  }

  const learnerName = preview.label;

  return (
    <WorkspacePreviewProvider value={preview}>
      <DashboardShell
        portalLabel="Individual"
        portalAccent="amber"
        userEmail={profile.email ?? user?.email ?? ""}
        userName={profile.full_name}
        userRoleLabel={roleLabels[profile.role]}
        brand={{
          name: learnerName,
          logoUrl: null,
          subtitle: "Individual preview",
          markMode: "person",
        }}
        workspaceTitle={learnerName}
        navItems={individualWorkspaceNav(userId)}
      >
        <PreviewBanner
          label={learnerName}
          backTo={preview.backTo}
          backLabel="← Back to Individuals"
        />
        <Outlet />
      </DashboardShell>
    </WorkspacePreviewProvider>
  );
}
