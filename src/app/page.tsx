import Link from "next/link";

import { BrandLockup } from "@/components/brand-mark";
import { roleConfigMap, type LoginRole } from "@/lib/auth/roles";

const portals: Array<{
  role: LoginRole;
  title: string;
  description: string;
  ctaLabel: string;
  signupLabel: string;
  shortTag: string;
  accent: "indigo" | "emerald" | "amber";
}> = [
  {
    role: "organization",
    title: "Organization",
    description:
      "Tenant admins onboard employees and run training plans with compliance tracking.",
    ctaLabel: "Login as Organization",
    signupLabel: "Create organization",
    shortTag: "ORG",
    accent: "emerald",
  },
  {
    role: "individual",
    title: "Individual Learner",
    description:
      "Learners attend sessions, attempt assessments, and download certificates.",
    ctaLabel: "Login as Individual",
    signupLabel: "Create learner account",
    shortTag: "IND",
    accent: "amber",
  },
];

const accentRing: Record<"indigo" | "emerald" | "amber", string> = {
  indigo: "ring-indigo-100 hover:ring-indigo-200",
  emerald: "ring-emerald-100 hover:ring-emerald-200",
  amber: "ring-amber-100 hover:ring-amber-200",
};

const accentBadge: Record<"indigo" | "emerald" | "amber", string> = {
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
};

const accentButton: Record<"indigo" | "emerald" | "amber", string> = {
  indigo: "bg-indigo-600 hover:bg-indigo-500",
  emerald: "bg-emerald-600 hover:bg-emerald-500",
  amber: "bg-amber-500 hover:bg-amber-400",
};

export default function Home() {
  return (
    <div className="relative h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 500px at 10% -10%, rgba(99,102,241,0.25), transparent), radial-gradient(900px 600px at 90% 10%, rgba(16,185,129,0.18), transparent), radial-gradient(700px 500px at 50% 110%, rgba(245,158,11,0.15), transparent)",
        }}
      />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col px-6 py-4 md:py-6">
        <header className="flex items-center justify-between">
          <BrandLockup variant="light" />
          <Link
            href="/login/quality-international"
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            QI Login
          </Link>
        </header>

        <main className="mt-5 grid min-h-0 flex-1 grid-rows-[auto_1fr_auto] gap-4 md:gap-5">
          <section>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">
              Multi-Tenant SaaS · ISO Audit Ready
            </span>
            <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl lg:text-4xl">
              Training & Compliance OS for modern organizations
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Role-aware portals for Quality International, Organization Admins,
              and Individual Learners.
            </p>
          </section>

          <section className="min-h-0">
            <div className="grid h-full min-h-0 gap-3 md:grid-cols-2">
              {portals.map((portal) => (
                <article
                  key={portal.role}
                  className={`flex min-h-0 flex-col rounded-2xl bg-white p-4 text-slate-900 shadow-xl shadow-slate-950/20 ring-1 ${accentRing[portal.accent]}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ring-1 ${accentBadge[portal.accent]}`}
                    >
                      {portal.shortTag}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                      Portal
                    </span>
                  </div>
                  <h2 className="mt-2 text-base font-semibold">{portal.title}</h2>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600">
                    {portal.description}
                  </p>
                  <div className="mt-auto flex flex-col gap-2 pt-3">
                    <Link
                      href={roleConfigMap[portal.role].loginPath}
                      className={`inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${accentButton[portal.accent]}`}
                    >
                      {portal.ctaLabel}
                    </Link>
                    <Link
                      href={`${roleConfigMap[portal.role].loginPath}?mode=signup`}
                      className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {portal.signupLabel}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] text-slate-400">
            <p>© {new Date().getFullYear()} Quality International</p>
            <p className="text-slate-500">ISO 17025 · 21 CFR Part 11</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
