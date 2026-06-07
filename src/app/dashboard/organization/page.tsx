import Link from "next/link";

import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";
import { getAppRole } from "@/lib/firebase/auth-user";
import {
  getOrganizationById,
  getUserProfileByAuthId,
  listUsersByOrgId,
} from "@/lib/firebase/db";

const config = roleConfigMap.organization;

async function loadOrgSnapshot(authUserId: string) {
  try {
    const profile = await getUserProfileByAuthId(authUserId);
    const orgId = profile?.org_id;
    if (!orgId) {
      return { orgName: "Your Organization", employeeCount: 0 };
    }

    const [org, members] = await Promise.all([
      getOrganizationById(orgId),
      listUsersByOrgId(orgId),
    ]);

    return {
      orgName: org?.name ?? "Your Organization",
      employeeCount: members.length,
    };
  } catch {
    return { orgName: "Your Organization", employeeCount: 0 };
  }
}

export default async function OrganizationDashboardPage() {
  const user = await requireAuthorizedUser({
    allowedAppRoles: ["tenant_admin", "quality_manager"],
    loginPath: "/login/organization",
  });

  const snapshot = await loadOrgSnapshot(user.id);

  return (
    <DashboardShell
      portalLabel="Organization"
      portalAccent={config.accent}
      userEmail={user.email ?? ""}
      userRoleLabel={appRoleLabel(getAppRole(user))}
      navItems={config.navItems}
      activeHref="/dashboard/organization"
    >
      <section className="rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-slate-900 p-7 text-white shadow-xl shadow-emerald-900/20">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
          Organization Workspace
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
          {snapshot.orgName}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-emerald-100">
          Manage employees, request training programmes, and monitor competency
          status across your workforce.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard/organization/employees"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-200"
          >
            Add Employees
          </Link>
          <Link
            href="/dashboard/organization/training-plan"
            className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Plan Training
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Employees",
            value: snapshot.employeeCount,
            sub: "Active in directory",
            href: "/dashboard/organization/employees",
          },
          {
            label: "Plans This Quarter",
            value: 4,
            sub: "Mock — wire to plans",
            href: "/dashboard/organization/training-plan",
          },
          {
            label: "Sessions Scheduled",
            value: 9,
            sub: "Mock — wire to sessions",
            href: "/dashboard/organization/training-plan",
          },
          {
            label: "Certificates Issued",
            value: 27,
            sub: "Mock — wire to certs",
            href: "/dashboard/organization/training-plan",
          },
        ].map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {stat.label}
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{stat.value}</p>
            <p className="mt-1 text-xs text-slate-500">{stat.sub}</p>
            <p className="mt-3 text-xs font-semibold text-emerald-600">
              Open module →
            </p>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            title: "List of Employees",
            href: "/dashboard/organization/employees",
            desc: "Add employees, define roles, and track participation across sessions.",
          },
          {
            title: "Organization Details",
            href: "/dashboard/organization/details",
            desc: "Maintain organization profile, contacts, billing address, and ISO accreditations.",
          },
          {
            title: "Training Plan",
            href: "/dashboard/organization/training-plan",
            desc: "Build quarterly plans, request programmes from Quality International, and schedule sessions.",
          },
        ].map((module) => (
          <Link
            key={module.title}
            href={module.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
              Module
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">
              {module.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{module.desc}</p>
          </Link>
        ))}
      </section>
    </DashboardShell>
  );
}
