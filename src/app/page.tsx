import Link from "next/link";

import { BrandLockup } from "@/components/brand-mark";
import { roleConfigMap, type LoginRole } from "@/lib/auth/roles";

const portals: Array<{
  role: LoginRole;
  title: string;
  description: string;
  bullets: string[];
  ctaLabel: string;
  accent: "indigo" | "emerald" | "amber";
}> = [
  {
    role: "quality-international",
    title: "Quality International",
    description:
      "Platform super admins manage all tenants, training programmes, finance, and compliance trends.",
    bullets: [
      "Approve organization & individual signups",
      "Curate training catalog and schedules",
      "Track invoices, revenue and payouts",
    ],
    ctaLabel: "Login as Quality International",
    accent: "indigo",
  },
  {
    role: "organization",
    title: "Organization",
    description:
      "Tenant admins onboard employees, plan training, and monitor competency status across the workforce.",
    bullets: [
      "Manage employee directory and roles",
      "Plan and request training programmes",
      "Track attendance, scores and certificates",
    ],
    ctaLabel: "Login as Organization",
    accent: "emerald",
  },
  {
    role: "individual",
    title: "Individual Learner",
    description:
      "Independent learners enroll in programmes, attempt evaluations, and receive verifiable certificates.",
    bullets: [
      "Browse and enroll in upcoming sessions",
      "Attempt assessments and view scores",
      "Download QR-verifiable certificates",
    ],
    ctaLabel: "Login as Individual",
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
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 500px at 10% -10%, rgba(99,102,241,0.25), transparent), radial-gradient(900px 600px at 90% 10%, rgba(16,185,129,0.18), transparent), radial-gradient(700px 500px at 50% 110%, rgba(245,158,11,0.15), transparent)",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <BrandLockup variant="light" />
        <nav className="hidden items-center gap-6 text-xs font-medium text-slate-300 md:flex">
          <a href="#portals" className="hover:text-white">
            Portals
          </a>
          <a href="#features" className="hover:text-white">
            Features
          </a>
          <a href="#compliance" className="hover:text-white">
            Compliance
          </a>
          <Link
            href="/login/quality-international"
            className="rounded-lg border border-white/20 px-3 py-1.5 text-white hover:bg-white/10"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 pt-6 sm:pt-10">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
              Multi-Tenant SaaS · ISO Audit Ready
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              The Training & Compliance OS for{" "}
              <span className="bg-gradient-to-r from-indigo-300 via-emerald-300 to-amber-300 bg-clip-text text-transparent">
                modern organizations
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
              Quality International is a single platform to plan trainings,
              run live sessions, evaluate learners, and issue verifiable
              certificates — with strict tenant isolation and immutable audit
              trails for ISO 17025 / 21 CFR Part 11 readiness.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#portals"
                className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-slate-950/40 transition hover:bg-slate-200"
              >
                Choose your portal
              </a>
              <Link
                href="/login/organization?mode=signup"
                className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Create organization account
              </Link>
            </div>

            <dl className="mt-10 grid grid-cols-3 gap-4">
              {[
                { k: "Tenants onboarded", v: "120+" },
                { k: "Trainings delivered", v: "2,400+" },
                { k: "Certificates issued", v: "18,000+" },
              ].map((stat) => (
                <div
                  key={stat.k}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {stat.k}
                  </dt>
                  <dd className="mt-1 text-2xl font-bold text-white">{stat.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                Live across roles
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                One platform, role-aware experiences
              </h2>
              <ul className="mt-5 space-y-3 text-sm text-slate-200">
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-indigo-400" />
                  Super Admin orchestrates organizations, programmes & finance
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                  Tenant Admin manages employees, training plan & compliance
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-amber-300" />
                  Learner attends sessions, attempts evaluations, downloads
                  certificates
                </li>
              </ul>
              <div className="mt-6 grid grid-cols-3 gap-2 text-center">
                {portals.map((portal) => (
                  <Link
                    key={portal.role}
                    href={roleConfigMap[portal.role].loginPath}
                    className={`rounded-xl border border-white/10 bg-white/5 px-2 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/10 ring-1 ${accentBadge[portal.accent]}`}
                  >
                    {portal.title.split(" ")[0]}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="portals"
        className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20"
      >
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Choose your portal
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
              Sign in to the experience built for your role
            </h2>
          </div>
          <p className="max-w-md text-sm text-slate-300">
            Strict role-aware access. Each portal enforces its own permissions,
            module visibility, and audit context.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {portals.map((portal) => (
            <article
              key={portal.role}
              className={`group flex h-full flex-col rounded-3xl bg-white p-6 text-slate-900 shadow-xl shadow-slate-950/30 ring-1 transition ${accentRing[portal.accent]}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ring-1 ${accentBadge[portal.accent]}`}
                >
                  {portal.title}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Portal
                </span>
              </div>
              <h3 className="mt-4 text-xl font-semibold">{portal.title} Login</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {portal.description}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {portal.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 rounded-full ${
                        portal.accent === "indigo"
                          ? "bg-indigo-500"
                          : portal.accent === "emerald"
                            ? "bg-emerald-500"
                            : "bg-amber-500"
                      }`}
                    />
                    {bullet}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-col gap-2 pt-6">
                <Link
                  href={roleConfigMap[portal.role].loginPath}
                  className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${accentButton[portal.accent]}`}
                >
                  {portal.ctaLabel}
                </Link>
                <Link
                  href={`${roleConfigMap[portal.role].loginPath}?mode=signup`}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Create account
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        id="features"
        className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Multi-Tenant Isolation",
              copy: "Postgres RLS + JWT org claims keep tenant data isolated by design.",
            },
            {
              title: "Live Training Delivery",
              copy: "Scheduling and attendance evidence integrated with Zoom OAuth.",
            },
            {
              title: "Assessment Engine",
              copy: "Structured AI-generated quizzes with deterministic grading storage.",
            },
            {
              title: "Verifiable Certificates",
              copy: "Issue immutable certificates with public QR verification endpoints.",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <p className="text-sm font-semibold text-white">{feature.title}</p>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                {feature.copy}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer
        id="compliance"
        className="relative z-10 border-t border-white/10 bg-slate-950/60"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-slate-400">
          <p>
            © {new Date().getFullYear()} Quality International · Audit-ready
            training platform
          </p>
          <p className="text-slate-500">
            ISO 17025 · 21 CFR Part 11 · GDPR-aware
          </p>
        </div>
      </footer>
    </div>
  );
}
