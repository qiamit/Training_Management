import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ProgrammeTrainingAsset } from "@/lib/supabase/types";

export type SlideChartPoint = { label: string; value: number };
export type SlideCard = { title: string; text: string; icon?: string };
export type SlideStep = { title: string; text: string };
export type SlideCallout = {
  label?: string;
  text: string;
  tone?: "info" | "warning" | "success" | "tip";
};
export type SlideChart = {
  type?: "bar" | "pie" | "donut";
  title?: string;
  unit?: string;
  data: SlideChartPoint[];
};
export type SlideVisual = {
  kind?: "icon" | "illustration";
  icon?: string;
  caption?: string;
};

export type PresentationSlide = {
  title: string;
  subtitle?: string;
  bullets: string[];
  notes?: string;
  layout?:
    | "title"
    | "bullets"
    | "split"
    | "cards"
    | "chart"
    | "steps"
    | "callout"
    | "quote";
  callout?: SlideCallout;
  cards?: SlideCard[];
  steps?: SlideStep[];
  chart?: SlideChart;
  visual?: SlideVisual;
  quote?: { text: string; attribution?: string };
};

const CHART_COLORS = [
  "#38bdf8",
  "#818cf8",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#a78bfa",
  "#2dd4bf",
  "#f472b6",
];

function normalizeSlide(raw: unknown): PresentationSlide | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const title = String(row.title ?? "").trim();
  if (!title) return null;

  const bullets = Array.isArray(row.bullets)
    ? row.bullets.map((b) => String(b).trim()).filter(Boolean)
    : [];

  const cards = Array.isArray(row.cards)
    ? row.cards
        .map((c) => {
          const card = c as Record<string, unknown>;
          return {
            title: String(card.title ?? "").trim(),
            text: String(card.text ?? "").trim(),
            icon: card.icon != null ? String(card.icon).trim() : undefined,
          };
        })
        .filter((c) => c.title || c.text)
    : undefined;

  const steps = Array.isArray(row.steps)
    ? row.steps
        .map((s) => {
          const step = s as Record<string, unknown>;
          return {
            title: String(step.title ?? "").trim(),
            text: String(step.text ?? "").trim(),
          };
        })
        .filter((s) => s.title || s.text)
    : undefined;

  let chart: SlideChart | undefined;
  if (row.chart && typeof row.chart === "object") {
    const ch = row.chart as Record<string, unknown>;
    const data = Array.isArray(ch.data)
      ? ch.data
          .map((d) => {
            const point = d as Record<string, unknown>;
            return {
              label: String(point.label ?? "").trim(),
              value: Number(point.value ?? 0),
            };
          })
          .filter((d) => d.label && Number.isFinite(d.value))
      : [];
    if (data.length) {
      chart = {
        type:
          ch.type === "pie" || ch.type === "donut" || ch.type === "bar"
            ? ch.type
            : "bar",
        title: ch.title != null ? String(ch.title).trim() : undefined,
        unit: ch.unit != null ? String(ch.unit).trim() : undefined,
        data,
      };
    }
  }

  let callout: SlideCallout | undefined;
  if (row.callout && typeof row.callout === "object") {
    const c = row.callout as Record<string, unknown>;
    const text = String(c.text ?? "").trim();
    if (text) {
      callout = {
        text,
        label: c.label != null ? String(c.label).trim() : undefined,
        tone:
          c.tone === "warning" ||
          c.tone === "success" ||
          c.tone === "tip" ||
          c.tone === "info"
            ? c.tone
            : "info",
      };
    }
  }

  let visual: SlideVisual | undefined;
  if (row.visual && typeof row.visual === "object") {
    const v = row.visual as Record<string, unknown>;
    visual = {
      kind: v.kind === "illustration" ? "illustration" : "icon",
      icon: v.icon != null ? String(v.icon).trim() : "lightbulb",
      caption: v.caption != null ? String(v.caption).trim() : undefined,
    };
  }

  let quote: PresentationSlide["quote"];
  if (row.quote && typeof row.quote === "object") {
    const q = row.quote as Record<string, unknown>;
    const text = String(q.text ?? "").trim();
    if (text) {
      quote = {
        text,
        attribution:
          q.attribution != null ? String(q.attribution).trim() : undefined,
      };
    }
  }

  const layoutRaw = String(row.layout ?? "").trim().toLowerCase();
  const layout: PresentationSlide["layout"] =
    layoutRaw === "title" ||
    layoutRaw === "bullets" ||
    layoutRaw === "split" ||
    layoutRaw === "cards" ||
    layoutRaw === "chart" ||
    layoutRaw === "steps" ||
    layoutRaw === "callout" ||
    layoutRaw === "quote"
      ? layoutRaw
      : chart
        ? "chart"
        : cards?.length
          ? "cards"
          : steps?.length
            ? "steps"
            : callout
              ? "callout"
              : quote
                ? "quote"
                : visual && bullets.length
                  ? "split"
                  : bullets.length
                    ? "bullets"
                    : "title";

  return {
    title,
    subtitle: row.subtitle != null ? String(row.subtitle).trim() : "",
    bullets,
    notes: row.notes != null ? String(row.notes).trim() : "",
    layout,
    callout,
    cards,
    steps,
    chart,
    visual,
    quote,
  };
}

