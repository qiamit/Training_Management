import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/utils/supabase/admin";

const config = roleConfigMap.organization;

async function loadOrgDetails(authUserId: string) {
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("org_id,full_name,designation,mobile,city,country")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    const orgId = profile?.org_id as string | undefined;
    if (!orgId) {
      return { profile, org: null };
    }

    const { data: org } = await admin
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .maybeSingle();

    return { profile, org };
  } catch {
    return { profile: null, org: null };
  }
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-800">{value || "—"}</p>
    </div>
  );
}

export default async function OrganizationDetailsModulePage() {
  const user = await requireAuthorizedUser({
    allowedAppRoles: ["tenant_admin", "quality_manager"],
    loginPath: "/login/organization",
  });

  const { profile, org } = await loadOrgDetails(user.id);

  return (
    <DashboardShell
      portalLabel="Organization"
      portalAccent={config.accent}
      userEmail={user.email ?? ""}
      userRoleLabel={appRoleLabel(String(user.app_metadata?.role ?? ""))}
      navItems={config.navItems}
      activeHref="/dashboard/organization/details"
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
          Module
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          Organization Details
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Profile, primary contact, address, and ISO accreditations on file.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-700">
            Organization profile
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ReadOnlyField
              label="Organization name"
              value={(org?.name as string | undefined) ?? null}
            />
            <ReadOnlyField
              label="ISO accreditations"
              value={
                Array.isArray(org?.iso_accreditations) &&
                org.iso_accreditations.length > 0
                  ? (org.iso_accreditations as string[]).join(", ")
                  : "—"
              }
            />
            <ReadOnlyField
              label="Tenant ID"
              value={(org?.id as string | undefined) ?? null}
            />
            <ReadOnlyField
              label="Created"
              value={
                org?.created_at
                  ? new Date(org.created_at as string).toLocaleDateString()
                  : null
              }
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-700">Primary contact</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Full name" value={profile?.full_name as string} />
            <ReadOnlyField
              label="Designation"
              value={profile?.designation as string}
            />
            <ReadOnlyField label="Email" value={user.email} />
            <ReadOnlyField label="Mobile" value={profile?.mobile as string} />
            <ReadOnlyField label="City" value={profile?.city as string} />
            <ReadOnlyField label="Country" value={profile?.country as string} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">Compliance posture</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { k: "Last audit", v: "Jan 2026" },
            { k: "Active certifications", v: "3" },
            { k: "Open NCRs", v: "0" },
          ].map((row) => (
            <div
              key={row.k}
              className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {row.k}
              </p>
              <p className="mt-1 text-base font-semibold text-slate-900">{row.v}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Editing organization profile via tenant admin will be wired in the
          next phase with audit logging.
        </p>
      </section>
    </DashboardShell>
  );
}
