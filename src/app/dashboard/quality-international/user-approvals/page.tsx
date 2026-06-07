import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";
import { claimsFromUser, getAppRole } from "@/lib/firebase/auth-user";
import { listAuthUsers } from "@/lib/firebase/auth-server";
import { getSignupMeta } from "@/lib/firebase/db";
import { approveUser, rejectUser } from "./actions";

const config = roleConfigMap["quality-international"];

const roleOptions = [
  "super_admin",
  "tenant_admin",
  "quality_manager",
  "individual",
  "employee",
  "trainee",
];

export default async function UserApprovalsPage() {
  const currentUser = await requireAuthorizedUser({
    allowedAppRoles: ["super_admin"],
    loginPath: "/login/quality-international",
  });

  let pendingUsers: Array<{
    id: string;
    email?: string;
    requestedPortal?: string;
    fullName?: string;
    organizationName?: string;
    designation?: string;
    mobile?: string;
    createdAt?: string;
  }> = [];
  let loadError = "";

  try {
    const authUsers = await listAuthUsers(200);
    const pending = authUsers.filter((user) => {
      const claims = claimsFromUser(user);
      const hasRole = Boolean(claims?.role);
      const approvalStatus = String(claims?.approval_status ?? "");
      return !hasRole && approvalStatus !== "rejected";
    });

    pendingUsers = await Promise.all(
      pending.map(async (user) => {
        const meta = await getSignupMeta(user.uid);
        return {
          id: user.uid,
          email: user.email,
          requestedPortal: meta?.requested_portal ?? "",
          fullName: meta?.full_name ?? user.displayName ?? "",
          organizationName: meta?.organization_name ?? "",
          designation: meta?.designation ?? "",
          mobile: meta?.mobile ?? "",
          createdAt: user.metadata.creationTime,
        };
      }),
    );
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Unable to load pending users.";
  }

  return (
    <DashboardShell
      portalLabel="Quality International"
      portalAccent={config.accent}
      userEmail={currentUser.email ?? ""}
      userRoleLabel={appRoleLabel(getAppRole(currentUser))}
      navItems={config.navItems}
      activeHref="/dashboard/quality-international/user-approvals"
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Quality International
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              User Approval Queue
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Review pending signup requests and assign the correct
              application role.
            </p>
          </div>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-100">
            {pendingUsers.length} pending
          </span>
        </div>
      </section>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      <section className="space-y-4">
        {pendingUsers.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
            All caught up — no pending signup requests right now.
          </div>
        ) : (
          pendingUsers.map((pendingUser) => (
            <article
              key={pendingUser.id}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Name
                    </p>
                    <p className="mt-1 text-slate-800">
                      {pendingUser.fullName || "Not provided"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Email
                    </p>
                    <p className="mt-1 text-slate-800">
                      {pendingUser.email || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Requested Portal
                    </p>
                    <p className="mt-1 text-slate-800">
                      {pendingUser.requestedPortal || "Not provided"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Organization
                    </p>
                    <p className="mt-1 text-slate-800">
                      {pendingUser.organizationName || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Designation
                    </p>
                    <p className="mt-1 text-slate-800">
                      {pendingUser.designation || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Mobile
                    </p>
                    <p className="mt-1 text-slate-800">
                      {pendingUser.mobile || "—"}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      User ID
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">
                      {pendingUser.id}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <form action={approveUser} className="flex flex-col gap-2">
                    <input type="hidden" name="userId" value={pendingUser.id} />
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Assign role
                    </label>
                    <select
                      name="role"
                      defaultValue="employee"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                    >
                      Approve
                    </button>
                  </form>

                  <form action={rejectUser}>
                    <input type="hidden" name="userId" value={pendingUser.id} />
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </DashboardShell>
  );
}
