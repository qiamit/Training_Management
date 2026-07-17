import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BRAND, brandMapsUrl, brandPhoneTel } from "@/lib/brand";
import { supabase } from "@/lib/supabase/client";

type ContactInfoPopup = "address" | "contact" | null;

type UpcomingTrainingRow = {
  training_code: string;
  title: string;
  programme_title: string | null;
  training_date: string | null;
  status: string;
  mode: string;
};

type UpcomingFilter = "all" | "ongoing" | "scheduled" | "completed" | "hold";

function normalizeTrainingStatus(status: string) {
  return status.trim().toLowerCase().replace(/_/g, " ");
}

function isOngoingTraining(status: string) {
  const value = normalizeTrainingStatus(status);
  return value === "in progress" || value === "ongoing";
}

function isScheduledTraining(status: string) {
  return normalizeTrainingStatus(status) === "scheduled";
}

const loginOptions = [
  {
    role: "organization" as const,
    label: "Organization Login",
    hint: "Labs, plants & tenant admins",
    mark: "OR",
    markClass: "bg-[#2a4a6a]/45 text-[#d7e6f4] ring-[#7ea3c4]/35",
  },
  {
    role: "individual" as const,
    label: "Individual Login",
    hint: "Learners & organization employees",
    mark: "IN",
    markClass: "bg-[#3a556f]/50 text-[#e8eef5] ring-[#9bb4c9]/30",
  },
  {
    role: "trainer" as const,
    label: "Trainer Login",
    hint: "All trainers — deliver & evaluate sessions",
    mark: "TR",
    markClass: "bg-[#1e4d72]/55 text-[#dceaf6] ring-[#6f9bc0]/35",
  },
  {
    role: "quality-international" as const,
    label: "QI Staff Login",
    hint: "Platform operators & QI staff",
    mark: "QI",
    markClass: "bg-white/12 text-white ring-white/25",
  },
];

const contactPeople = [
  { name: "R Prakash", phone: "9711217494" },
  { name: "Amit Kumar", phone: "9041063388" },
] as const;

const aboutSteps = [
  {
    step: "01",
    title: "Assess competence gaps",
    body: "Map skill gaps to standards, SOPs, methods, and audit expectations.",
  },
  {
    step: "02",
    title: "Deliver targeted training",
    body: "Run online, on-site, and blended programmes with lab-experienced trainers.",
  },
  {
    step: "03",
    title: "Prove & sustain excellence",
    body: "Evaluate outcomes, issue certificates, and keep teams audit-ready.",
  },
];

const services = [
  {
    title: "Training according to your yearly plans",
    body: "We plan, schedule, and deliver competence training aligned to your annual laboratory training calendar.",
  },
  {
    title: "Trainings on your programmes",
    body: "Custom sessions built around your SOPs, methods, instruments, and quality system requirements.",
  },
  {
    title: "Technical training on test methods",
    body: "Hands-on and method-focused training for analysts covering technique, accuracy, and documentation.",
  },
  {
    title: "Internal audit of your lab",
    body: "Independent internal audits as per ISO/IEC 17025 and ISO/IEC 17043 with clear findings and follow-up.",
  },
  {
    title: "Competence evaluation & certificates",
    body: "Assessments, effectiveness review, and training certificates that support NABL and accreditation evidence.",
  },
  {
    title: "Online & expert-led delivery",
    body: "Zoom, Google Meet, Webex, and Teams sessions with expert trainers and structured learning records.",
  },
  {
    title: "Audit-ready training records",
    body: "Attendance, evaluations, and certificates organized so your lab stays ready for surveillance and reassessment.",
  },
  {
    title: "Uncertainty of measurement training",
    body: "Practical GUM-based sessions to build reliable uncertainty budgets for methods, instruments, and reporting.",
  },
  {
    title: "Quality system & documentation coaching",
    body: "Guidance on quality manuals, SOPs, forms, and controlled records aligned to accreditation requirements.",
  },
  {
    title: "On-site & blended training support",
    body: "Flexible delivery at your laboratory or in hybrid format so teams can learn without disrupting operations.",
  },
];

