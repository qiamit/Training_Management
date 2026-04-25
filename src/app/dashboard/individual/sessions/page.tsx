import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";

const config = roleConfigMap.individual;

const sessions = [
  {
    title: "ISO 9001:2015 Foundations — Day 1",
    code: "QMS-101",
    date: "12 May 2026 · 10:00 IST",
    duration: "4 hours",
    mode: "Live (Zoom)",
    instructor: "Dr. Anjali Rao",
    status: "Upcoming",
  },
  {
    title: "Internal Auditor Programme — Module 3",
    code: "INT-AUD-150",
    date: "Self-paced",
    duration: "2 hours",
    mode: "Self-paced",
    instructor: "Recorded",
    status: "In Progress",
  },
  {
    title: "GMP — 21 CFR Part 11 — Day 2",
    code: "GMP-310",
    date: "03 Jun 2026 · 14:00 IST",
    duration: "4 hours",
    mode: "Hybrid",
    instructor: "Mr. Raghav Iyer",
    status: "Upcoming",
  },
  {
    title: "ISO 9001:2015 Foundations — Day 2",
    code: "QMS-101",
    date: "26 Apr 2026 · 10:00 IST",
    duration: "4 hours",
    mode: "Live (Zoom)",
    instructor: "Dr. Anjali Rao",
    status: "Completed",
  },
];

const statusTone: Record<string, string> = {
  Upcoming: "bg-amber-50 text-amber-700 ring-amber-100",
  "In Progress": "bg-indigo-50 text-indigo-700 ring-indigo-100",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-100",
};

export default async function SessionsModulePage() {
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
      activeHref="/dashboard/individual/sessions"
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
          Module
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">My Sessions</h1>
        <p className="mt-1 text-sm text-slate-600">
          All sessions assigned or enrolled — upcoming, in progress, and
          completed.
        </p>
      </section>

      <section className="grid gap-4">
        {sessions.map((session, index) => (
          <article
            key={`${session.code}-${index}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {session.code}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  {session.title}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {session.date} · {session.duration} · {session.mode}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Instructor: {session.instructor}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                    statusTone[session.status] ?? statusTone.Upcoming
                  }`}
                >
                  {session.status}
                </span>
                {session.status === "Upcoming" ? (
                  <button
                    type="button"
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400"
                  >
                    Join when live
                  </button>
                ) : session.status === "Completed" ? (
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    View attendance
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    Continue learning
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>

      <p className="text-xs text-slate-500">
        Mock data shown above. Wire to <code>sessions</code> +{" "}
        <code>session_attendance</code> tables and integrate Zoom join links.
      </p>
    </DashboardShell>
  );
}
