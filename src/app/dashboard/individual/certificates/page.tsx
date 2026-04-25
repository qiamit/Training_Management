import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";

const config = roleConfigMap.individual;

const certificates = [
  {
    id: "QI-CERT-2026-04823",
    programme: "ISO 9001:2015 Foundations",
    issued: "10 Mar 2026",
    expires: "10 Mar 2029",
    status: "Active",
  },
  {
    id: "QI-CERT-2026-04127",
    programme: "Internal Auditor Programme",
    issued: "22 Feb 2026",
    expires: "22 Feb 2028",
    status: "Active",
  },
  {
    id: "QI-CERT-2025-09812",
    programme: "ISO/IEC 17025 Lab Awareness",
    issued: "15 Nov 2025",
    expires: "15 Nov 2027",
    status: "Active",
  },
  {
    id: "QI-CERT-2024-02233",
    programme: "GMP — Awareness",
    issued: "08 May 2024",
    expires: "08 May 2026",
    status: "Expiring Soon",
  },
  {
    id: "QI-CERT-2023-11410",
    programme: "FSSC 22000 Awareness",
    issued: "12 Aug 2023",
    expires: "12 Aug 2025",
    status: "Expired",
  },
];

const statusTone: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  "Expiring Soon": "bg-amber-50 text-amber-700 ring-amber-100",
  Expired: "bg-rose-50 text-rose-700 ring-rose-100",
  Revoked: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default async function CertificatesModulePage() {
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
      activeHref="/dashboard/individual/certificates"
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
          Module
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Certificates</h1>
        <p className="mt-1 text-sm text-slate-600">
          Download issued certificates and share QR-verifiable links.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {certificates.map((certificate) => (
          <article
            key={certificate.id}
            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-mono text-slate-500">{certificate.id}</p>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                  statusTone[certificate.status] ?? statusTone.Active
                }`}
              >
                {certificate.status}
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-slate-900">
              {certificate.programme}
            </h3>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>
                <dt className="font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Issued
                </dt>
                <dd>{certificate.issued}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Expires
                </dt>
                <dd>{certificate.expires}</dd>
              </div>
            </dl>
            <div className="mt-auto flex items-center gap-2 pt-4">
              <button
                type="button"
                className="flex-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Download PDF
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Verify link
              </button>
            </div>
          </article>
        ))}
      </section>

      <p className="text-xs text-slate-500">
        Mock data shown above. Wire to <code>certificates</code> table with
        immutable issuance records and a public{" "}
        <code>/verify/[uuid]</code> endpoint for QR validation.
      </p>
    </DashboardShell>
  );
}
