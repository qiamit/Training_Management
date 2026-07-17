import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { BrandLockup } from "@/components/brand-mark";
import { useAuth } from "@/features/auth/AuthProvider";
import { BRAND } from "@/lib/brand";
import { supabase } from "@/lib/supabase/client";
import {
  LOGIN_ROLES,
  dashboardPathForRole,
  roleConfigMap,
  type LoginRole,
  type SignupField,
} from "@/lib/auth/roles";

function isLoginRole(value: string | undefined): value is LoginRole {
  return !!value && (LOGIN_ROLES as readonly string[]).includes(value);
}

const portalQuotes: Record<
  LoginRole,
  {
    left: Array<{ quote: string; author: string }>;
    right: Array<{ quote: string; author: string }>;
  }
> = {
  "quality-international": {
    left: [
      {
        quote:
          "Quality is not an act, it is a habit — build it into every training you deliver.",
        author: "Aristotle (adapted)",
      },
      {
        quote:
          "Excellence is the gradual result of always striving to do better.",
        author: "Pat Riley",
      },
    ],
    right: [
      {
        quote:
          "What gets measured gets managed — keep programmes, people, and progress visible.",
        author: "Peter Drucker (adapted)",
      },
      {
        quote:
          "The secret of change is to focus all your energy not on fighting the old, but on building the new.",
        author: "Socrates",
      },
    ],
  },
  trainer: {
    left: [
      {
        quote:
          "Teaching is the highest form of understanding — prepare every session with care.",
        author: "Aristotle (adapted)",
      },
      {
        quote:
          "A good trainer does not fill a bucket; they light a fire.",
        author: "W.B. Yeats (adapted)",
      },
    ],
    right: [
      {
        quote:
          "Practice isn't the thing you do once you're good. It's the thing you do that makes you good.",
        author: "Malcolm Gladwell (adapted)",
      },
      {
        quote:
          "The mediocre teacher tells. The good teacher explains. The great teacher inspires.",
        author: "William Arthur Ward",
      },
    ],
  },
  organization: {
    left: [
      {
        quote:
          "Train people well enough so they can leave. Treat them well enough so they don't want to.",
        author: "Richard Branson",
      },
      {
        quote:
          "An organization's ability to learn, and translate that learning into action, is the ultimate competitive advantage.",
        author: "Jack Welch",
      },
    ],
    right: [
      {
        quote:
          "Compliance is not a checklist — it is a culture built through planned training.",
        author: BRAND.shortName,
      },
      {
        quote:
          "The only thing worse than training your employees and having them leave is not training them and having them stay.",
        author: "Henry Ford (adapted)",
      },
    ],
  },
  individual: {
    left: [
      {
        quote:
          "Live as if you were to die tomorrow. Learn as if you were to live forever.",
        author: "Mahatma Gandhi",
      },
      {
        quote:
          "The beautiful thing about learning is that no one can take it away from you.",
        author: "B.B. King",
      },
    ],
    right: [
      {
        quote:
          "Skill is only developed by hours and hours of work — show up for every assigned session.",
        author: "Usain Bolt (adapted)",
      },
      {
        quote:
          "Education is the passport to the future, for tomorrow belongs to those who prepare for it today.",
        author: "Malcolm X",
      },
    ],
  },
};

const panelTone: Record<
  NonNullable<(typeof roleConfigMap)[LoginRole]["accent"]>,
  {
    left: string;
    right: string;
    badge: string;
    tab: string;
    ring: string;
    topBar: string;
  }
> = {
  indigo: {
    left: "linear-gradient(165deg, rgba(15,23,42,0.94) 0%, rgba(30,41,59,0.88) 55%, rgba(49,46,129,0.75) 100%)",
    right:
      "linear-gradient(195deg, rgba(15,23,42,0.94) 0%, rgba(30,41,59,0.9) 50%, rgba(67,56,202,0.7) 100%)",
    badge: "bg-slate-900/5 text-slate-700 ring-slate-300/80",
    tab: "border-indigo-600 text-indigo-700",
    ring: "focus:border-indigo-500 focus:ring-indigo-500/20",
    topBar: "bg-indigo-600",
  },
  emerald: {
    left: "linear-gradient(165deg, rgba(11,31,42,0.94) 0%, rgba(6,78,59,0.82) 100%)",
    right:
      "linear-gradient(195deg, rgba(11,31,42,0.94) 0%, rgba(15,118,110,0.78) 100%)",
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    tab: "border-emerald-600 text-emerald-700",
    ring: "focus:border-emerald-500 focus:ring-emerald-500/20",
    topBar: "bg-emerald-600",
  },
  amber: {
    left: "linear-gradient(165deg, rgba(28,25,23,0.94) 0%, rgba(120,53,15,0.82) 100%)",
    right:
      "linear-gradient(195deg, rgba(28,25,23,0.94) 0%, rgba(180,83,9,0.78) 100%)",
    badge: "bg-amber-50 text-amber-900 ring-amber-200",
    tab: "border-amber-600 text-amber-800",
    ring: "focus:border-amber-500 focus:ring-amber-500/20",
    topBar: "bg-amber-500",
  },
};

