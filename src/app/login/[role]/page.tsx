import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandLockup } from "@/components/brand-mark";
import {
  isLoginRole,
  LOGIN_ROLES,
  roleConfigMap,
  type LoginRole,
  type SignupField,
} from "@/lib/auth/roles";
import { loginWithRole, signupWithRole } from "./actions";

export function generateStaticParams() {
  return LOGIN_ROLES.map((role) => ({ role }));
}

const accentBadge: Record<"indigo" | "emerald" | "amber", string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
};

const accentButton: Record<"indigo" | "emerald" | "amber", string> = {
  indigo: "bg-indigo-600 hover:bg-indigo-500",
  emerald: "bg-emerald-600 hover:bg-emerald-500",
  amber: "bg-amber-500 hover:bg-amber-400",
};

const accentChip: Record<"indigo" | "emerald" | "amber", string> = {
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
};

function FieldInput({ field }: { field: SignupField }) {
  const baseInputClass =
    "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-900/10 placeholder:text-slate-400 focus:border-slate-500 focus:ring-2";

  return (
    <div className={field.fullWidth ? "sm:col-span-2" : undefined}>
      <label
        htmlFor={field.name}
        className="mb-1.5 block text-sm font-medium text-slate-700"
      >
        {field.label}
        {field.required ? <span className="text-rose-500"> *</span> : null}
      </label>
      {field.type === "select" ? (
        <select
          id={field.name}
          name={field.name}
          required={field.required}
          defaultValue=""
          className={baseInputClass}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={field.name}
          name={field.name}
          type={field.type}
          placeholder={field.placeholder}
          required={field.required}
          autoComplete={
            field.type === "password"
              ? "new-password"
              : field.type === "email"
                ? "email"
                : "off"
          }
          className={baseInputClass}
        />
      )}
      {field.helpText ? (
        <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
          {field.helpText}
        </p>
      ) : null}
    </div>
  );
}

export default async function RoleLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string }>;
  searchParams: Promise<{ error?: string; success?: string; mode?: string }>;
}) {
  const [{ role }, query] = await Promise.all([params, searchParams]);
  const portal = isLoginRole(role) ? (role as LoginRole) : null;
  if (!portal) {
    notFound();
  }

  const config = roleConfigMap[portal];
  const loginAction = loginWithRole.bind(null, portal);
  const signupAction = signupWithRole.bind(null, portal);
  const isSignupMode = query.mode === "signup";

  const otherPortals = LOGIN_ROLES.filter((r) => r !== portal);

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            config.accent === "indigo"
              ? "radial-gradient(900px 600px at 10% -10%, rgba(99,102,241,0.35), transparent), radial-gradient(800px 600px at 90% 110%, rgba(99,102,241,0.18), transparent)"
              : config.accent === "emerald"
                ? "radial-gradient(900px 600px at 10% -10%, rgba(16,185,129,0.30), transparent), radial-gradient(800px 600px at 90% 110%, rgba(16,185,129,0.18), transparent)"
                : "radial-gradient(900px 600px at 10% -10%, rgba(245,158,11,0.30), transparent), radial-gradient(800px 600px at 90% 110%, rgba(245,158,11,0.18), transparent)",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/">
          <BrandLockup variant="light" tagline={config.tagline} />
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
        >
          ← All Portals
        </Link>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl gap-8 px-6 pb-16 lg:grid-cols-[1fr_1.05fr]">
        <section className="hidden lg:block">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ring-1 ${accentChip[config.accent]}`}
          >
            <span className={`h-2 w-2 rounded-full ${accentBadge[config.accent]}`} />
            {config.tagline}
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight text-white">
            {config.heading}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-slate-300">
            {config.subheading}
          </p>

          <div className="mt-8 space-y-3">
            {[
              {
                title: "Role-aware modules",
                desc: "Only the modules relevant to your role appear after sign in.",
              },
              {
                title: "Tenant-isolated data",
                desc: "Firestore security rules enforce strict separation of organizations and learners.",
              },
              {
                title: "Audit-grade trail",
                desc: "Every approval, attendance and certificate event is logged immutably.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-300">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Switch portal
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {otherPortals.map((other) => (
                <Link
                  key={other}
                  href={roleConfigMap[other].loginPath}
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                >
                  {roleConfigMap[other].heading}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-950/40">
          <div className="border-b border-slate-200 bg-slate-50 px-7 py-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
              {config.tagline}
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {isSignupMode ? `Create ${config.heading} Account` : config.heading}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {isSignupMode
                ? "Provide accurate details — these are recorded against an audit trail."
                : "Welcome back. Sign in to continue."}
            </p>
          </div>

          <div className="px-7 py-6">
            <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1 text-sm">
              <Link
                href={`/login/${portal}`}
                className={`rounded-lg px-3 py-2.5 text-center font-semibold transition ${
                  isSignupMode
                    ? "text-slate-500 hover:text-slate-700"
                    : "bg-white text-slate-900 shadow-sm"
                }`}
              >
                Login
              </Link>
              <Link
                href={`/login/${portal}?mode=signup`}
                className={`rounded-lg px-3 py-2.5 text-center font-semibold transition ${
                  isSignupMode
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Signup
              </Link>
            </div>

            {query.error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {query.error}
              </div>
            ) : null}
            {query.success ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                {query.success}
              </div>
            ) : null}

            {isSignupMode ? (
              <form action={signupAction} className="mt-5 space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {config.signupFields.map((field) => (
                    <FieldInput key={field.name} field={field} />
                  ))}
                </div>

                <label className="flex items-start gap-3 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    name="acceptTerms"
                    required
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    I confirm the information is accurate and I agree to the{" "}
                    <span className="font-semibold text-slate-800">
                      Terms of Use
                    </span>{" "}
                    and{" "}
                    <span className="font-semibold text-slate-800">
                      Data Processing
                    </span>{" "}
                    policy. Quality International maintains immutable audit logs.
                  </span>
                </label>

                <button
                  type="submit"
                  className={`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition ${accentButton[config.accent]}`}
                >
                  Create {config.heading} Account
                </button>
                <p className="text-center text-xs text-slate-500">
                  Already registered?{" "}
                  <Link
                    href={`/login/${portal}`}
                    className="font-semibold text-slate-800 hover:underline"
                  >
                    Sign in instead
                  </Link>
                </p>
              </form>
            ) : (
              <form action={loginAction} className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Work Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="name@company.com"
                    autoComplete="email"
                    required
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-900/10 placeholder:text-slate-400 focus:border-slate-500 focus:ring-2"
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Password
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Forgot password? Contact your administrator.
                    </span>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-900/10 placeholder:text-slate-400 focus:border-slate-500 focus:ring-2"
                  />
                </div>

                <button
                  type="submit"
                  className={`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition ${accentButton[config.accent]}`}
                >
                  Sign in as {config.primaryRoleLabel}
                </button>

                <p className="text-center text-xs text-slate-500">
                  New here?{" "}
                  <Link
                    href={`/login/${portal}?mode=signup`}
                    className="font-semibold text-slate-800 hover:underline"
                  >
                    Create a {config.heading.toLowerCase()} account
                  </Link>
                </p>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
