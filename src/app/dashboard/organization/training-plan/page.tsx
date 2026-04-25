import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";

const config = roleConfigMap.organization;

const plannedSessions = [
  {
    id: "PLAN-Q2-01",
    programme: "ISO 9001:2015 Foundations",
    quarter: "Q2 FY26",
    participants: 18,
    mode: "Live (Zoom)",
    requestedDate: "12 May 2026",
    status: "Confirmed",
  },
  {
    id: "PLAN-Q2-02",
    programme: "Internal Auditor Programme",
    quarter: "Q2 FY26",
    participants: 24,
    mode: "Self-paced",
    requestedDate: "Always-on",
    status: "Confirmed",
  },
  {
    id: "PLAN-Q2-03",
    programme: "GMP — 21 CFR Part 11",
    quarter: "Q2 FY26",
    participants: 12,
    mode: "Hybrid",
    requestedDate: "02 Jun 2026",
    status: "Awaiting QI",
  },
  {
    id: "PLAN-Q3-01",
    programme: "ISO/IEC 17025 Lab",
    quarter: "Q3 FY26",
    participants: 9,
    mode: "Live (Zoom)",
    requestedDate: "15 Jul 2026",
    status: "Draft",
  },
];

const statusTone: Record<string, string> = {
  Confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  "Awaiting QI": "bg-amber-50 text-amber-700 ring-amber-100",
  Draft: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default async function TrainingPlanModulePage() {
  const user = await requireAuthorizedUser({
    allowedAppRoles: ["tenant_admin", "quality_manager"],
    loginPath: "/login/organization",
  });

  return (
    <DashboardShell
      portalLabel="Organization"
      portalAccent={config.accent}
      userEmail={user.email ?? ""}
      userRoleLabel={appRoleLabel(String(user.app_metadata?.role ?? ""))}
      navItems={config.navItems}
      activeHref="/dashboard/organization/training-plan"
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Module
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              Training Plan
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Build quarterly training plans, request programmes, and track
              session confirmations.
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            + Request Programme
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Plans this quarter", value: 4 },
          { label: "Confirmed sessions", value: 2 },
          { label: "Awaiting confirmation", value: 1 },
          { label: "Participants enrolled", value: 63 },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {stat.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Plan ID</th>
                <th className="px-5 py-3">Programme</th>
                <th className="px-5 py-3">Quarter</th>
                <th className="px-5 py-3">Participants</th>
                <th className="px-5 py-3">Mode</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {plannedSessions.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">
                    {row.id}
                  </td>
                  <td className="px-5 py-3 font-semibold text-slate-900">
                    {row.programme}
                  </td>
                  <td className="px-5 py-3">{row.quarter}</td>
                  <td className="px-5 py-3">{row.participants}</td>
                  <td className="px-5 py-3">{row.mode}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {row.requestedDate}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                        statusTone[row.status] ?? statusTone.Draft
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Mock data shown above. Wire to <code>training_plans</code> +{" "}
        <code>sessions</code> tables. Plan requests will route to Quality
        International for confirmation.
      </p>
    </DashboardShell>
  );
}