function QuotePanel({
  side,
  quotes,
  overlay,
  companyName,
}: {
  side: "left" | "right";
  quotes: Array<{ quote: string; author: string }>;
  overlay: string;
  companyName: string;
}) {
  return (
    <aside
      className={`relative hidden h-dvh overflow-hidden lg:block ${
        side === "left" ? "border-r border-white/10" : "border-l border-white/10"
      }`}
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            side === "left"
              ? "url(https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=1200&q=80)"
              : "url(https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80)",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0"
        style={{ background: overlay }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 15%, rgba(255,255,255,0.16), transparent 40%), radial-gradient(circle at 80% 85%, rgba(255,255,255,0.08), transparent 35%)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full flex-col px-8 py-12 xl:px-10 xl:py-14">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
            {companyName}
          </p>
          <p className="mt-3 text-sm font-semibold tracking-wide text-white">
            {side === "left" ? "Professional growth" : "Continuous learning"}
          </p>
          <div className="mt-4 h-px w-12 bg-white/35" />
        </div>

        <div className="flex flex-1 flex-col justify-center gap-16 xl:gap-20">
          {quotes.map((item, index) => (
            <blockquote key={item.quote} className="text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Quote {String(index + 1).padStart(2, "0")}
              </p>
              <p className="mt-4 text-[1.05rem] font-medium leading-8 tracking-tight text-white/95 xl:text-[1.15rem] xl:leading-9">
                “{item.quote}”
              </p>
              <footer className="mt-5 text-xs font-medium tracking-wide text-white/60">
                {item.author}
              </footer>
            </blockquote>
          ))}
        </div>

        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">
          Training & compliance
        </p>
      </div>
    </aside>
  );
}

