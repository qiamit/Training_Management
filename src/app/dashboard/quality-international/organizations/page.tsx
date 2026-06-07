import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";
import { getAppRole } from "@/lib/firebase/auth-user";
import {
  countUsersByOrgIds,
  listOrganizations,
} from "@/lib/firebase/db";

const config = roleConfigMap["quality-international"];

type OrgRow = {
  id: string;
  name: string;
  iso_accreditations: string[] | null;
  created_at?: string | null;
  employeeCount: number;
};

async function loadOrganizations(): Promise<{
  rows: OrgRow[];
  error?: string;
}> {
  try {
    const organizations = await listOrganizations();
    const orgIds = organizations.map((o) => o.id);
    const countsByOrg = await countUsersByOrgIds(orgIds);

    return {
      rows: organizations.map((o) => ({
        id: o.id,
        name: o.name,
        iso_accreditations: o.iso_accreditations ?? [],
        created_at:
          o.created_at && typeof o.created_at !== "string"
            ? o.created_at.toDate?.().toISOString() ?? null
            : (o.created_at as string | null) ?? null,
        employeeCount: countsByOrg[o.id] ?? 0,
      })),
    };
  } catch (caughtError) {
    return {
      rows: [],
      error:
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load organizations.",
    };
  }
}

export default async function OrganizationsModulePage() {
  const user = await requireAuthorizedUser({
    allowedAppRoles: ["super_admin"],
    loginPath: "/login/quality-international",
  });

  const { rows, error } = await loadOrganizations();

  return (
    <DashboardShell
      portalLabel="Quality International"
      portalAccent={config.accent}
      userEmail={user.email ?? ""}
      userRoleLabel={appRoleLabel(getAppRole(user))}
      navItems={config.navItems}
      activeHref="/dashboard/quality-international/organizations"
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Module
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Organizations</h1>
            <p className="mt-1 text-sm text-slate-600">
              All organization tenants registered on the platform.
            </p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100">
            {rows.length} tenants
          </span>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Organization</th>
                <th className="px-5 py-3">Members</th>
                <th className="px-5 py-3">ISO Accreditations</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    No organizations yet. Tenants will appear here once they
                    sign up via the Organization portal.
                  </td>
                </tr>
              ) : (
                rows.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{org.name}</p>
                      <p className="text-xs text-slate-500">{org.id}</p>
                    </td>
                    <td className="px-5 py-3">{org.employeeCount}</td>
                    <td className="px-5 py-3">
                      {org.iso_accreditations && org.iso_accreditations.length > 0
                        ? org.iso_accreditations.join(", ")
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {org.created_at
                        ? new Date(org.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500">
                        View · soon
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}