const whyQi = [
  {
    title: "Laboratory-first expertise",
    body: "Built for testing, calibration, and PT labs — not generic corporate training.",
  },
  {
    title: "End-to-end ownership",
    body: "From yearly plan to delivery, evaluation, and records — one managed cycle.",
  },
  {
    title: "Standards-aligned approach",
    body: "Mapped to ISO/IEC 17025, ISO/IEC 17043, and accreditation expectations.",
  },
];

export function LandingPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [infoPopup, setInfoPopup] = useState<ContactInfoPopup>(null);
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);
  const [upcomingRows, setUpcomingRows] = useState<UpcomingTrainingRow[]>([]);
  const [upcomingFilter, setUpcomingFilter] = useState<UpcomingFilter>("all");
  const [actionTraining, setActionTraining] =
    useState<UpcomingTrainingRow | null>(null);
  const loginRef = useRef<HTMLDivElement>(null);

  const filteredUpcomingRows = useMemo(() => {
    if (upcomingFilter === "all") return upcomingRows;
    return upcomingRows.filter((row) => {
      const status = normalizeTrainingStatus(row.status);
      if (upcomingFilter === "ongoing") return isOngoingTraining(row.status);
      if (upcomingFilter === "scheduled") return status === "scheduled";
      if (upcomingFilter === "completed") return status === "completed";
      if (upcomingFilter === "hold") return status === "hold";
      return true;
    });
  }, [upcomingFilter, upcomingRows]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!loginRef.current?.contains(event.target as Node)) {
        setLoginOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLoginOpen(false);
        setInfoPopup(null);
        setActionTraining(null);
        setUpcomingOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!upcomingOpen) {
      setUpcomingFilter("all");
      setActionTraining(null);
      return;
    }

    let cancelled = false;
    async function loadUpcoming() {
      setUpcomingLoading(true);
      setUpcomingError(null);
      const { data, error } = await supabase.rpc("list_upcoming_trainings");
      if (cancelled) return;
      if (error) {
        setUpcomingRows([]);
        setUpcomingError(error.message);
      } else {
        setUpcomingRows((data ?? []) as UpcomingTrainingRow[]);
      }
      setUpcomingLoading(false);
    }

    void loadUpcoming();
    return () => {
      cancelled = true;
    };
  }, [upcomingOpen]);

  return (
    <div className="landing-root flex min-h-dvh flex-col overflow-visible bg-[#06101c] text-[#c2d4e8] xl:h-dvh xl:overflow-hidden">
      <style>{`
        .landing-root {
          font-family: Arial, Helvetica, sans-serif;
          --ink: #06101c;
          --panel: #0c1828;
          --panel-2: #122238;
          --line: rgba(196, 170, 120, 0.18);
          --muted: rgba(214, 222, 232, 0.82);
          --soft: rgba(184, 196, 212, 0.68);
          --accent: #d4a857;
          --cta: #1f5f8b;
          --cta-hover: #2874a8;
        }
        .landing-display {
          font-family: Arial, Helvetica, sans-serif;
        }
        @keyframes landing-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes landing-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .landing-rise {
          animation: landing-rise 0.7s ease-out both;
        }
        .landing-rise-delay {
          animation: landing-rise 0.8s ease-out 0.12s both;
        }
        .landing-fade {
          animation: landing-fade 1s ease-out 0.2s both;
        }
      `}</style>

      <header className="z-30 shrink-0 border-b border-[color:var(--line)] bg-[#06101c]/95 text-[#f0d49a] shadow-[0_8px_30px_rgba(0,0,0,0.16)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:gap-5 sm:px-6 lg:px-8">
          <a href="#home" className="group min-w-0 flex-1">
            <p className="landing-display bg-gradient-to-r from-[#f0d49a] via-[#f7e3b8] to-[#7eb6e0] bg-clip-text text-lg font-bold leading-snug tracking-tight text-transparent sm:whitespace-nowrap sm:text-2xl lg:text-3xl">
              Quality International Compliance &amp; Training Private Limited
            </p>
          </a>

          <div className="relative shrink-0" ref={loginRef}>
            <button
              type="button"
              aria-expanded={loginOpen}
              aria-haspopup="menu"
              onClick={() => setLoginOpen((open) => !open)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#1f5f8b] px-3.5 py-2 text-sm font-bold text-white shadow-[0_8px_24px_rgba(31,95,139,0.32)] transition hover:bg-[#2874a8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a857]"
            >
              Login
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`h-4 w-4 transition-transform ${loginOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {loginOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-40 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[#0f1c2e] shadow-2xl shadow-black/45"
              >
                <p className="border-b border-[color:var(--line)] px-4 py-2.5 text-[11px] font-semibold tracking-wide text-[#d4a857]">
                  Choose Portal
                </p>
                {loginOptions.map((option) => (
                  <Link
                    key={option.role}
                    role="menuitem"
                    to={`/login/${option.role}`}
                    onClick={() => setLoginOpen(false)}
                    className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-3.5 transition last:border-b-0 hover:bg-white/[0.05]"
                  >
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tracking-wide ring-1 ${option.markClass}`}
                      aria-hidden="true"
                    >
                      {option.mark}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[#f0d49a]">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-[#b7c4d4]">
                        {option.hint}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 overflow-visible xl:min-h-0 xl:grid-cols-[25%_50%_25%] xl:overflow-hidden">
        <aside
          className="relative order-3 flex min-h-0 flex-col overflow-visible border-b border-[color:var(--line)] xl:order-none xl:overflow-hidden xl:border-b-0 xl:border-r"
        >
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "url(https://images.unsplash.com/photo-1581093583386-42c3c5d5c0a4?auto=format&fit=crop&w=1200&q=80)",
            }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(6,16,28,0.94) 0%, rgba(14,28,46,0.96) 100%)",
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 flex min-h-0 flex-col overflow-visible xl:h-full xl:overflow-hidden">
            <section
              id="about"
              className="flex min-h-0 flex-1 flex-col justify-center gap-3 px-5 py-5 sm:px-7 xl:gap-2.5 xl:px-6 xl:py-4"
            >
              <div>
                <p className="text-xs font-bold tracking-wide text-[#d4a857]">
                  About
                </p>
                <h2 className="landing-display mt-1 text-xl font-bold tracking-tight text-[#f0d49a] xl:text-lg">
                  Competence training for audit-ready laboratories
                </h2>
                <p className="mt-1.5 text-sm leading-5 text-[#a9bdd4]">
                  {BRAND.shortName} designs, delivers, and verifies compliance
                  training so labs stay aligned to accreditation and day-to-day
                  competence needs.
                </p>
              </div>

              <div className="space-y-2">
                {aboutSteps.map((item) => (
                  <div key={item.step}>
                    <p className="landing-display text-xs font-bold tracking-[0.14em] text-[#e0b96a]">
                      {item.step}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-[#f0d49a]">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-4 text-[#93a9c2]">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section
              id="why"
              className="flex min-h-0 flex-1 flex-col justify-center border-t border-[color:var(--line)] bg-[#0c1a2b]/45 px-5 py-5 sm:px-7 xl:px-6 xl:py-4"
            >
              <p className="text-xs font-bold tracking-wide text-[#d4a857]">
                Why QI
              </p>
              <h2 className="landing-display mt-1 text-xl font-bold tracking-tight text-[#f0d49a] xl:text-lg">
                Built for laboratories that must stay audit-ready
              </h2>
              <div className="mt-2.5 space-y-2">
                {whyQi.map((item) => (
                  <div key={item.title}>
                    <h3 className="text-sm font-semibold text-[#f0d49a]">
                      {item.title}
                    </h3>
                    <p className="mt-0.5 text-xs leading-4 text-[#93a9c2]">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center text-xs font-medium tracking-wide text-[#9aabbd]">
                ISO · NABL · Labs · Plants · Competence
              </p>
            </section>
          </div>
        </aside>

        <main className="relative order-1 flex min-h-0 flex-col overflow-visible xl:order-none xl:overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "url(https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=1800&q=80)",
            }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(165deg, rgba(6,16,28,0.97) 6%, rgba(16,36,58,0.93) 48%, rgba(6,16,28,0.97) 100%)",
            }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 70% 45% at 50% 12%, rgba(212,168,87,0.16), transparent 58%)",
            }}
            aria-hidden="true"
          />

          <div className="relative z-10 flex min-h-0 flex-col overflow-visible px-5 py-7 sm:px-8 lg:px-10 xl:h-full xl:overflow-y-auto xl:py-7">
            <section id="home" className="shrink-0 text-center">
              <p className="landing-display landing-rise text-2xl font-bold tracking-tight text-[#f0d49a] sm:text-3xl lg:text-[2.15rem]">
                {BRAND.shortName}
              </p>
              <h1 className="landing-display landing-rise-delay mx-auto mt-3 max-w-2xl text-base font-bold leading-snug tracking-tight text-[#f0d49a] sm:text-lg lg:text-xl">
                Train for standards. Prove competence. Stay audit-ready.
              </h1>
              <p className="landing-fade mx-auto mt-2 max-w-xl text-sm leading-6 text-[#a9bdd4]">
                From compliance programmes and online training to evaluations
                and certificates — one platform for organizations, trainers, and
                learners.
              </p>
            </section>

            <section
              id="delivery"
              className="relative mt-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#d4a857]/18 bg-[#0c1a2c]/85 px-4 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur-sm sm:px-5"
            >
              <div
                className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[#d4a857]/12 blur-3xl"
                aria-hidden="true"
              />
              <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="w-full shrink-0 space-y-2.5 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <p className="text-[12px] font-bold tracking-wide text-[#d4a857]">
                      Managed Training Lifecycle
                    </p>
                    <span className="rounded-full border border-[#d4a857]/30 bg-[#d4a857]/12 px-3 py-1 text-[10px] font-semibold tracking-wide text-[#f0d9a0]">
                      Plan · Deliver · Verify · Document
                    </span>
                  </div>
                  <h2 className="landing-display mx-auto w-full max-w-3xl text-xl font-bold leading-snug tracking-tight text-[#f0d49a] sm:text-2xl">
                    From annual training plan to audit-ready evidence
                  </h2>
                  <p className="mx-auto w-full max-w-3xl text-sm leading-6 text-[#a9bdd4]">
                    QICTPL manages the complete competence-development cycle for
                    your laboratory—planning requirements, coordinating expert
                    delivery, measuring effectiveness, and maintaining reliable
                    compliance records.
                  </p>
                </div>

                <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 content-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:grid-rows-2">
                  {[
                    {
                      title: "Assess needs",
                      body: "Identify competence gaps against standards, SOPs, methods, and accreditation expectations.",
                    },
                    {
                      title: "Plan the year",
                      body: "Build the annual training calendar around priorities, risk areas, and audit timelines.",
                    },
                    {
                      title: "Deliver training",
                      body: "Run technical, method-focused, and compliance sessions with laboratory-experienced trainers.",
                    },
                    {
                      title: "Verify competence",
                      body: "Evaluate learning outcomes and practical capability before audits or surveillance visits.",
                    },
                    {
                      title: "Close the gaps",
                      body: "Convert findings into targeted follow-up actions that strengthen readiness and consistency.",
                    },
                    {
                      title: "Keep evidence ready",
                      body: "Maintain attendance, assessments, effectiveness reviews, and certificates as audit-ready records.",
                    },
                  ].map((item, index) => (
                    <article
                      key={item.title}
                      className="group relative flex h-full min-h-0 overflow-hidden rounded-xl border border-[#d4a857]/16 bg-[#12233a]/92 px-3.5 py-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-[#d4a857]/40 hover:bg-[#162a44] xl:py-4"
                    >
                      <div className="flex h-full w-full items-start gap-2.5">
                        <span className="landing-display inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1f5f8b] text-xs font-bold text-white ring-1 ring-[#d4a857]/35">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
                          <h3 className="landing-display text-[15px] font-bold text-[#f0d49a] sm:text-base">
                            {item.title}
                          </h3>
                          <p className="mt-1.5 text-[13px] leading-5 text-[#93a9c2] sm:text-sm sm:leading-6">
                            {item.body}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section id="contact" className="mt-5 shrink-0 text-center">
              <p className="text-[12px] font-bold tracking-wide text-[#d4a857]">
                Find Us
              </p>
              <h2 className="landing-display mt-1 text-lg font-bold text-[#f0d49a]">
                Visit our office
              </h2>

              <div className="mx-auto mt-4 flex max-w-lg flex-wrap items-center justify-center gap-2.5">
                <a
                  href={brandMapsUrl()}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1f5f8b] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(31,95,139,0.32)] transition hover:bg-[#2874a8]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <circle
                      cx="12"
                      cy="10"
                      r="2.4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                  </svg>
                  Google Location
                </a>
                <button
                  type="button"
                  onClick={() => setInfoPopup("address")}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d4a857]/28 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-[#f0d49a] transition hover:border-[#d4a857]/50 hover:bg-[#d4a857]/12"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M4 7.5h16M4 12h16M4 16.5h10"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  Address
                </button>
                <button
                  type="button"
                  onClick={() => setInfoPopup("contact")}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d4a857]/28 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-[#f0d49a] transition hover:border-[#d4a857]/50 hover:bg-[#d4a857]/12"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M4 7h16v10H4V7Zm0 0 8 5.5L20 7"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Contact Details
                </button>
              </div>

              <p className="mt-4 text-[10px] leading-4 text-[#9aabbd]">
                © {new Date().getFullYear()} {BRAND.legalName}
              </p>
            </section>
          </div>
        </main>

        <aside
          id="services"
          className="relative order-2 flex min-h-0 flex-col overflow-visible border-t border-[color:var(--line)] xl:order-none xl:overflow-hidden xl:border-l xl:border-t-0"
        >
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "url(https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80)",
            }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(6,16,28,0.95) 0%, rgba(14,28,46,0.97) 100%)",
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 flex min-h-0 flex-col gap-5 overflow-visible px-5 py-7 sm:px-7 xl:h-full xl:gap-3 xl:overflow-hidden xl:px-6 xl:py-5">
            <div className="shrink-0 space-y-2 xl:space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-[#d4a857]/35 bg-[#d4a857]/12 px-2.5 py-1.5 text-[11px] font-bold text-[#f0d9a0] sm:px-3 sm:text-xs xl:min-h-[32px] xl:px-2.5 xl:text-[11px]">
                  Services
                </span>
                <button
                  type="button"
                  onClick={() => setUpcomingOpen(true)}
                  className="inline-flex min-h-[38px] shrink-0 items-center justify-center rounded-lg border border-[#d4a857]/35 bg-[#d4a857]/12 px-2.5 py-1.5 text-[11px] font-bold text-[#f0d9a0] transition hover:border-[#d4a857]/55 hover:bg-[#d4a857]/20 sm:px-3 sm:text-xs xl:min-h-[32px] xl:px-2.5 xl:text-[11px]"
                >
                  Upcoming Trainings
                </button>
              </div>
              <h2 className="landing-display text-lg font-bold tracking-tight text-[#f0d49a] lg:text-xl xl:text-base">
                What we deliver for your laboratory
              </h2>
            </div>

            <div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5 xl:gap-1">
              {services.map((item, index) => (
                <div
                  key={item.title}
                  className="group flex min-h-0 flex-1 items-start gap-2 rounded-lg border border-[#d4a857]/16 bg-[#12233a]/70 px-2.5 py-1.5 transition hover:border-[#d4a857]/40 hover:bg-[#162a44]/90 xl:px-2 xl:py-1"
                >
                  <span className="landing-display mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#1f5f8b] text-xs font-bold text-white ring-1 ring-[#d4a857]/35 xl:h-6 xl:w-6">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 self-center">
                    <h3 className="text-[13px] font-semibold leading-tight text-[#f0d49a] xl:text-xs">
                      {item.title}
                    </h3>
                    <p className="mt-0.5 text-xs leading-4 text-[#93a9c2] xl:mt-0 xl:text-xs xl:leading-[1.25]">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p className="shrink-0 text-center text-xs font-medium tracking-wide text-[#9aabbd] sm:text-sm xl:text-[11px]">
              Training · Audits · Competence
            </p>
          </div>
        </aside>
      </div>

      {infoPopup ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#050a14]/65 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setInfoPopup(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-info-popup-title"
            className="w-full max-w-lg rounded-2xl border border-[#d4a857]/20 bg-[#0f1c2e] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="landing-display text-base font-bold leading-snug text-[#f0d49a] sm:text-lg">
                  {BRAND.legalName}
                </p>
                <h2
                  id="landing-info-popup-title"
                  className="mt-1.5 text-sm font-semibold tracking-wide text-[#d4a857]"
                >
                  {infoPopup === "address"
                    ? "Office Address"
                    : "Contact Details"}
                </h2>
              </div>
              <button
                type="button"
                title="Close"
                aria-label="Close"
                onClick={() => setInfoPopup(null)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-lg leading-none text-[#c2d4e8] transition hover:bg-white/10"
              >
                ×
              </button>
            </div>

            {infoPopup === "address" ? (
              <div className="mt-5 space-y-1 text-left text-base leading-7 text-[#c2d4e8]">
                {BRAND.addressLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BRAND.addressDisplay)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex text-sm font-semibold text-[#9ec5e8] hover:text-[#f0d49a]"
                >
                  Open in Google Maps →
                </a>
              </div>
            ) : (
              <div className="mt-4 space-y-4 text-left text-sm text-[#c2d4e8]">
                <div className="grid gap-3 sm:grid-cols-2">
                  {contactPeople.map((contact) => (
                    <a
                      key={contact.phone}
                      href={`tel:${brandPhoneTel(contact.phone)}`}
                      className="rounded-xl border border-[#d4a857]/20 bg-[#12233a]/75 px-4 py-3 transition hover:border-[#d4a857]/45 hover:bg-[#162a44]"
                    >
                      <span className="block text-[11px] font-semibold tracking-wide text-[#d4a857]">
                        Contact Person
                      </span>
                      <span className="mt-1 block text-sm font-bold text-[#f0d49a]">
                        {contact.name}
                      </span>
                      <span className="mt-1 block font-semibold text-[#cfe0f2]">
                        {contact.phone}
                      </span>
                    </a>
                  ))}
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] font-semibold tracking-wide text-[#d4a857]">
                    Common Details
                  </p>
                  <div className="mt-2 space-y-1.5">
                    <a
                      href={`mailto:${BRAND.email}`}
                      className="block font-semibold text-[#cfe0f2] hover:text-[#f0d49a]"
                    >
                      {BRAND.email}
                    </a>
                    <a
                      href={BRAND.website}
                      target="_blank"
                      rel="noreferrer"
                      className="block font-semibold text-[#cfe0f2] hover:text-[#f0d49a]"
                    >
                      {BRAND.websiteLabel}
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
      {upcomingOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#050a14]/70 p-3 backdrop-blur-[2px] sm:p-4"
          role="presentation"
          onClick={() => setUpcomingOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upcoming-trainings-title"
            className="flex max-h-[min(92vh,52rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#d4a857]/20 bg-[#0f1c2e] shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2
                    id="upcoming-trainings-title"
                    className="landing-display text-lg font-bold text-[#f0d49a] sm:text-xl"
                  >
                    Upcoming Trainings
                  </h2>
                </div>
                <button
                  type="button"
                  title="Close"
                  aria-label="Close"
                  onClick={() => setUpcomingOpen(false)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-lg leading-none text-[#c2d4e8] transition hover:bg-white/10"
                >
                  ×
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "ongoing", label: "Ongoing" },
                    { id: "scheduled", label: "Scheduled" },
                    { id: "hold", label: "Hold" },
                    { id: "completed", label: "Completed" },
                  ] as const
                ).map((filter) => {
                  const active = upcomingFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setUpcomingFilter(filter.id)}
                      className={
                        active
                          ? "rounded-lg border border-[#d4a857]/55 bg-[#d4a857]/20 px-3 py-1.5 text-xs font-bold text-[#f0d9a0]"
                          : "rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-[#a9bdd4] transition hover:border-[#d4a857]/35 hover:text-[#f0d9a0]"
                      }
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4 sm:px-6 sm:py-5">
              {upcomingLoading ? (
                <p className="py-10 text-center text-sm text-[#93a9c2]">
                  Loading assigned trainings…
                </p>
              ) : upcomingError ? (
                <p className="py-10 text-center text-sm text-red-300">
                  {upcomingError}
                </p>
              ) : filteredUpcomingRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#93a9c2]">
                  No trainings found for this filter.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
                    <thead className="bg-[#162a44] text-[11px] font-semibold tracking-wide text-[#d4a857]">
                      <tr>
                        <th className="border-b border-white/10 px-3 py-3">
                          Programme / Title
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-center">
                          Date
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-center">
                          Mode
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-center">
                          Status
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-center">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUpcomingRows.map((row) => {
                        const ongoing = isOngoingTraining(row.status);
                        const scheduled = isScheduledTraining(row.status);
                        return (
                          <tr
                            key={row.training_code}
                            className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.03]"
                          >
                            <td className="px-3 py-3 font-medium text-[#f0d49a]">
                              {row.programme_title || row.title}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center text-[#a9bdd4]">
                              {row.training_date
                                ? new Date(
                                    `${row.training_date}T00:00:00`,
                                  ).toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center capitalize text-[#a9bdd4]">
                              {row.mode || "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center">
                              <span className="inline-flex rounded-full border border-[#d4a857]/25 bg-[#d4a857]/12 px-2 py-0.5 text-[11px] font-semibold text-[#f0d9a0]">
                                {row.status}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center">
                              {ongoing || scheduled ? (
                                <button
                                  type="button"
                                  onClick={() => setActionTraining(row)}
                                  className="rounded-lg bg-[#1f5f8b] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#2874a8]"
                                >
                                  {scheduled ? "Join Training" : "Join / Login"}
                                </button>
                              ) : (
                                <span className="text-xs text-[#6f8298]">
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {actionTraining ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[#050a14]/75 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setActionTraining(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="training-login-choice-title"
            className="w-full max-w-md rounded-2xl border border-[#d4a857]/25 bg-[#0f1c2e] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
            onClick={(event) => event.stopPropagation()}
          >
            {(() => {
              const scheduled = isScheduledTraining(actionTraining.status);
              const orgPath = scheduled
                ? "/login/organization?mode=signup"
                : "/login/organization";
              const individualPath = scheduled
                ? "/login/individual?mode=signup"
                : "/login/individual";
              return (
                <>
                  <h2
                    id="training-login-choice-title"
                    className="landing-display text-lg font-bold text-[#f0d49a]"
                  >
                    {scheduled ? "Join Training as" : "Continue as"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#a9bdd4]">
                    {scheduled
                      ? "Open Organization or Individual Signup for "
                      : "Do you want to open Login / Signup as an Organization or as an Individual for "}
                    <span className="font-semibold text-[#f0d9a0]">
                      {actionTraining.programme_title || actionTraining.title}
                    </span>
                    ?
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Link
                      to={orgPath}
                      onClick={() => {
                        setActionTraining(null);
                        setUpcomingOpen(false);
                      }}
                      className="inline-flex items-center justify-center rounded-xl bg-[#1f5f8b] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#2874a8]"
                    >
                      Organization
                      {scheduled ? " Signup" : ""}
                    </Link>
                    <Link
                      to={individualPath}
                      onClick={() => {
                        setActionTraining(null);
                        setUpcomingOpen(false);
                      }}
                      className="inline-flex items-center justify-center rounded-xl border border-[#d4a857]/35 bg-[#d4a857]/12 px-4 py-3 text-sm font-bold text-[#f0d9a0] transition hover:border-[#d4a857]/55 hover:bg-[#d4a857]/20"
                    >
                      Individual
                      {scheduled ? " Signup" : ""}
                    </Link>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActionTraining(null)}
                    className="mt-4 w-full rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-[#a9bdd4] transition hover:bg-white/[0.04]"
                  >
                    Cancel
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
