import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ProgrammeTrainingAsset } from "@/lib/supabase/types";

export type PresentationSlide = {
  title: string;
  bullets: string[];
  notes?: string;
};

function slidesFromContentJson(contentJson: unknown): {
  topic: string;
  slides: PresentationSlide[];
} {
  if (!contentJson || typeof contentJson !== "object") {
    return { topic: "", slides: [] };
  }
  const root = contentJson as { topic?: unknown; slides?: unknown };
  const slides = Array.isArray(root.slides)
    ? root.slides
        .map((s) => {
          const row = s as Record<string, unknown>;
          return {
            title: String(row.title ?? "").trim(),
            bullets: Array.isArray(row.bullets)
              ? row.bullets.map((b) => String(b).trim()).filter(Boolean)
              : [],
            notes: row.notes != null ? String(row.notes).trim() : "",
          };
        })
        .filter((s) => s.title)
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
      .map((s) => {
        const row = s as Record<string, unknown>;
        return {
          title: String(row.title ?? "").trim(),
          bullets: Array.isArray(row.bullets)
            ? row.bullets.map((b) => String(b).trim()).filter(Boolean)
            : [],
          notes: row.notes != null ? String(row.notes).trim() : "",
        };
      })
      .filter((s) => s.title);
    return { topic, slides };
  } catch {
    return { topic, slides: [] };
  }
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
      const next = slides.map((s, i) => (i === index ? data.slide! : s));
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
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
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
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
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

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 text-slate-50 shadow-inner">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300">
          {topic || "Training Presentation"}
        </p>
        <h3 className="text-xl font-semibold leading-snug sm:text-2xl">
          {current?.title}
        </h3>
        {current?.bullets?.length ? (
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-200 sm:text-base">
            {current.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
        {current?.notes ? (
          <p className="mt-4 text-xs text-slate-400">{current.notes}</p>
        ) : null}
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
                  ? "e.g. Make it more practical with a workplace example"
                  : "e.g. Shorten bullets, add clause references"
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