export function LoginPage() {
  const { role: roleParam } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, signUp, profile, session, assertPortalAccess, loading } =
    useAuth();

  const portal = isLoginRole(roleParam) ? roleParam : null;
  const config = portal ? roleConfigMap[portal] : null;
  const inviteToken = searchParams.get("invite") ?? "";
  const initialMode =
    portal === "trainer"
      ? "login"
      : searchParams.get("mode") === "signup" || inviteToken
        ? "signup"
        : "login";

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [form, setForm] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = { inviteToken };
    if (portal === "organization") {
      base.industry = "testing_laboratory";
      base.employeeCount = "1-50";
      base.country = "India";
    }
    return base;
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [companyName, setCompanyName] = useState<string>(BRAND.shortName);
  const [contactEmail, setContactEmail] = useState<string | null>(BRAND.email);
  const isTrainerPortal = portal === "trainer";

  useEffect(() => {
    void supabase
      .from("organizations")
      .select("name, contact_email")
      .eq("type", "platform")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as {
          name?: string;
          contact_email?: string | null;
        } | null;
        const name = row?.name?.trim();
        if (name) setCompanyName(name);
        const email = row?.contact_email?.trim();
        if (email) setContactEmail(email);
      });
  }, []);

  useEffect(() => {
    if (isTrainerPortal && mode === "signup") {
      setMode("login");
    }
  }, [isTrainerPortal, mode]);

  const accentButton = useMemo(() => {
    return {
      indigo: "bg-indigo-600 hover:bg-indigo-500",
      emerald: "bg-emerald-600 hover:bg-emerald-500",
      amber: "bg-amber-500 hover:bg-amber-400",
    }[config?.accent ?? "indigo"];
  }, [config]);

  if (!portal || !config) {
    return <Navigate to="/" replace />;
  }

  const activePortal = portal;
  const activeConfig = config;
  const quotes = portalQuotes[activePortal];
  const tone = panelTone[activeConfig.accent];

  if (!loading && session && profile) {
    if (
      activePortal === "quality-international" &&
      profile.role === "trainer"
    ) {
      return <Navigate to="/login/trainer" replace />;
    }
    const gate = assertPortalAccess(activePortal);
    if (
      !gate ||
      (activePortal === "organization" && profile.role === "org_employee")
    ) {
      return <Navigate to={dashboardPathForRole(profile.role)} replace />;
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    try {
      if (mode === "login") {
        const result = await signIn(form.email ?? "", form.password ?? "");
        if (result.error) {
          setError(result.error);
          return;
        }

        const user = (await supabase.auth.getUser()).data.user;
        if (!user) {
          setError("Sign-in succeeded but session was not established.");
          return;
        }

        const { data: p, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          setError(profileError.message);
          return;
        }

        if (!p) {
          setError("Profile not found. Contact support.");
          return;
        }
        if (p.approval_status === "pending") {
          setError("Your account is pending approval by a super admin.");
          await supabase.auth.signOut();
          return;
        }
        if (p.approval_status === "rejected") {
          setError("Your account was rejected.");
          await supabase.auth.signOut();
          return;
        }

        const allowed = roleConfigMap[activePortal].allowedAppRoles;
        if (!allowed.includes(p.role)) {
          setError("You are not authorized for this login portal.");
          await supabase.auth.signOut();
          return;
        }

        if (activePortal === "quality-international" && p.role === "trainer") {
          setError(
            "Trainers must use Trainer Login. Open Login → Trainer Login from the home page.",
          );
          await supabase.auth.signOut();
          return;
        }

        navigate(dashboardPathForRole(p.role));
      } else {
        const payload: Record<string, string> = {
          ...form,
          inviteToken: form.inviteToken || inviteToken,
        };

        if (
          payload.confirmPassword !== undefined &&
          payload.password !== payload.confirmPassword
        ) {
          setError("Password and Retype Password do not match.");
          return;
        }
        if ((payload.password?.length ?? 0) < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }

        const signupPortal: LoginRole = activePortal;

        const result = await signUp(signupPortal, payload);
        if (result.error) {
          setError(result.error);
          return;
        }
        setMessage(result.message ?? "Account created.");
        if (result.message?.includes("signed in")) {
          const user = (await supabase.auth.getUser()).data.user;
          if (user) {
            const { data: p } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", user.id)
              .maybeSingle();
            if (p) {
              navigate(dashboardPathForRole(p.role));
              return;
            }
          }
          navigate(activeConfig.dashboardPath);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inviteFields: SignupField[] = [
    {
      name: "fullName",
      label: "Full Name",
      type: "text",
      required: true,
      placeholder: "Your full name",
    },
    {
      name: "email",
      label: "Work Email",
      type: "email",
      required: true,
      placeholder: "you@company.com",
    },
    {
      name: "mobile",
      label: "Mobile",
      type: "tel",
      required: true,
      placeholder: "+91 …",
    },
    {
      name: "password",
      label: "Password",
      type: "password",
      required: true,
      placeholder: "Minimum 8 characters",
      fullWidth: true,
    },
    {
      name: "inviteToken",
      label: "Invite Token",
      type: "text",
      required: true,
      placeholder: "Invite token",
      fullWidth: true,
      helpText: "Provided by your organization admin.",
    },
  ];

  const loginFields: SignupField[] = [
    {
      name: "email",
      label: "Email",
      type: "email",
      required: true,
      placeholder: "you@example.com",
      fullWidth: true,
    },
    {
      name: "password",
      label: "Password",
      type: "password",
      required: true,
      placeholder: "Your password",
      fullWidth: true,
    },
  ];

  const fields =
    mode === "login"
      ? loginFields
      : inviteToken || form.inviteToken
        ? inviteFields
        : activeConfig.signupFields;

  const isOrgSignup =
    activePortal === "organization" && mode === "signup" && !inviteToken;

  const spanClass: Record<1 | 2 | 3 | 4 | 6 | 12, string> = {
    1: "lg:col-span-1",
    2: "lg:col-span-2",
    3: "lg:col-span-3",
    4: "lg:col-span-4",
    6: "lg:col-span-6",
    12: "lg:col-span-12",
  };

  function fieldColClass(field: SignupField) {
    if (isOrgSignup) {
      if (field.span) return `col-span-1 sm:col-span-2 ${spanClass[field.span]} min-w-0`;
      if (field.fullWidth) return "col-span-1 sm:col-span-2 lg:col-span-12 min-w-0";
      return "col-span-1 sm:col-span-1 lg:col-span-3 min-w-0";
    }
    // Login & other signups: always full-width stacked fields
    return "col-span-1 min-w-0 w-full";
  }

  return (
    <div className="grid h-dvh grid-cols-1 overflow-hidden bg-[#f4f6f8] lg:grid-cols-[25%_50%_25%]">
      <QuotePanel
        side="left"
        quotes={quotes.left}
        overlay={tone.left}
        companyName={companyName}
      />

      <main className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f5f7f9]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(15,23,42,0.05), transparent 55%)",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-slate-200/90 bg-white/90 px-5 py-3.5 backdrop-blur sm:px-8">
          <BrandLockup />
          <Link
            to="/"
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            Home
          </Link>
        </div>

        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 sm:p-6 md:p-[10mm]">
            <div className="w-full max-w-3xl lg:max-w-none">
              <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
                <div className={`h-1.5 w-full ${tone.topBar}`} />

                <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-4 py-4 sm:px-7 sm:py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 ${tone.badge}`}
                      >
                        {activeConfig.tagline}
                      </p>
                      <h1 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 sm:text-[1.65rem]">
                        {isTrainerPortal || mode === "login"
                          ? `Welcome Back ${companyName}`
                          : `Join ${companyName}`}
                      </h1>
                    </div>
                    <span
                      className={`mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black tracking-wide text-white sm:h-11 sm:w-11 ${tone.topBar}`}
                      aria-hidden="true"
                    >
                      {companyName
                        .split(/[\s._-]+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((w) => w[0] ?? "")
                        .join("")
                        .toUpperCase() || "QI"}
                    </span>
                  </div>
                </div>

                <div className="px-4 py-5 sm:px-7 sm:py-7">
                  <form
                    onSubmit={onSubmit}
                    className={`grid gap-4 ${
                      isOrgSignup
                        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-12"
                        : "grid-cols-1"
                    }`}
                  >
                    {fields.map((field) => (
                      <label
                        key={field.name}
                        className={`block text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 ${fieldColClass(field)}`}
                      >
                        {field.label}
                        {field.type === "select" ? (
                          <select
                            required={field.required}
                            value={form[field.name] ?? ""}
                            onChange={(ev) =>
                              setForm((prev) => ({
                                ...prev,
                                [field.name]: ev.target.value,
                              }))
                            }
                            className={`mt-2 block w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition hover:border-slate-300 focus:bg-white focus:ring-4 ${tone.ring}`}
                          >
                            {field.options?.map((opt) => (
                              <option
                                key={opt.value || "empty"}
                                value={opt.value}
                              >
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type}
                            required={field.required}
                            placeholder={field.placeholder}
                            value={
                              form[field.name] ??
                              (field.name === "inviteToken" ? inviteToken : "")
                            }
                            onChange={(ev) =>
                              setForm((prev) => ({
                                ...prev,
                                [field.name]: ev.target.value,
                              }))
                            }
                            className={`mt-2 block w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:bg-white focus:ring-4 ${tone.ring}`}
                          />
                        )}
                        {field.helpText ? (
                          <span className="mt-1.5 block text-[11px] font-normal normal-case tracking-normal text-slate-500">
                            {field.helpText}
                          </span>
                        ) : null}
                      </label>
                    ))}

                    {error ? (
                      <p className="col-span-full rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                        {error}
                      </p>
                    ) : null}
                    {message ? (
                      <p className="col-span-full rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
                        {message}
                      </p>
                    ) : null}

                    <div
                      className={`col-span-full mt-2 grid gap-2.5 rounded-xl bg-slate-100 p-1.5 ${
                        isTrainerPortal
                          ? "grid-cols-1 sm:grid-cols-2"
                          : "grid-cols-2"
                      }`}
                    >
                      <button
                        type={
                          isTrainerPortal || mode === "login"
                            ? "submit"
                            : "button"
                        }
                        disabled={submitting}
                        onClick={() => {
                          if (!isTrainerPortal && mode !== "login") {
                            setMode("login");
                            setError(null);
                            setMessage(null);
                          }
                        }}
                        className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                          isTrainerPortal || mode === "login"
                            ? `text-white shadow-sm ${accentButton}`
                            : "bg-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                        }`}
                      >
                        {submitting && mode === "login"
                          ? "Please wait…"
                          : "Sign In"}
                      </button>
                      {isTrainerPortal ? (
                        <a
                          href={
                            contactEmail
                              ? `mailto:${contactEmail}?subject=${encodeURIComponent(
                                  `Trainer access request — ${companyName}`,
                                )}`
                              : "/#contact"
                          }
                          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                        >
                          Contact QI
                        </a>
                      ) : (
                        <button
                          type={mode === "signup" ? "submit" : "button"}
                          disabled={submitting}
                          onClick={() => {
                            if (mode !== "signup") {
                              setMode("signup");
                              setError(null);
                              setMessage(null);
                            }
                          }}
                          className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                            mode === "signup"
                              ? `text-white shadow-sm ${accentButton}`
                              : "bg-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                          }`}
                        >
                          {submitting && mode === "signup"
                            ? "Please wait…"
                            : "Sign Up"}
                        </button>
                      )}
                    </div>
                  </form>

                  <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">
                    {isTrainerPortal
                      ? "Trainer accounts are created by QI admin from the portal."
                      : `Secure access to ${companyName} training workspace`}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4 lg:hidden">
                {[...quotes.left, ...quotes.right].slice(0, 2).map((item) => (
                  <blockquote
                    key={item.quote}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-4"
                  >
                    <p className="text-sm leading-6 text-slate-700">
                      “{item.quote}”
                    </p>
                    <footer className="mt-3 text-[11px] font-medium text-slate-500">
                      {item.author}
                    </footer>
                  </blockquote>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <QuotePanel
        side="right"
        quotes={quotes.right}
        overlay={tone.right}
        companyName={companyName}
      />
    </div>
  );
}
