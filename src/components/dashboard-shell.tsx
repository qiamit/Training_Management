import Link from "next/link";

import { BrandLockup } from "@/components/brand-mark";
import { logout } from "@/app/(auth)/logout/actions";

export type DashboardNavItem = {
  label: string;
  href: string;
  description?: string;
  icon?: React.ReactNode;
};

export type DashboardShellProps = {
  portalLabel: string;
  portalAccent: "indigo" | "emerald" | "amber";
  userEmail: string;
  userRoleLabel: string;
  navItems: DashboardNavItem[];
  activeHref: string;
  children: React.ReactNode;
};

const accentMap: Record<DashboardShellProps["portalAccent"], string> = {
  indigo: "bg-indigo-600 text-white",
  emerald: "bg-emerald-600 text-white",
  amber: "bg-amber-500 text-white",
};

export function DashboardShell({
  portalLabel,
  portalAccent,
  userEmail,
  userRoleLabel,
  navItems,
  activeHref,
  children,
}: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-[1400px] gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-64 shrink-0 flex-col gap-6 lg:flex">
          <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-lg shadow-slate-400/30">
            <BrandLockup variant="light" tagline={portalLabel} />
          </div>

          <nav className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            {navItems.map((item) => {
              const isActive =
                activeHref === item.href ||
                (item.href !== navItems[0]?.href &&
                  activeHref.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span
                    className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${
                      isActive
                        ? "bg-white/15 text-white"
                        : "bg-slate-100 text-slate-500 group-hover:bg-white"
                    }`}
                    aria-hidden="true"
                  >
                    {item.icon ?? item.label.slice(0, 1)}
                  </span>
                  <span className="leading-tight">
                    <span className="block">{item.label}</span>
                    {item.description ? (
                      <span
                        className={`text-[11px] font-normal ${
                          isActive ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-sm">
            <p className="font-semibold text-slate-700">Compliance</p>
            <p className="mt-1 leading-5">
              ISO 17025 / 21 CFR Part 11 audit-grade trail enabled across
              attendance, evaluations, and certificates.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
            <div className="flex items-center gap-3 lg:hidden">
              <BrandLockup tagline={portalLabel} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${accentMap[portalAccent]}`}
              >
                {portalLabel}
              </span>
              <span className="text-xs text-slate-500">
                Signed in as <strong className="text-slate-800">{userEmail}</strong>{" "}
                ({userRoleLabel})
              </span>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Sign out
              </button>
            </form>
          </header>

          <main className="flex flex-col gap-6">{children}</main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-slate-200 bg-white/90 px-2 py-2 shadow-lg backdrop-blur lg:hidden">
        {navItems.slice(0, 5).map((item) => {
          const isActive =
            activeHref === item.href || activeHref.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[72px] flex-1 flex-col items-center rounded-lg px-2 py-1 text-[10px] font-semibold ${
                isActive ? "bg-slate-900 text-white" : "text-slate-600"
              }`}
            >
              <span className="text-sm">{item.icon ?? item.label.slice(0, 1)}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