function slidesFromContentJson(contentJson: unknown): {
  topic: string;
  slides: PresentationSlide[];
} {
  if (!contentJson || typeof contentJson !== "object") {
    return { topic: "", slides: [] };
  }
  const root = contentJson as { topic?: unknown; slides?: unknown };
  const slides = Array.isArray(root.slides)
    ? root.slides.map(normalizeSlide).filter((s): s is PresentationSlide => !!s)
    : [];
  return {
    topic: String(root.topic ?? "").trim(),
    slides,
  };
}

function slidesFromHtml(html: string): {
  topic: string;
  slides: PresentationSlide[];
} {
  const titleMatch = html.match(/<title>([\s\S]*?)—/);
  const topic = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
    : "";
  const match = html.match(/const slides = (\[[\s\S]*?\]);\s*let index/);
  if (!match) return { topic, slides: [] };
  try {
    const parsed = JSON.parse(match[1]) as unknown[];
    const slides = parsed
      .map(normalizeSlide)
      .filter((s): s is PresentationSlide => !!s);
    return { topic, slides };
  } catch {
    return { topic, slides: [] };
  }
}

function iconGlyph(name?: string) {
  const key = (name || "lightbulb").toLowerCase();
  const map: Record<string, string> = {
    audit: "🔎",
    checklist: "✅",
    people: "👥",
    process: "⚙️",
    shield: "🛡️",
    chart: "📊",
    lightbulb: "💡",
    document: "📄",
    target: "🎯",
    warning: "⚠️",
    training: "🎓",
    quality: "⭐",
    lab: "🧪",
    clock: "⏱️",
  };
  return map[key] || "📌";
}

function toneClasses(tone?: SlideCallout["tone"]) {
  switch (tone) {
    case "warning":
      return "border-amber-400/40 bg-amber-400/10 text-amber-50";
    case "success":
      return "border-emerald-400/40 bg-emerald-400/10 text-emerald-50";
    case "tip":
      return "border-violet-400/40 bg-violet-400/10 text-violet-50";
    default:
      return "border-sky-400/40 bg-sky-400/10 text-sky-50";
  }
}

