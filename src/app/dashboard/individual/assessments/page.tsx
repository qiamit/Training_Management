import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";

const config = roleConfigMap.individual;

const assessments = [
  {
    title: "ISO 9001 Foundations — Quiz",
    code: "QMS-101-Q1",
    questions: 25,
    duration: "30 min",
    bestScore: "—",
    attempts: 0,
    status: "Pending",
  },
  {
    title: "Internal Auditor — Module 3 Test",
    code: "INT-AUD-150-M3",
    questions: 20,
    duration: "25 min",
    bestScore: "76%",
    attempts: 1,
    status: "Re-attempt available",
  },
  {
    title: "GMP — Final Evaluation",
    code: "GMP-310-F",
    questions: 40,
    duration: "60 min",
    bestScore: "—",
    attempts: 0,
    status: "Pending",
  },
  {
    title: "ISO 9001 — Mock Evaluation",
    code: "QMS-101-M",
    questions: 30,
    duration: "45 min",
    bestScore: "92%",
    attempts: 2,
    status: "Completed",
  },
];

const statusTone: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 ring-amber-100",
  "Re-attempt available": "bg-indigo-50 text-indigo-700 ring-indigo-100",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-100",
};

export default async function AssessmentsModulePage() {
  const user = await requireAuthorizedUser({
    allowedAppRoles: ["individual", "employee", "trainee"],
    loginPath: "/login/individual",
  });

  return (
    <DashboardShell
      portalLabel="Individual Learner"
      portalAccent={config.accent}
      userEmail={user.email ?? ""}
      userRoleLabel={appRoleLabel(String(user.app_metadata?.role ?? ""))}
      navItems={config.navItems}
      activeHref="/dashboard/individual/assessments"
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
          Module
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          Assessments & Scores
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Attempt evaluations, view scores, and re-attempt where allowed.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Pending", value: 2 },
          { label: "Best score", value: "92%" },
          { label: "Avg. score", value: "84%" },
          { label: "Total attempts", value: 3 },
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
                <th className="px-5 py-3">Assessment</th>
                <th className="px-5 py-3">Questions</th>
                <th className="px-5 py-3">Duration</th>
                <th className="px-5 py-3">Best Score</th>
                <th className="px-5 py-3">Attempts</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {assessments.map((row) => (
                <tr key={row.code} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-900">{row.title}</p>
                    <p className="text-xs text-slate-500">{row.code}</p>
                  </td>
                  <td className="px-5 py-3">{row.questions}</td>
                  <td className="px-5 py-3">{row.duration}</td>
                  <td className="px-5 py-3">{row.bestScore}</td>
                  <td className="px-5 py-3">{row.attempts}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                        statusTone[row.status] ?? statusTone.Pending
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400"
                    >
                      {row.status === "Completed" ? "View report" : "Attempt now"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Mock data shown above. Wire to <code>assessments</code> +{" "}
        <code>assessment_attempts</code> tables. AI-generated quizzes will use
        schema-validated structured output.
      </p>
    </DashboardShell>
  );
}
