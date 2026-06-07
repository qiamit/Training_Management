import Link from "next/link";

import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";
import { claimsFromUser, getAppRole } from "@/lib/firebase/auth-user";
import { listAuthUsers } from "@/lib/firebase/auth-server";
import {
  countOrganizationsExcluding,
  countUsersByRoles,
} from "@/lib/firebase/db";

const config = roleConfigMap["quality-international"];

type Counts = {
  organizations: number;
  individuals: number;
  pendingApprovals: number;
};

async function loadCounts(): Promise<Counts> {
  const fallback: Counts = {
    organizations: 0,
    individuals: 0,
    pendingApprovals: 0,
  };

  try {
    const [organizations, individuals, authUsers] = await Promise.all([
      countOrganizationsExcluding("Independent Learners"),
      countUsersByRoles(["individual", "employee", "trainee"]),
      listAuthUsers(200),
    ]);

    const pendingApprovals = authUsers.filter((user) => {
      const claims = claimsFromUser(user);
      const hasRole = Boolean(claims?.role);
      const status = String(claims?.approval_status ?? "");
      return !hasRole && status !== "rejected";
    }).length;

    return {
      organizations,
      individuals,
      pendingApprovals,
    };
  } catch {
    return fallback;
  }
}

export default async function QualityInternationalDashboardPage() {
  const user = await requireAuthorizedUser({
    allowedAppRoles: ["super_admin"],
    loginPath: "/login/quality-international",
  });

  const counts = await loadCounts();

  return (
    <DashboardShell
      portalLabel="Quality International"
      portalAccent={config.accent}
      userEmail={user.email ?? ""}
      userRoleLabel={appRoleLabel(getAppRole(user))}
      navItems={config.navItems}
      activeHref="/dashboard/quality-international"
    >
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 p-7 text-white shadow-xl shadow-slate-400/30">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-200">
          Service Provider Control Center
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
          Welcome back, Super Admin
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-indigo-100">
          Coordinate organizations, individual learners, training programmes,
          and finance across the platform — with full audit visibility.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard/quality-international/user-approvals"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-200"
          >
            Open Approval Queue ({counts.pendingApprovals})
          </Link>
          <Link
            href="/dashboard/quality-international/training-programmes"
            className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Manage Training Catalog
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Organizations",
            value: counts.organizations,
            sub: "Active tenants",
            href: "/dashboard/quality-international/organizations",
            tone: "indigo",
          },
          {
            label: "Individuals",
            value: counts.individuals,
            sub: "Independent learners",
            href: "/dashboard/quality-international/individuals",
            tone: "amber",
          },
          {
            label: "Pending Approvals",
            value: counts.pendingApprovals,
            sub: "Action required",
            href: "/dashboard/quality-international/user-approvals",
            tone: "rose",
          },
          {
            label: "Programmes Live",
            value: 18,
            sub: "Mock — wire to schedule",
            href: "/dashboard/quality-international/training-programmes",
            tone: "emerald",
          },
        ].map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {stat.label}
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{stat.value}</p>
            <p className="mt-1 text-xs text-slate-500">{stat.sub}</p>
            <p
              className={`mt-3 text-xs font-semibold ${
                stat.tone === "indigo"
                  ? "text-indigo-600"
                  : stat.tone === "amber"
                    ? "text-amber-600"
                    : stat.tone === "rose"
                      ? "text-rose-600"
                      : "text-emerald-600"
              }`}
            >
              Open module →
            </p>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            title: "Organizations",
            href: "/dashboard/quality-international/organizations",
            desc: "Approve, view and manage all organization tenants. Monitor headcount, programmes, and compliance posture.",
          },
          {
            title: "Individual Learners",
            href: "/dashboard/quality-international/individuals",
            desc: "Track independent learners, enrolments, and certificate issuance.",
          },
          {
            title: "Training Programmes",
            href: "/dashboard/quality-international/training-programmes",
            desc: "Curate the catalog, set instructors, and schedule live or self-paced programmes.",
          },
          {
            title: "Finance",
            href: "/dashboard/quality-international/finance",
            desc: "Review revenue, invoices, payouts, and outstanding balances by tenant.",
          },
          {
            title: "User Approvals",
            href: "/dashboard/quality-international/user-approvals",
            desc: "Approve or reject pending signups and assign application roles.",
          },
          {
            title: "Compliance & Audit",
            href: "#",
            desc: "Immutable audit trails for evaluations and certificates. Coming next.",
          },
        ].map((module) => (
          <Link
            key={module.title}
            href={module.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
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