function BarChart({ chart }: { chart: SlideChart }) {
  const max = Math.max(...chart.data.map((d) => d.value), 1);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      {chart.title ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-cyan-200/90">
          {chart.title}
          {chart.unit ? ` (${chart.unit})` : ""}
        </p>
      ) : null}
      <div className="flex h-40 items-end gap-2 sm:h-44 sm:gap-3">
        {chart.data.map((d, i) => {
          const h = Math.max(8, Math.round((d.value / max) * 100));
          return (
            <div
              key={`${d.label}-${i}`}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <span className="text-[10px] font-semibold text-slate-200">
                {d.value}
              </span>
              <div
                className="w-full rounded-t-lg"
                style={{
                  height: `${h}%`,
                  background: `linear-gradient(180deg, ${CHART_COLORS[i % CHART_COLORS.length]}, ${CHART_COLORS[i % CHART_COLORS.length]}99)`,
                  boxShadow: `0 0 18px ${CHART_COLORS[i % CHART_COLORS.length]}55`,
                }}
              />
              <span className="w-full truncate text-center text-[10px] text-slate-300">
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PieChart({ chart }: { chart: SlideChart }) {
  const total = chart.data.reduce((sum, d) => sum + Math.max(0, d.value), 0) || 1;
  let angle = -90;
  const slices = chart.data.map((d, i) => {
    const sweep = (Math.max(0, d.value) / total) * 360;
    const start = angle;
    angle += sweep;
    const large = sweep > 180 ? 1 : 0;
    const r = 42;
    const startRad = (start * Math.PI) / 180;
    const endRad = ((start + sweep) * Math.PI) / 180;
    const x1 = 50 + r * Math.cos(startRad);
    const y1 = 50 + r * Math.sin(startRad);
    const x2 = 50 + r * Math.cos(endRad);
    const y2 = 50 + r * Math.sin(endRad);
    const path = `M50 50 L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return {
      path,
      color: CHART_COLORS[i % CHART_COLORS.length],
      label: d.label,
      value: d.value,
    };
  });
  const isDonut = chart.type === "donut";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      {chart.title ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-cyan-200/90">
          {chart.title}
        </p>
      ) : null}
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <svg viewBox="0 0 100 100" className="h-36 w-36 shrink-0 sm:h-40 sm:w-40">
          {slices.map((s) => (
            <path key={s.label} d={s.path} fill={s.color} opacity={0.92} />
          ))}
          {isDonut ? (
            <circle cx="50" cy="50" r="22" fill="#0b1224" />
          ) : null}
        </svg>
        <ul className="grid w-full gap-2 text-xs text-slate-200">
          {slices.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: s.color }}
              />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="font-semibold text-white">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SlideBody({ slide }: { slide: PresentationSlide }) {
  const layout = slide.layout || "bullets";
  const showBullets =
    slide.bullets.length > 0 &&
    layout !== "cards" &&
    layout !== "steps" &&
    layout !== "quote";

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-10 h-44 w-44 rounded-full bg-indigo-500/15 blur-3xl" />

      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/90">
        Training Presentation
      </p>
      <h3 className="text-xl font-semibold leading-snug text-white sm:text-2xl lg:text-[1.7rem]">
        {slide.title}
      </h3>
      {slide.subtitle ? (
        <p className="mt-1.5 text-sm text-slate-300 sm:text-[15px]">
          {slide.subtitle}
        </p>
      ) : null}

      <div
        className={`mt-4 grid min-h-0 flex-1 gap-4 ${
          layout === "split" || (layout === "chart" && showBullets)
            ? "lg:grid-cols-2"
            : ""
        }`}
      >
        <div className="min-w-0 space-y-3">
          {showBullets ? (
            <ul className="space-y-2.5">
              {slide.bullets.map((b) => (
                <li
                  key={b}
                  className="flex gap-2.5 rounded-xl border border-white/5 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 sm:text-[15px]"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                  <span className="leading-snug">{b}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {slide.callout ? (
            <div
              className={`rounded-2xl border px-3.5 py-3 text-sm leading-relaxed ${toneClasses(
                slide.callout.tone,
              )}`}
            >
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-80">
                {slide.callout.label ||
                  (slide.callout.tone === "tip"
                    ? "Tip"
                    : slide.callout.tone === "warning"
                      ? "Important"
                      : slide.callout.tone === "success"
                        ? "Key point"
                        : "Info")}
              </p>
              <p>{slide.callout.text}</p>
            </div>
          ) : null}

          {slide.quote ? (
            <blockquote className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
              <p className="text-base italic leading-relaxed text-slate-100 sm:text-lg">
                “{slide.quote.text}”
              </p>
              {slide.quote.attribution ? (
                <footer className="mt-2 text-xs font-semibold text-cyan-200/90">
                  — {slide.quote.attribution}
                </footer>
              ) : null}
            </blockquote>
          ) : null}

          {slide.cards?.length ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {slide.cards.map((card) => (
                <div
                  key={`${card.title}-${card.text}`}
                  className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.03] p-3.5"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-400/15 text-base">
                      {iconGlyph(card.icon)}
                    </span>
                    <p className="text-sm font-semibold text-white">
                      {card.title}
                    </p>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-300 sm:text-[13px]">
                    {card.text}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {slide.steps?.length ? (
            <ol className="space-y-2.5">
              {slide.steps.map((step, i) => (
                <li
                  key={`${step.title}-${i}`}
                  className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/30 text-xs font-bold text-indigo-100">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {step.title}
                    </p>
                    {step.text ? (
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-300 sm:text-[13px]">
                        {step.text}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </div>

        <div className="min-w-0 space-y-3">
          {slide.chart ? (
            slide.chart.type === "pie" || slide.chart.type === "donut" ? (
              <PieChart chart={slide.chart} />
            ) : (
              <BarChart chart={slide.chart} />
            )
          ) : null}

          {slide.visual ? (
            <div className="flex h-full min-h-[140px] flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-300/30 bg-gradient-to-br from-cyan-400/10 via-indigo-500/10 to-transparent p-5 text-center">
              <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 text-4xl shadow-lg shadow-cyan-500/10 ring-1 ring-white/15">
                {iconGlyph(slide.visual.icon)}
              </div>
              <p className="text-sm font-semibold text-white">
                {slide.visual.caption || "Visual focus"}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Illustration panel for trainer discussion
              </p>
            </div>
          ) : null}

          {!slide.chart && !slide.visual && layout === "title" ? (
            <div className="hidden h-full min-h-[120px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] lg:flex">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-2xl">
                  🎓
                </div>
                <p className="text-xs text-slate-400">Session opener</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {slide.notes ? (
        <p className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-300">Trainer note: </span>
          {slide.notes}
        </p>
      ) : null}
    </div>
  );
}

export function PresentationAiPreview({
  asset,
  onAssetUpdated,
}: {
  asset: ProgrammeTrainingAsset;
  onAssetUpdated: (asset: ProgrammeTrainingAsset) => void;
}) {
  const [slides, setSlides] = useState<PresentationSlide[]>([]);
  const [topic, setTopic] = useState("");
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiAction, setAiAction] = useState<"improve" | "recreate">("improve");
  const [aiNotes, setAiNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessage(null);
    setIndex(0);
    setAiOpen(false);
    void (async () => {
      const fromJson = slidesFromContentJson(asset.content_json);
      if (fromJson.slides.length) {
        if (!cancelled) {
          setSlides(fromJson.slides);
          setTopic(fromJson.topic || asset.file_name);
          setLoading(false);
        }
        return;
      }
      try {
        const res = await fetch(asset.file_url);
        if (!res.ok) throw new Error(`Failed to load deck (${res.status})`);
        const html = await res.text();
        const parsed = slidesFromHtml(html);
        if (!cancelled) {
          setSlides(parsed.slides);
          setTopic(parsed.topic || asset.file_name);
          if (!parsed.slides.length) {
            setError(
              "Slides could not be read for AI editing. Regenerate this presentation with AI.",
            );
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load slides");
          setSlides([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.file_url, asset.content_json, asset.file_name]);

  const current = slides[index];
  const progress = useMemo(
    () => (slides.length ? ((index + 1) / slides.length) * 100 : 0),
    [index, slides.length],
  );

  async function runAi() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        ok?: boolean;
        error?: string;
        asset?: ProgrammeTrainingAsset;
        slide?: PresentationSlide;
      }>("generate-presentation", {
        body: {
          action: aiAction,
          assetId: asset.id,
          slideIndex: index,
          extraInstructions: aiNotes.trim() || undefined,
        },
      });
      if (fnError) {
        let detail = fnError.message;
        try {
          const ctx = (fnError as { context?: Response }).context;
          if (ctx) {
            const body = (await ctx.json()) as { error?: string };
            if (body?.error) detail = body.error;
          }
        } catch {
          // keep generic
        }
        setError(detail);
        return;
      }
      if (data?.error || !data?.asset || !data?.slide) {
        setError(data?.error || "AI slide update failed.");
        return;
      }
      const normalized = normalizeSlide(data.slide) || data.slide;
      const next = slides.map((s, i) => (i === index ? normalized : s));
      setSlides(next);
      onAssetUpdated(data.asset);
      setMessage(
        aiAction === "recreate"
          ? `Slide ${index + 1} recreated.`
          : `Slide ${index + 1} improved.`,
      );
      setAiOpen(false);
      setAiNotes("");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-slate-500">
        Loading slides…
      </div>
    );
  }

  if (!slides.length) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-sm text-slate-600">
          {error || "No editable slides found."}
        </p>
        <a
          href={asset.file_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-indigo-600 hover:underline"
        >
          Open HTML deck
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[280px] flex-col gap-2">
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={index <= 0 || busy}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-xs font-semibold text-slate-600">
            Slide {index + 1} / {slides.length}
          </span>
          <button
            type="button"
            disabled={index >= slides.length - 1 || busy}
            onClick={() =>
              setIndex((i) => Math.min(slides.length - 1, i + 1))
            }
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setAiAction("improve");
              setAiOpen(true);
            }}
            className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            AI Improve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setAiAction("recreate");
              setAiOpen(true);
            }}
            className="rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
          >
            AI Recreate
          </button>
        </div>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-[#07111f] shadow-inner">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.22),transparent_40%),linear-gradient(145deg,#07111f,#0f1b33_55%,#0b1324)]" />
        <div className="relative flex h-full min-h-[320px] flex-col p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="truncate text-[11px] font-semibold text-slate-300">
              {topic || "Training Presentation"}
            </p>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200/90">
              {current?.layout || "bullets"}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto pr-1">
            {current ? <SlideBody slide={current} /> : null}
          </div>
        </div>
      </div>

      {aiOpen ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-indigo-900">
              {aiAction === "recreate"
                ? `AI Recreate — Slide ${index + 1}`
                : `AI Improve — Slide ${index + 1}`}
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-slate-500 hover:underline"
              disabled={busy}
              onClick={() => setAiOpen(false)}
            >
              Cancel
            </button>
          </div>
          <label className="block text-[11px] font-semibold text-slate-600">
            Extra instructions (optional)
            <textarea
              rows={2}
              value={aiNotes}
              disabled={busy}
              onChange={(e) => setAiNotes(e.target.value)}
              placeholder={
                aiAction === "recreate"
                  ? "e.g. Add a chart and info callout with a workplace example"
                  : "e.g. Turn into cards layout, add a bar chart of audit findings"
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal text-slate-900"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAi()}
            className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy
              ? aiAction === "recreate"
                ? "Recreating…"
                : "Improving…"
              : aiAction === "recreate"
                ? "Recreate this slide"
                : "Improve this slide"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
