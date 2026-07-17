import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type TrainerProfile = {
  id: string;
  full_name: string | null;
  designation: string | null;
  email: string | null;
  mobile: string | null;
  photo_url: string | null;
  qualification: string | null;
  education: string | null;
  experience: string | null;
  skills: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

function initials(name: string | null | undefined) {
  return (name || "Trainer")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function TrainerProfileModal({
  trainerId,
  onClose,
}: {
  trainerId: string | null;
  onClose: () => void;
}) {
  const [trainer, setTrainer] = useState<TrainerProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!trainerId) {
      setTrainer(null);
      return;
    }
    let active = true;
    setLoading(true);
    void supabase
      .rpc("get_trainer_profile", { p_trainer_id: trainerId })
      .then(({ data }) => {
        if (!active) return;
        const row = Array.isArray(data)
          ? (data[0] as TrainerProfile | undefined)
          : (data as TrainerProfile | null);
        setTrainer(row ?? null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [trainerId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!trainerId) return null;

  const skillList = (trainer?.skills ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const locationParts = [trainer?.city, trainer?.state, trainer?.country]
    .map((x) => x?.trim())
    .filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trainer-profile-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="relative bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-5">
          <button
            type="button"
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg text-2xl leading-none text-white/80 transition hover:bg-white/15 hover:text-white"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            ×
          </button>
          <div className="flex items-center gap-4 pr-10">
            {trainer?.photo_url ? (
              <img
                src={trainer.photo_url}
                alt={trainer.full_name ?? "Trainer"}
                className="h-16 w-16 shrink-0 rounded-full border-2 border-white/40 bg-white object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white ring-2 ring-white/40">
                {initials(trainer?.full_name)}
              </div>
            )}
            <div className="min-w-0">
              <h2
                id="trainer-profile-title"
                className="truncate text-lg font-bold text-white"
              >
                {trainer?.full_name || "Trainer"}
              </h2>
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-100">
                {trainer?.designation || "Trainer"}
              </p>
            </div>
          </div>
        </div>

        <div className="max-h-[calc(90vh-116px)] overflow-y-auto p-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Loading trainer profile…
            </p>
          ) : !trainer ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Trainer profile not available.
            </p>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Contact
                  </h3>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["Email", trainer.email],
                      ["Phone", trainer.mobile],
                      [
                        "Location",
                        locationParts.length ? locationParts.join(", ") : null,
                      ],
                    ] as Array<[string, string | null | undefined]>
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {label}
                      </p>
                      <p className="mt-0.5 break-words text-sm font-medium text-slate-900">
                        {value?.toString().trim() || "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Qualifications
                  </h3>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {(
                    [
                      ["Qualification", trainer.qualification],
                      ["Education", trainer.education],
                      ["Experience", trainer.experience],
                    ] as Array<[string, string | null | undefined]>
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {label}
                      </p>
                      <p className="mt-0.5 whitespace-pre-line break-words text-sm font-medium text-slate-900">
                        {value?.toString().trim() || "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Skills
                  </h3>
                </div>
                {skillList.length === 0 ? (
                  <p className="text-sm text-slate-500">—</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {skillList.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
