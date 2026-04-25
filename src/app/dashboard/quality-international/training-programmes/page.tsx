import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";

const config = roleConfigMap["quality-international"];

const programmes = [
  {
    code: "QMS-101",
    title: "ISO 9001:2015 Quality Management Foundations",
    mode: "Live (Zoom)",
    duration: "2 days",
    level: "Foundation",
    nextBatch: "12 May 2026",
    seats: "32 / 40",
    fee: "₹ 18,000",
    status: "Open",
  },
  {
    code: "LAB-204",
    title: "ISO/IEC 17025 Lab Competence",
    mode: "Live (Zoom)",
    duration: "3 days",
    level: "Intermediate",
    nextBatch: "20 May 2026",
    seats: "24 / 30",
    fee: "₹ 26,500",
    status: "Open",
  },
  {
    code: "GMP-310",
    title: "Good Manufacturing Practices (GMP) — 21 CFR Part 11",
    mode: "Hybrid",
    duration: "4 days",
    level: "Advanced",
    nextBatch: "02 Jun 2026",
    seats: "18 / 25",
    fee: "₹ 34,000",
    status: "Filling fast",
  },
  {
    code: "INT-AUD-150",
    title: "Internal Auditor Programme",
    mode: "Self-paced",
    duration: "10 hrs",
    level: "Foundation",
    nextBatch: "Always-on",
    seats: "—",
    fee: "₹ 9,500",
    status: "Open",
  },
  {
    code: "FSSC-220",
    title: "FSSC 22000 Food Safety Management",
    mode: "Live (Zoom)",
    duration: "3 days",
    level: "Intermediate",
    nextBatch: "15 Jun 2026",
    seats: "12 / 30",
    fee: "₹ 24,000",
    status: "Open",
  },
];

const statusColor: Record<string, string> = {
  Open: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  "Filling fast": "bg-amber-50 text-amber-700 ring-amber-100",
  Closed: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default async function TrainingProgrammesModulePage() {
  const user = await requireAuthorizedUser({
    allowedAppRoles: ["super_admin"],
    loginPath: "/login/quality-international",
  });

  return (
    <DashboardShell
      portalLabel="Quality International"
      portalAccent={config.accent}
      userEmail={user.email ?? ""}
      userRoleLabel={appRoleLabel(String(user.app_metadata?.role ?? ""))}
      navItems={config.navItems}
      activeHref="/dashboard/quality-international/training-programmes"
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Module
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              Training Programmes
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Curated catalog of live, hybrid and self-paced programmes
              delivered by Quality International.
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            + New Programme
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Programmes Live", value: programmes.length },
          { label: "Open Enrolment", value: 4 },
          { label: "Avg. Seats Filled", value: "78%" },
          { label: "Revenue (90d)", value: "₹ 24.3L" },
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
                <th className="px-5 py-3">Programme</th>
                <th className="px-5 py-3">Mode</th>
                <th className="px-5 py-3">Duration</th>
                <th className="px-5 py-3">Next Batch</th>
                <th className="px-5 py-3">Seats</th>
                <th className="px-5 py-3">Fee</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {programmes.map((programme) => (
                <tr key={programme.code} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-900">
                      {programme.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {programme.code} · {programme.level}
                    </p>
                  </td>
                  <td className="px-5 py-3">{programme.mode}</td>
                  <td className="px-5 py-3">{programme.duration}</td>
                  <td className="px-5 py-3">{programme.nextBatch}</td>
                  <td className="px-5 py-3">{programme.seats}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">
                    {programme.fee}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                        statusColor[programme.status] ?? statusColor.Closed
                      }`}
                    >
                      {programme.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Mock data shown above. Wire to a <code>training_programmes</code> table +{" "}
        <code>sessions</code> schedule in the next phase.
      </p>
    </DashboardShell>
  );
}
