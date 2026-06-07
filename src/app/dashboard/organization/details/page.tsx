import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";
import { getAppRole } from "@/lib/firebase/auth-user";
import {
  getOrganizationById,
  getUserProfileByAuthId,
} from "@/lib/firebase/db";

const config = roleConfigMap.organization;

async function loadOrgDetails(authUserId: string) {
  try {
    const profile = await getUserProfileByAuthId(authUserId);
    const orgId = profile?.org_id;
    if (!orgId) {
      return { profile, org: null };
    }

    const org = await getOrganizationById(orgId);
    return { profile, org };
  } catch {
    return { profile: null, org: null };
  }
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-800">{value || "—"}</p>
    </div>
  );
}

export default async function OrganizationDetailsModulePage() {
  const user = await requireAuthorizedUser({
    allowedAppRoles: ["tenant_admin", "quality_manager"],
    loginPath: "/login/organization",
  });

  const { profile, org } = await loadOrgDetails(user.id);

  const createdAt =
    org?.created_at && typeof org.created_at !== "string"
      ? org.created_at.toDate?.().toLocaleDateString()
      : org?.created_at
        ? new Date(org.created_at as string).toLocaleDateString()
        : null;

  return (
    <DashboardShell
      portalLabel="Organization"
      portalAccent={config.accent}
      userEmail={user.email ?? ""}
      userRoleLabel={appRoleLabel(getAppRole(user))}
      navItems={config.navItems}
      activeHref="/dashboard/organization/details"
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
          Module
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          Organization Details
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Profile, primary contact, address, and ISO accreditations on file.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-700">
            Organization profile
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Organization name" value={org?.name ?? null} />
            <ReadOnlyField
              label="ISO accreditations"
              value={
                org?.iso_accreditations && org.iso_accreditations.length > 0
                  ? org.iso_accreditations.join(", ")
                  : "—"
              }
            />
            <ReadOnlyField label="Tenant ID" value={org?.id ?? null} />
            <ReadOnlyField label="Created" value={createdAt} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-700">Primary contact</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Full name" value={profile?.full_name} />
            <ReadOnlyField label="Designation" value={profile?.designation} />
            <ReadOnlyField label="Email" value={user.email} />
            <ReadOnlyField label="Mobile" value={profile?.mobile} />
            <ReadOnlyField label="City" value={profile?.city} />
            <ReadOnlyField label="Country" value={profile?.country} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">Compliance posture</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { k: "Last audit", v: "Jan 2026" },
            { k: "Active certifications", v: "3" },
            { k: "Open NCRs", v: "0" },
          ].map((row) => (
            <div
              key={row.k}
              className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {row.k}
              </p>
              <p className="mt-1 text-base font-semibold text-slate-900">{row.v}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Editing organization profile via tenant admin will be wired in the
          next phase with audit logging.
        </p>
      </section>
    </DashboardShell>
  );
}
