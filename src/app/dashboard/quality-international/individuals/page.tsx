import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/utils/supabase/admin";

const config = roleConfigMap["quality-international"];

type IndividualRow = {
  id: string;
  email: string;
  fullName: string;
  mobile: string;
  city: string;
  country: string;
  role: string;
  createdAt?: string | null;
};

async function loadIndividuals(): Promise<{
  rows: IndividualRow[];
  error?: string;
}> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    if (error) {
      return { rows: [], error: error.message };
    }

    const rows = (data.users ?? [])
      .filter((u) => {
        const role = String(u.app_metadata?.role ?? "");
        return role === "individual" || role === "trainee";
      })
      .map((u) => ({
        id: u.id,
        email: u.email ?? "",
        fullName: String(u.user_metadata?.full_name ?? ""),
        mobile: String(u.user_metadata?.mobile ?? ""),
        city: String(u.user_metadata?.city ?? ""),
        country: String(u.user_metadata?.country ?? ""),
        role: String(u.app_metadata?.role ?? ""),
        createdAt: u.created_at,
      }));

    return { rows };
  } catch (caughtError) {
    return {
      rows: [],
      error:
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load individuals.",
    };
  }
}

export default async function IndividualsModulePage() {
  const user = await requireAuthorizedUser({
    allowedAppRoles: ["super_admin"],
    loginPath: "/login/quality-international",
  });

  const { rows, error } = await loadIndividuals();

  return (
    <DashboardShell
      portalLabel="Quality International"
      portalAccent={config.accent}
      userEmail={user.email ?? ""}
      userRoleLabel={appRoleLabel(String(user.app_metadata?.role ?? ""))}
      navItems={config.navItems}
      activeHref="/dashboard/quality-international/individuals"
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Module
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              Individual Learners
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              All independent learners signed up directly via the Individual
              portal.
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
            {rows.length} learners
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
                <th className="px-5 py-3">Learner</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Mobile</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    No individual learners yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">
                        {row.fullName || "—"}
                      </p>
                      <p className="text-xs text-slate-500">{row.id}</p>
                    </td>
                    <td className="px-5 py-3">{row.email}</td>
                    <td className="px-5 py-3">{row.mobile || "—"}</td>
                    <td className="px-5 py-3">
                      {[row.city, row.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                        {row.role || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {row.createdAt
                        ? new Date(row.createdAt).toLocaleDateString()
                        : "—"}
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
