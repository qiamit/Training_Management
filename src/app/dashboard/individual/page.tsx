import Link from "next/link";

import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";

const config = roleConfigMap.individual;

export default async function IndividualDashboardPage() {
  const user = await requireAuthorizedUser({
    allowedAppRoles: ["individual", "employee", "trainee"],
    loginPath: "/login/individual",
  });

  const fullName = String(user.user_metadata?.full_name ?? "").trim();
  const greeting = fullName || user.email || "Learner";

  return (
    <DashboardShell
      portalLabel="Individual Learner"
      portalAccent={config.accent}
      userEmail={user.email ?? ""}
      userRoleLabel={appRoleLabel(String(user.app_metadata?.role ?? ""))}
      navItems={config.navItems}
      activeHref="/dashboard/individual"
    >
      <section className="rounded-3xl bg-gradient-to-br from-amber-500 via-amber-600 to-orange-700 p-7 text-white shadow-xl shadow-amber-900/20">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100">
          Learner Workspace
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
          Hi {greeting.split(" ")[0]}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-amber-50">
          Stay on top of your training journey — upcoming sessions, evaluation
          attempts, and certificates earned, all in one place.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard/individual/sessions"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            View Upcoming Sessions
          </Link>
          <Link
            href="/dashboard/individual/certificates"
            className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            My Certificates
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Upcoming Sessions", value: 3, href: "/dashboard/individual/sessions" },
          { label: "Pending Assessments", value: 2, href: "/dashboard/individual/assessments" },
          { label: "Avg. Score", value: "84%", href: "/dashboard/individual/assessments" },
          { label: "Certificates", value: 5, href: "/dashboard/individual/certificates" },
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
            <p className="mt-3 text-xs font-semibold text-amber-600">Open →</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            title: "My Sessions",
            href: "/dashboard/individual/sessions",
            desc: "View assigned sessions, timing details, and Zoom join links.",
          },
          {
            title: "Assessments & Scores",
            href: "/dashboard/individual/assessments",
            desc: "Attempt evaluations, track score history, and view completion status.",
          },
          {
            title: "Certificates",
            href: "/dashboard/individual/certificates",
            desc: "Download issued certificates and share QR verification links.",
          },
        ].map((module) => (
          <Link
            key={module.title}
            href={module.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
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
