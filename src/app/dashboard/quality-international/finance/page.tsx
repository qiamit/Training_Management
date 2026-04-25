import { DashboardShell } from "@/components/dashboard-shell";
import { appRoleLabel, roleConfigMap } from "@/lib/auth/roles";
import { requireAuthorizedUser } from "@/lib/auth/session";

const config = roleConfigMap["quality-international"];

const invoices = [
  {
    id: "INV-2026-0184",
    customer: "Acme Pharma Pvt Ltd",
    programme: "ISO 9001:2015 Foundations",
    issued: "12 Apr 2026",
    due: "12 May 2026",
    amount: "₹ 1,80,000",
    status: "Paid",
  },
  {
    id: "INV-2026-0185",
    customer: "Bharat Energy Ltd",
    programme: "GMP — 21 CFR Part 11",
    issued: "15 Apr 2026",
    due: "15 May 2026",
    amount: "₹ 2,72,000",
    status: "Pending",
  },
  {
    id: "INV-2026-0186",
    customer: "MedLab Diagnostics",
    programme: "ISO/IEC 17025 Lab",
    issued: "20 Apr 2026",
    due: "20 May 2026",
    amount: "₹ 2,12,000",
    status: "Pending",
  },
  {
    id: "INV-2026-0181",
    customer: "Sunrise Manufacturing",
    programme: "Internal Auditor Programme",
    issued: "02 Apr 2026",
    due: "02 May 2026",
    amount: "₹ 95,000",
    status: "Overdue",
  },
];

const statusTone: Record<string, string> = {
  Paid: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  Pending: "bg-amber-50 text-amber-700 ring-amber-100",
  Overdue: "bg-rose-50 text-rose-700 ring-rose-100",
};

export default async function FinanceModulePage() {
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
      activeHref="/dashboard/quality-international/finance"
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Module
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Finance</h1>
        <p className="mt-1 text-sm text-slate-600">
          Invoices, revenue, and payouts across all organization tenants and
          individual learners.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Revenue (90d)", value: "₹ 24,30,500", sub: "vs ₹ 19.4L prior" },
          { label: "Outstanding", value: "₹ 4,87,000", sub: "across 6 invoices" },
          { label: "Overdue", value: "₹ 95,000", sub: "1 invoice" },
          { label: "Avg. Invoice", value: "₹ 1,68,400", sub: "trailing 90d" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {stat.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{stat.value}</p>
            <p className="mt-1 text-xs text-slate-500">{stat.sub}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <p className="text-sm font-semibold text-slate-700">Recent Invoices</p>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Invoice</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Programme</th>
                <th className="px-5 py-3">Issued</th>
                <th className="px-5 py-3">Due</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">
                    {invoice.id}
                  </td>
                  <td className="px-5 py-3 font-semibold text-slate-900">
                    {invoice.customer}
                  </td>
                  <td className="px-5 py-3">{invoice.programme}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {invoice.issued}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{invoice.due}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">
                    {invoice.amount}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                        statusTone[invoice.status] ?? statusTone.Pending
                      }`}
                    >
                      {invoice.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Mock data shown above. Wire to <code>invoices</code> /{" "}
        <code>payments</code> tables and integrate a payment provider in the next
        phase.
      </p>
    </DashboardShell>
  );
}
