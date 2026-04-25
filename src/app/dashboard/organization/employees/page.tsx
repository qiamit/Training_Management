import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/utils/supabase/admin";

const config = roleConfigMap.organization;

type EmployeeRow = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  designation: string;
  mobile: string;
  isActive: boolean;
};

async function loadEmployees(authUserId: string): Promise<{
  rows: EmployeeRow[];
  orgName: string;
  error?: string;
}> {
  try {
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("org_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (profileError) {
      return { rows: [], orgName: "Your Organization", error: profileError.message };
    }
    const orgId = profile?.org_id as string | undefined;
    if (!orgId) {
      return { rows: [], orgName: "Your Organization" };
    }

    const [{ data: org }, employeesRes] = await Promise.all([
      admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      admin
        .from("users")
        .select(
          "id,auth_user_id,full_name,role,designation,mobile,is_active",
        )
        .eq("org_id", orgId),
    ]);

    if (employeesRes.error) {
      return {
        rows: [],
        orgName: org?.name ?? "Your Organization",
        error: employeesRes.error.message,
      };
    }

    const authIds = (employeesRes.data ?? [])
      .map((row) => String(row.auth_user_id ?? ""))
      .filter(Boolean);

    const emailsById: Record<string, string> = {};
    if (authIds.length > 0) {
      const { data: usersList } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      (usersList?.users ?? []).forEach((u) => {
        if (u.email) emailsById[u.id] = u.email;
      });
    }

    const rows: EmployeeRow[] = (employeesRes.data ?? []).map((row) => ({
      id: String(row.id ?? ""),
      fullName: String(row.full_name ?? ""),
      email: emailsById[String(row.auth_user_id ?? "")] ?? "",
      role: String(row.role ?? ""),
      designation: String(row.designation ?? ""),
      mobile: String(row.mobile ?? ""),
      isActive: row.is_active !== false,
    }));

    return { rows, orgName: org?.name ?? "Your Organization" };
  } catch (caughtError) {
    return {
      rows: [],
      orgName: "Your Organization",
      error:
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load employees.",
    };
  }
}

export default async function EmployeesModulePage() {
  const user = await requireAuthorizedUser({
    allowedAppRoles: ["tenant_admin", "quality_manager"],
    loginPath: "/login/organization",
  });

  const { rows, orgName, error } = await loadEmployees(user.id);

  return (
    <DashboardShell
      portalLabel="Organization"
      portalAccent={config.accent}
      userEmail={user.email ?? ""}
      userRoleLabel={appRoleLabel(String(user.app_metadata?.role ?? ""))}
      navItems={config.navItems}
      activeHref="/dashboard/organization/employees"
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
              {orgName}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              List of Employees
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage employees registered under your organization tenant.
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            + Invite Employee
          </button>
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
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Designation</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Mobile</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    No employees yet. Invite your first team member.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-semibold text-slate-900">
                      {row.fullName || "—"}
                    </td>
                    <td className="px-5 py-3">{row.designation || "—"}</td>
                    <td className="px-5 py-3">{row.email || "—"}</td>
                    <td className="px-5 py-3">{row.mobile || "—"}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                        {row.role || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                          row.isActive
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                            : "bg-slate-100 text-slate-600 ring-slate-200"
                        }`}
                      >
                        {row.isActive ? "Active" : "Inactive"}
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
