import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  PageHeader,
  Panel,
} from "@/components/dashboard-shell";
import { useAuth } from "@/features/auth/AuthProvider";
import { useWorkspaceReadOnly } from "@/features/workspace/WorkspacePreview";
import { isOrgLearnerRole } from "@/lib/auth/roles";
import { BRAND } from "@/lib/brand";
import { supabase } from "@/lib/supabase/client";
import type {
  Certificate,
  CompanySettings,
  Organization,
  Profile,
  ProgrammeTrainingAsset,
  TraineeEvaluation,
  TraineeEvaluationQuestion,
  TraineeQuestionEvaluation,
  TrainingProgramme,
  TrainingRequest,
} from "@/lib/supabase/types";

type CertificateLetterhead = {
  companyName: string;
  tagline: string;
  header: string;
  footer: string;
  logoUrl: string | null;
  showGst: boolean;
  gstNumber: string | null;
  addressLine1: string;
  addressLine2: string;
  email: string;
  mobile: string;
  primaryColor: string;
  accentColor: string;
};

type EvalRow = TraineeEvaluation & {
  programme_title: string;
  training_code: string;
  training_date: string | null;
  trainee_name: string;
  trainee_email: string | null;
  trainee_mobile: string | null;
};

function resolveTrainingCode(req?: TrainingRequest | null): string {
  if (req?.training_code?.trim()) return req.training_code.trim();
  if (req?.id) {
    return `TRN-${req.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  }
  return "—";
}

function flattenQuestionsFromAsset(contentJson: unknown): TraineeEvaluationQuestion[] {
  if (!contentJson || typeof contentJson !== "object") return [];
  const root = contentJson as {
    sections?: Array<{
      questions?: Array<{
        number?: number;
        text?: string;
        marks?: number;
        type?: string;
        options?: string[];
        correctOptionIndex?: number;
      }>;
    }>;
    questions?: TraineeEvaluationQuestion[];
  };
  if (Array.isArray(root.questions) && root.questions.length) {
    return root.questions.map((q, i) => ({
      id: q.id || `q-${i + 1}`,
      text: q.text,
      marks: q.marks ?? 1,
      type: q.type === "mcq" || (q.options?.length ?? 0) > 0 ? "mcq" : "text",
      options: q.options,
      correctOptionIndex: q.correctOptionIndex,
    }));
  }
  const out: TraineeEvaluationQuestion[] = [];
  let n = 1;
  for (const section of root.sections ?? []) {
    for (const q of section.questions ?? []) {
      if (!q.text?.trim()) continue;
      const options = Array.isArray(q.options) ? q.options.map(String) : [];
      out.push({
        id: `q-${n}`,
        text: q.text.trim(),
        marks: Number(q.marks ?? 1) || 1,
        type: options.length >= 2 ? "mcq" : "text",
        options: options.length >= 2 ? options : undefined,
        correctOptionIndex:
          typeof q.correctOptionIndex === "number"
            ? q.correctOptionIndex
            : undefined,
      });
      n += 1;
    }
  }
  return out;
}

function fallbackQuestions(programmeTitle: string): TraineeEvaluationQuestion[] {
  const topic = programmeTitle || "this training";
  return [
    {
      id: "q-1",
      text: `What is the primary objective of ${topic}?`,
      marks: 2,
      type: "mcq",
      options: [
        "Compliance and competence improvement",
        "Marketing only",
        "Hardware purchase",
        "None of the above",
      ],
      correctOptionIndex: 0,
    },
    {
      id: "q-2",
      text: `Which practice best supports effective application of ${topic}?`,
      marks: 2,
      type: "mcq",
      options: [
        "Documenting procedures and following them",
        "Ignoring records",
        "Skipping review",
        "Avoiding training refreshers",
      ],
      correctOptionIndex: 0,
    },
    {
      id: "q-3",
      text: `Who is responsible for applying learnings from ${topic} at work?`,
      marks: 2,
      type: "mcq",
      options: [
        "The trainee and their team",
        "Only external auditors",
        "Only IT department",
        "Nobody",
      ],
      correctOptionIndex: 0,
    },
    {
      id: "q-4",
      text: `In one sentence, describe one key takeaway from ${topic}.`,
      marks: 4,
      type: "text",
    },
  ];
}

function statusLabel(status: TraineeEvaluation["status"]) {
  switch (status) {
    case "pending_send":
      return "Pending send";
    case "link_sent":
      return "Link sent";
    case "in_progress":
      return "In progress";
    case "submitted":
      return "Answer received";
    case "evaluated":
      return "Evaluated";
    default:
      return status;
  }
}

function groupEvalStatus(trainees: EvalRow[]): {
  label: string;
  tone: "slate" | "amber" | "sky" | "emerald";
} {
  if (!trainees.length) return { label: "Pending", tone: "slate" };
  const allEvaluated = trainees.every((t) => t.status === "evaluated");
  if (allEvaluated) return { label: "Completed", tone: "emerald" };
  const anySubmitted = trainees.some(
    (t) => t.status === "submitted" || t.status === "evaluated",
  );
  if (anySubmitted) return { label: "Pending evaluation", tone: "amber" };
  const anySent = trainees.some((t) => t.status !== "pending_send");
  if (anySent) return { label: "In progress", tone: "sky" };
  return { label: "Pending", tone: "slate" };
}

function effectivenessLabel(
  rating: TraineeEvaluation["effectiveness_rating"],
) {
  switch (rating) {
    case "effective":
      return "Effective";
    case "partial":
      return "Partial";
    case "not_effective":
      return "Not effective";
    default:
      return "Pending";
  }
}

function EffectivenessRow({
  row,
  busy,
  suggestion,
  onSave,
}: {
  row: EvalRow;
  busy: boolean;
  suggestion?: {
    rating: "effective" | "partial" | "not_effective";
    notes: string;
  } | null;
  onSave: (
    rating: "effective" | "partial" | "not_effective",
    notes: string,
  ) => void;
}) {
  const [rating, setRating] = useState<
    "effective" | "partial" | "not_effective" | ""
  >(row.effectiveness_rating ?? "");
  const [notes, setNotes] = useState(row.effectiveness_notes ?? "");

  useEffect(() => {
    setRating(row.effectiveness_rating ?? "");
    setNotes(row.effectiveness_notes ?? "");
  }, [row.id, row.effectiveness_rating, row.effectiveness_notes]);

  useEffect(() => {
    if (!suggestion) return;
    setRating(suggestion.rating);
    setNotes(suggestion.notes);
  }, [suggestion]);

  return (
    <tr className="hover:bg-slate-50/80">
      <td className="border border-slate-200 px-3 py-2.5 !text-left">
        <div className="font-medium text-slate-900">{row.trainee_name}</div>
        <div className="text-xs text-slate-500">
          {row.trainee_email || "—"}
        </div>
        {row.score != null ? (
          <div className="mt-1 text-[10px] font-semibold text-slate-500">
            Eval score: {row.score}
            {row.max_score != null ? ` / ${row.max_score}` : ""}
            {row.passed == null ? "" : row.passed ? " · Pass" : " · Fail"}
          </div>
        ) : null}
      </td>
      <td className="border border-slate-200 px-3 py-2.5 text-center">
        <span className="text-xs font-semibold text-slate-700">
          {effectivenessLabel(row.effectiveness_rating)}
        </span>
        {row.effectiveness_rated_at ? (
          <div className="mt-1 text-[10px] text-slate-500">
            {new Date(row.effectiveness_rated_at).toLocaleDateString("en-IN")}
          </div>
        ) : null}
      </td>
      <td className="border border-slate-200 px-3 py-2.5 text-center">
        <div className="flex flex-col items-center gap-2">
          <select
            className="w-full max-w-[180px] rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            value={rating}
            disabled={busy}
            onChange={(e) =>
              setRating(
                e.target.value as
                  | "effective"
                  | "partial"
                  | "not_effective"
                  | "",
              )
            }
          >
            <option value="">Select rating</option>
            <option value="effective">Effective</option>
            <option value="partial">Partial</option>
            <option value="not_effective">Not effective</option>
          </select>
          <button
            type="button"
            disabled={busy || !rating}
            onClick={() => {
              if (!rating) return;
              onSave(rating, notes);
            }}
            className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </td>
      <td className="border border-slate-200 px-3 py-2.5 !text-left">
        <textarea
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
          placeholder="Optional notes"
          value={notes}
          disabled={busy}
          onChange={(e) => setNotes(e.target.value)}
        />
      </td>
    </tr>
  );
}

type ProgrammeEvalGroup = {
  training_request_id: string;
  training_code: string;
  training_date: string | null;
  programme_title: string;
  programme_id: string | null;
  trainees: EvalRow[];
};

export function QiEvaluationPage() {
  const { profile, isTrainerView } = useAuth();
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [evaluateRow, setEvaluateRow] = useState<EvalRow | null>(null);
  const [viewRow, setViewRow] = useState<EvalRow | null>(null);
  const [traineesGroup, setTraineesGroup] = useState<ProgrammeEvalGroup | null>(
    null,
  );
  const [effectivenessGroup, setEffectivenessGroup] =
    useState<ProgrammeEvalGroup | null>(null);
  const [effectivenessBusyId, setEffectivenessBusyId] = useState<string | null>(
    null,
  );
  const [effectivenessAiBusy, setEffectivenessAiBusy] = useState(false);
  const [effectivenessSuggestions, setEffectivenessSuggestions] = useState<
    Record<
      string,
      { rating: "effective" | "partial" | "not_effective"; notes: string }
    >
  >({});
  const [certificatesGroup, setCertificatesGroup] =
    useState<ProgrammeEvalGroup | null>(null);
  const [certificatesByUser, setCertificatesByUser] = useState<
    Record<string, Certificate>
  >({});
  const [certBusyId, setCertBusyId] = useState<string | null>(null);
  const [viewCert, setViewCert] = useState<{
    title: string;
    html: string;
    openUrl: string | null;
  } | null>(null);
  const [letterhead, setLetterhead] = useState<CertificateLetterhead>({
    companyName: BRAND.shortName,
    tagline: "",
    header: "",
    footer: "",
    logoUrl: null,
    showGst: true,
    gstNumber: null,
    addressLine1: "",
    addressLine2: "",
    email: "",
    mobile: "",
    primaryColor: "#0b3d4a",
    accentColor: "#d4a017",
  });
  const [sendLinkRow, setSendLinkRow] = useState<EvalRow | null>(null);
  const [sendPapers, setSendPapers] = useState<ProgrammeTrainingAsset[]>([]);
  const [sendPaperId, setSendPaperId] = useState("");
  const [sendInstructions, setSendInstructions] = useState("");
  const [loadingSendPapers, setLoadingSendPapers] = useState(false);
  const [evalForm, setEvalForm] = useState({
    passed: "true",
    notes: "",
  });
  const [questionMarks, setQuestionMarks] = useState<
    Record<string, { awardedMarks: string; feedback: string }>
  >({});
  const [aiEvaluating, setAiEvaluating] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, ProgrammeEvalGroup>();
    for (const row of rows) {
      const key = row.training_request_id;
      const existing = map.get(key);
      if (existing) {
        existing.trainees.push(row);
      } else {
        map.set(key, {
          training_request_id: key,
          training_code: row.training_code,
          training_date: row.training_date,
          programme_title: row.programme_title,
          programme_id: row.programme_id,
          trainees: [row],
        });
      }
    }
    return Array.from(map.values());
  }, [rows]);

  async function syncAndLoad() {
    setError(null);
    let requestsQuery = supabase
      .from("training_requests")
      .select("*")
      .eq("status", "completed")
      .order("updated_at", { ascending: false });

    // Trainer login: only completed trainings assigned to this trainer
    if (isTrainerView && profile?.id) {
      requestsQuery = requestsQuery.eq("trainer_id", profile.id);
    }

    const { data: completed, error: reqErr } = await requestsQuery;
    if (reqErr) {
      setError(reqErr.message);
      setRows([]);
      return;
    }
    let requests = (completed ?? []) as TrainingRequest[];
    if (isTrainerView && profile?.id) {
      requests = requests.filter((r) => r.trainer_id === profile.id);
    }
    if (!requests.length) {
      setRows([]);
      return;
    }

    const userIds = [
      ...new Set(requests.flatMap((r) => r.employee_ids ?? []).filter(Boolean)),
    ];
    const programmeIds = [
      ...new Set(
        requests.map((r) => r.programme_id).filter((id): id is string => Boolean(id)),
      ),
    ];

    const [{ data: people }, { data: programmes }, { data: existing }] =
      await Promise.all([
        userIds.length
          ? supabase
              .from("profiles")
              .select("id, full_name, email, mobile")
              .in("id", userIds)
          : Promise.resolve({ data: [] as Profile[] }),
        programmeIds.length
          ? supabase
              .from("training_programmes")
              .select("id, title")
              .in("id", programmeIds)
          : Promise.resolve({
              data: [] as Array<{ id: string; title: string }>,
            }),
        supabase
          .from("trainee_evaluations")
          .select("*")
          .in(
            "training_request_id",
            requests.map((r) => r.id),
          ),
      ]);

    const personById = new Map(
      ((people ?? []) as Profile[]).map((p) => [p.id, p]),
    );
    const progById = new Map(
      ((programmes ?? []) as Array<{ id: string; title: string }>).map((p) => [
        p.id,
        p.title,
      ]),
    );
    const existingKey = new Set(
      ((existing ?? []) as TraineeEvaluation[]).map(
        (e) => `${e.training_request_id}:${e.user_id}`,
      ),
    );

    const toInsert: Array<{
      training_request_id: string;
      session_id: string | null;
      programme_id: string | null;
      user_id: string;
      status: "pending_send";
    }> = [];
    const pendingKeys = new Set<string>();

    for (const req of requests) {
      // Same trainee may appear more than once in employee_ids — keep one eval row per request
      const uniqueEmployeeIds = [...new Set(req.employee_ids ?? [])];
      for (const uid of uniqueEmployeeIds) {
        const key = `${req.id}:${uid}`;
        if (existingKey.has(key) || pendingKeys.has(key)) continue;
        pendingKeys.add(key);
        toInsert.push({
          training_request_id: req.id,
          session_id: req.session_id,
          programme_id: req.programme_id,
          user_id: uid,
          status: "pending_send",
        });
      }
    }

    if (toInsert.length) {
      // ignoreDuplicates: safe when same programme/request syncs concurrently or rows already exist
      const { error: insertErr } = await supabase
        .from("trainee_evaluations")
        .upsert(toInsert, {
          onConflict: "training_request_id,user_id",
          ignoreDuplicates: true,
        });
      if (insertErr) {
        // Non-fatal if unique race — still load whatever rows exist
        const isDuplicate =
          insertErr.code === "23505" ||
          /duplicate key|unique constraint/i.test(insertErr.message);
        if (!isDuplicate) {
          setError(insertErr.message);
          return;
        }
      }
    }

    const { data: allEvals, error: evalErr } = await supabase
      .from("trainee_evaluations")
      .select("*")
      .in(
        "training_request_id",
        requests.map((r) => r.id),
      )
      .order("created_at", { ascending: false });
    if (evalErr) {
      setError(evalErr.message);
      setRows([]);
      return;
    }

    const reqById = new Map(requests.map((r) => [r.id, r]));
    const list: EvalRow[] = ((allEvals ?? []) as TraineeEvaluation[]).map(
      (e) => {
        const req = reqById.get(e.training_request_id);
        const person = personById.get(e.user_id);
        return {
          ...e,
          programme_title:
            (e.programme_id && progById.get(e.programme_id)) ||
            req?.title.replace(/^Request:\s*/i, "") ||
            "Programme",
          training_code: resolveTrainingCode(req),
          training_date: req?.training_date ?? null,
          trainee_name: person?.full_name?.trim() || person?.email || "Trainee",
          trainee_email: person?.email ?? null,
          trainee_mobile: person?.mobile ?? null,
        };
      },
    );
    setRows(list);
    setSelectedIds((prev) =>
      prev.filter((id) => list.some((r) => r.training_request_id === id)),
    );
  }

  useEffect(() => {
    void syncAndLoad();
  }, [isTrainerView, profile?.id]);

  useEffect(() => {
    void (async () => {
      const { data: orgData } = await supabase
        .from("organizations")
        .select(
          "id, name, gst_number, logo_url, address, city, state, pin_code, country, contact_email, contact_phone",
        )
        .eq("type", "platform")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const platform = orgData as Pick<
        Organization,
        | "id"
        | "name"
        | "gst_number"
        | "logo_url"
        | "address"
        | "city"
        | "state"
        | "pin_code"
        | "country"
        | "contact_email"
        | "contact_phone"
      > | null;
      if (!platform) return;

      const { data: settingsData } = await supabase
        .from("company_settings")
        .select(
          "letterhead_company_name, letterhead_tagline, letterhead_header, letterhead_footer, letterhead_logo_url, letterhead_show_gst, theme_primary_color, theme_accent_color",
        )
        .eq("org_id", platform.id)
        .maybeSingle();
      const s = settingsData as Partial<CompanySettings> | null;
      const line1 = platform.address?.trim() || "";
      const line2 = [
        [platform.city, platform.state, platform.pin_code]
          .map((x) => x?.trim())
          .filter(Boolean)
          .join(", "),
        platform.country?.trim(),
      ]
        .filter(Boolean)
        .join(", ");
      setLetterhead({
        companyName:
          s?.letterhead_company_name?.trim() ||
          platform.name?.trim() ||
          BRAND.shortName,
        tagline: s?.letterhead_tagline?.trim() || "",
        header: s?.letterhead_header?.trim() || "",
        footer: s?.letterhead_footer?.trim() || "",
        logoUrl: s?.letterhead_logo_url?.trim() || platform.logo_url || null,
        showGst: s?.letterhead_show_gst ?? true,
        gstNumber: platform.gst_number?.trim() || null,
        addressLine1: line1,
        addressLine2: line2,
        email: platform.contact_email?.trim() || "",
        mobile: platform.contact_phone?.trim() || "",
        // Dedicated letterhead palette (avoid theme purple)
        primaryColor: "#0a3d4c",
        accentColor: "#c9a227",
      });
    })();
  }, []);

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (groups.length > 0 && selectedIds.length === groups.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(groups.map((g) => g.training_request_id));
    }
  }

  async function loadQuestionsFromPaper(
    programmeId: string | null,
    paperAssetId: string,
  ) {
    if (!programmeId || !paperAssetId) {
      return fallbackQuestions("Training");
    }
    const { data: asset } = await supabase
      .from("programme_training_assets")
      .select("content_json, file_name")
      .eq("id", paperAssetId)
      .eq("programme_id", programmeId)
      .eq("category", "question_paper")
      .maybeSingle();
    const json = (asset as { content_json?: unknown } | null)?.content_json;
    const fromAsset = flattenQuestionsFromAsset(json);
    if (fromAsset.length) return fromAsset;
    const { data: prog } = await supabase
      .from("training_programmes")
      .select("title")
      .eq("id", programmeId)
      .maybeSingle();
    return fallbackQuestions(
      (prog as TrainingProgramme | null)?.title || "Training",
    );
  }

  async function openSendLinkModal(row: EvalRow) {
    setError(null);
    setMessage(null);
    setSendLinkRow(row);
    setSendInstructions("");
    setSendPaperId("");
    setSendPapers([]);
    if (!row.programme_id) {
      setError("Programme is missing on this evaluation row.");
      setSendLinkRow(null);
      return;
    }
    setLoadingSendPapers(true);
    try {
      const { data, error: loadErr } = await supabase
        .from("programme_training_assets")
        .select("*")
        .eq("programme_id", row.programme_id)
        .eq("category", "question_paper")
        .order("created_at", { ascending: false });
      if (loadErr) {
        setError(loadErr.message);
        setSendLinkRow(null);
        return;
      }
      const papers = (data ?? []) as ProgrammeTrainingAsset[];
      setSendPapers(papers);
      setSendPaperId(papers[0]?.id ?? "");
    } finally {
      setLoadingSendPapers(false);
    }
  }

  async function confirmSendQuestionLink() {
    if (!sendLinkRow) return;
    if (!sendPaperId) {
      setError("Select a question paper for this training programme.");
      return;
    }
    const row = sendLinkRow;
    const instructions = sendInstructions.trim();
    setError(null);
    setMessage(null);
    setBusyId(row.id);
    try {
      const questions = await loadQuestionsFromPaper(
        row.programme_id,
        sendPaperId,
      );
      if (!questions.length) {
        setError("Selected question paper has no usable questions.");
        return;
      }
      const selectedPaper = sendPapers.find((p) => p.id === sendPaperId);
      const maxScore = questions.reduce((s, q) => s + (q.marks || 0), 0);
      const { error: updErr } = await supabase
        .from("trainee_evaluations")
        .update({
          questions,
          max_score: maxScore,
          status: "link_sent",
          link_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updErr) {
        setError(updErr.message);
        return;
      }

      const { data: trainee } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", row.user_id)
        .maybeSingle();
      const evalPath =
        (trainee as Profile | null)?.role === "org_admin"
          ? "/dashboard/organization/evaluations"
          : "/dashboard/individual/evaluations";

      const paperLabel = selectedPaper?.file_name || "Question paper";
      const bodyParts = [
        `Please open My Evaluations and submit your online answers for "${row.programme_title}".`,
        `Paper: ${paperLabel}.`,
        instructions ? `Instructions: ${instructions}` : "",
      ].filter(Boolean);

      await supabase.from("app_notifications").insert({
        user_id: row.user_id,
        title: `Question paper: ${row.programme_title}`,
        body: bodyParts.join(" "),
        link: evalPath,
        kind: "evaluation_invite",
        metadata: {
          evaluation_id: row.id,
          question_paper_asset_id: sendPaperId,
          instructions: instructions || null,
        },
      });

      setMessage(`Question paper link sent to ${row.trainee_name}.`);
      setSendLinkRow(null);
      setSendPapers([]);
      setSendPaperId("");
      setSendInstructions("");
      await syncAndLoad();
    } finally {
      setBusyId(null);
    }
  }

  async function saveEffectiveness(
    row: EvalRow,
    rating: "effective" | "partial" | "not_effective",
    notes: string,
  ) {
    setError(null);
    setMessage(null);
    setEffectivenessBusyId(row.id);
    const { error: updErr } = await supabase
      .from("trainee_evaluations")
      .update({
        effectiveness_rating: rating,
        effectiveness_notes: notes.trim() || null,
        effectiveness_rated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    setEffectivenessBusyId(null);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setMessage(`Training effectiveness saved for ${row.trainee_name}.`);
    await syncAndLoad();
  }

  async function runAiEffectiveness() {
    if (!effectivenessGroup) return;
    setError(null);
    setMessage(null);
    const liveTrainees =
      groups.find(
        (g) =>
          g.training_request_id === effectivenessGroup.training_request_id,
      )?.trainees ?? effectivenessGroup.trainees;

    setEffectivenessAiBusy(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        ok?: boolean;
        error?: string;
        ratings?: Array<{
          evaluationId: string;
          rating: "effective" | "partial" | "not_effective";
          notes: string;
        }>;
      }>("rate-training-effectiveness", {
        body: {
          programmeTitle: effectivenessGroup.programme_title,
          trainees: liveTrainees.map((t) => ({
            evaluationId: t.id,
            traineeName: t.trainee_name,
            status: t.status,
            score: t.score,
            maxScore: t.max_score,
            passed: t.passed,
            evaluatorNotes: t.evaluator_notes,
            questionFeedback: (t.question_evaluations ?? [])
              .map((q) => q.feedback)
              .filter((x): x is string => Boolean(x)),
          })),
        },
      });
      if (fnError) {
        setError(
          data?.error || fnError.message || "AI effectiveness rating failed.",
        );
        return;
      }
      if (data?.error || !data?.ratings?.length) {
        setError(data?.error || "AI effectiveness rating failed.");
        return;
      }

      const next: Record<
        string,
        { rating: "effective" | "partial" | "not_effective"; notes: string }
      > = {};
      for (const item of data.ratings) {
        next[item.evaluationId] = {
          rating: item.rating,
          notes: item.notes,
        };
      }
      setEffectivenessSuggestions(next);

      // Auto-save all AI ratings
      for (const item of data.ratings) {
        const row = liveTrainees.find((t) => t.id === item.evaluationId);
        if (!row) continue;
        setEffectivenessBusyId(row.id);
        const { error: updErr } = await supabase
          .from("trainee_evaluations")
          .update({
            effectiveness_rating: item.rating,
            effectiveness_notes: item.notes.trim() || null,
            effectiveness_rated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (updErr) {
          setEffectivenessBusyId(null);
          setError(updErr.message);
          return;
        }
      }
      setEffectivenessBusyId(null);
      setMessage(
        `AI rated training effectiveness for ${data.ratings.length} trainee(s).`,
      );
      await syncAndLoad();
    } finally {
      setEffectivenessAiBusy(false);
    }
  }

  async function openCertificatesModal(group: ProgrammeEvalGroup) {
    setCertificatesGroup(group);
    setCertificatesByUser({});
    setError(null);
    const liveTrainees =
      groups.find(
        (g) => g.training_request_id === group.training_request_id,
      )?.trainees ?? group.trainees;
    const userIds = liveTrainees.map((t) => t.user_id);
    if (!userIds.length) return;

    let query = supabase
      .from("certificates")
      .select("*")
      .in("user_id", userIds)
      .order("issued_at", { ascending: false });
    if (group.programme_id) {
      query = query.eq("programme_id", group.programme_id);
    } else {
      query = query.ilike("title", `%${group.programme_title}%`);
    }
    const { data, error: loadErr } = await query;
    if (loadErr) {
      setError(loadErr.message);
      return;
    }
    const map: Record<string, Certificate> = {};
    for (const c of (data ?? []) as Certificate[]) {
      if (!map[c.user_id]) map[c.user_id] = c;
    }
    setCertificatesByUser(map);
  }

  function buildCertificateHtml(args: {
    traineeName: string;
    programmeTitle: string;
    score: number | null;
    maxScore: number | null;
    passed: boolean | null;
    issuedAt: string;
    trainingCode?: string | null;
    trainingDate?: string | null;
  }) {
    const brand = letterhead;
    const primary = brand.primaryColor || "#0a3d4c";
    const accent = brand.accentColor || "#c9a227";
    const textOnBand = "#f8fafc";
    const textSoft = "#e2e8f0";
    const scoreLine =
      args.score != null
        ? `Score: ${args.score}${args.maxScore != null ? ` / ${args.maxScore}` : ""}${
            args.passed == null
              ? ""
              : args.passed
                ? " · Passed"
                : " · Failed"
          }`
        : "";
    const percent =
      args.score != null && args.maxScore != null && args.maxScore > 0
        ? Math.round((args.score / args.maxScore) * 100)
        : null;
    let performanceSummary = "";
    if (args.passed === true) {
      const level =
        percent == null
          ? "satisfactory"
          : percent >= 90
            ? "excellent"
            : percent >= 75
              ? "good"
              : "satisfactory";
      performanceSummary = `Overall performance is ${level}${
        percent != null ? ` (${percent}%)` : ""
      }. The trainee has met the assessment criteria for this programme. No immediate repeat training is required; continue applying the learning on the job and join refresher sessions when scheduled.`;
    } else if (args.passed === false) {
      performanceSummary = `Overall performance is below the required standard${
        percent != null ? ` (${percent}%)` : ""
      }. The trainee has not cleared this assessment. Next training / re-assessment is required before certification competency can be confirmed.`;
    } else if (args.score != null) {
      performanceSummary = `Assessment score has been recorded${
        percent != null ? ` (${percent}%)` : ""
      }. Final pass/fail status is pending review. Next training requirement will be confirmed after evaluation closure.`;
    } else {
      performanceSummary =
        "Assessment outcome is pending. Performance level and any next training requirement will be updated after evaluation is completed.";
    }
    const issued = new Date(args.issuedAt).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const trainingDateLabel = args.trainingDate
      ? new Date(args.trainingDate).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : null;
    const logoBlock = brand.logoUrl
      ? `<img class="logo" src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.companyName)} logo" />`
      : `<div class="logo-fallback">${escapeHtml(brand.companyName.slice(0, 2).toUpperCase())}</div>`;
    const headerLine = brand.header
      ? `<p class="letter-header">${escapeHtml(brand.header)}</p>`
      : "";
    const tagline = brand.tagline
      ? `<p class="tagline">${escapeHtml(brand.tagline)}</p>`
      : "";
    const addressLine =
      brand.addressLine1 || brand.addressLine2
        ? `<div class="address">
            ${brand.addressLine1 ? `<p class="addr-line">${escapeHtml(brand.addressLine1)}</p>` : ""}
            ${brand.addressLine2 ? `<p class="addr-line">${escapeHtml(brand.addressLine2)}</p>` : ""}
          </div>`
        : "";
    const emailCell = brand.email
      ? `<div class="bar-item left"><span class="k">Email ID</span><span class="v">${escapeHtml(brand.email)}</span></div>`
      : `<div class="bar-item left"><span class="k">Email ID</span><span class="v">—</span></div>`;
    const gstCell =
      brand.showGst && brand.gstNumber
        ? `<div class="bar-item center"><span class="k">GST No</span><span class="v">${escapeHtml(brand.gstNumber)}</span></div>`
        : `<div class="bar-item center"><span class="k">GST No</span><span class="v">—</span></div>`;
    const mobileCell = brand.mobile
      ? `<div class="bar-item right"><span class="k">Mobile</span><span class="v">${escapeHtml(brand.mobile)}</span></div>`
      : `<div class="bar-item right"><span class="k">Mobile</span><span class="v">—</span></div>`;
    const footerText = brand.footer
      ? escapeHtml(brand.footer)
      : BRAND.footerLine;
    const footerAddressText = [brand.addressLine1, brand.addressLine2]
      .filter(Boolean)
      .join(", ");
    const footerAddressBar = footerAddressText
      ? `<div class="footer-address-bar">
            <span class="addr-label">Address</span>
            <p class="addr">${escapeHtml(footerAddressText)}</p>
          </div>`
      : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Certificate — ${escapeHtml(args.programmeTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,700;1,500&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --primary: ${escapeHtml(primary)};
      --accent: ${escapeHtml(accent)};
      --band-text: ${escapeHtml(textOnBand)};
      --band-muted: ${escapeHtml(textSoft)};
      --ink: #0f172a;
      --muted: #475569;
      --paper: #fffdf8;
      --wash: #eef6f7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(ellipse at top, color-mix(in srgb, var(--primary) 18%, white), transparent 55%),
        linear-gradient(160deg, #f4f7fb 0%, var(--wash) 45%, #f8fafc 100%);
      color: var(--ink);
      font-family: "Source Sans 3", "Segoe UI", sans-serif;
    }
    .page {
      max-width: 980px;
      margin: 28px auto;
      padding: 18px;
    }
    .sheet {
      position: relative;
      overflow: hidden;
      background: var(--paper);
      border-radius: 18px;
      box-shadow:
        0 24px 60px rgba(15, 23, 42, 0.14),
        0 2px 0 rgba(255,255,255,0.8) inset;
      border: 1px solid color-mix(in srgb, var(--primary) 22%, #cbd5e1);
    }
    .sheet::before {
      content: "";
      position: absolute;
      inset: 18px;
      border: 2px solid color-mix(in srgb, var(--accent) 70%, #d4af37);
      border-radius: 12px;
      pointer-events: none;
      opacity: 0.85;
    }
    .sheet::after {
      content: "";
      position: absolute;
      inset: 26px;
      border: 1px solid color-mix(in srgb, var(--primary) 35%, transparent);
      border-radius: 8px;
      pointer-events: none;
    }
    .inner {
      position: relative;
      z-index: 1;
      padding: 42px 42px 34px;
    }
    .top-band {
      display: flex;
      flex-direction: column;
      gap: 0;
      padding: 0;
      margin: 0 0 20px;
      border-radius: 12px;
      overflow: hidden;
      background:
        linear-gradient(
          115deg,
          #063642 0%,
          var(--primary) 38%,
          #145568 72%,
          color-mix(in srgb, var(--accent) 35%, #0a3d4c) 100%
        );
      color: var(--band-text);
      box-shadow: 0 10px 24px rgba(6, 54, 66, 0.35);
    }
    .top-main {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      padding: 16px 18px 14px;
    }
    .logo, .logo-fallback {
      width: 78px;
      height: 78px;
      border-radius: 14px;
      background: #fff;
      object-fit: contain;
      padding: 8px;
      flex-shrink: 0;
      box-shadow: 0 4px 14px rgba(0,0,0,0.18);
    }
    .logo-fallback {
      display: grid;
      place-items: center;
      font-family: "Cormorant Garamond", Georgia, serif;
      font-weight: 700;
      font-size: 26px;
      color: var(--primary);
    }
    .brand-copy {
      min-width: 0;
      flex: 1;
      text-align: right;
      color: var(--band-text);
    }
    .company {
      margin: 0;
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: clamp(34px, 4.2vw, 42px);
      font-weight: 700;
      letter-spacing: 0.015em;
      line-height: 1.1;
      text-align: right;
      color: #ffffff;
      text-shadow: 0 1px 0 rgba(0,0,0,0.18);
    }
    .tagline {
      margin: 4px 0 0;
      font-size: 12px;
      color: var(--band-muted);
      font-weight: 600;
      text-align: right;
    }
    .letter-header {
      margin: 6px 0 0;
      font-size: 11px;
      color: var(--band-muted);
      line-height: 1.4;
      white-space: pre-wrap;
      text-align: right;
    }
    .address {
      margin: 8px 0 0;
      text-align: right;
    }
    .addr-line {
      margin: 0;
      font-size: 12.5px;
      font-weight: 600;
      line-height: 1.45;
      text-align: right;
      color: var(--band-text);
    }
    .addr-line + .addr-line {
      margin-top: 2px;
      color: var(--band-muted);
    }
    .contact-bar {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      width: 100%;
      padding: 10px 16px 12px;
      border-top: 1px solid rgba(255,255,255,0.18);
      background: rgba(0, 20, 28, 0.28);
      color: var(--band-text);
    }
    .bar-item {
      min-width: 0;
    }
    .bar-item.left { text-align: left; }
    .bar-item.center { text-align: center; }
    .bar-item.right { text-align: right; }
    .bar-item .k {
      display: block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: color-mix(in srgb, var(--accent) 55%, white);
      margin-bottom: 2px;
    }
    .bar-item .v {
      display: block;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.35;
      word-break: break-word;
      color: #ffffff;
    }
    .ribbon {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin: 8px 0 10px;
      color: var(--primary);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
    }
    .ribbon::before, .ribbon::after {
      content: "";
      height: 1px;
      width: 72px;
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
    }
    h1 {
      margin: 0;
      text-align: center;
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: clamp(34px, 5vw, 48px);
      font-weight: 700;
      color: var(--primary);
      letter-spacing: 0.01em;
    }
    .sub {
      text-align: center;
      color: var(--muted);
      margin: 10px 0 0;
      font-size: 15px;
    }
    .name {
      text-align: center;
      margin: 18px 0 8px;
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: clamp(32px, 4.5vw, 44px);
      font-weight: 700;
      font-style: italic;
      color: color-mix(in srgb, var(--primary) 70%, #0f172a);
      background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 25%, transparent), transparent);
      padding: 8px 16px;
    }
    .prog {
      text-align: center;
      margin: 14px auto 22px;
      max-width: 720px;
      font-size: 21px;
      font-weight: 700;
      color: var(--ink);
      line-height: 1.35;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      max-width: 860px;
      margin: 0 auto 18px;
      align-items: stretch;
    }
    .meta-card {
      text-align: center;
      padding: 12px 10px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--primary) 6%, white);
      border: 1px solid color-mix(in srgb, var(--primary) 14%, #e2e8f0);
      min-width: 0;
    }
    .meta-card .label {
      display: block;
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
      margin-bottom: 4px;
    }
    .meta-card .value {
      font-size: 13px;
      font-weight: 700;
      color: var(--ink);
      word-break: break-word;
      line-height: 1.35;
    }
    .meta-rule {
      max-width: 860px;
      margin: 0 auto 26px;
      display: grid;
      gap: 6px;
    }
    .meta-rule span {
      display: block;
      height: 1px;
      width: 100%;
      background: linear-gradient(
        90deg,
        transparent 0%,
        color-mix(in srgb, var(--accent) 75%, #d4af37) 18%,
        color-mix(in srgb, var(--primary) 55%, #64748b) 50%,
        color-mix(in srgb, var(--accent) 75%, #d4af37) 82%,
        transparent 100%
      );
    }
    .meta-rule span:nth-child(2) {
      height: 2px;
      opacity: 0.85;
    }
    .meta-rule span:nth-child(3) {
      opacity: 0.45;
      width: 72%;
      margin: 0 auto;
    }
    .result-note {
      max-width: 860px;
      margin: 0 auto 26px;
      padding: 14px 16px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--primary) 16%, #e2e8f0);
      background: color-mix(in srgb, var(--primary) 5%, white);
      text-align: center;
    }
    .result-note.pass {
      border-color: color-mix(in srgb, #059669 30%, #e2e8f0);
      background: color-mix(in srgb, #059669 7%, white);
    }
    .result-note.fail {
      border-color: color-mix(in srgb, #dc2626 28%, #e2e8f0);
      background: color-mix(in srgb, #dc2626 6%, white);
    }
    .result-note .title {
      margin: 0 0 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--primary);
    }
    .result-note.pass .title { color: #047857; }
    .result-note.fail .title { color: #b91c1c; }
    .result-note p {
      margin: 0;
      font-size: 13.5px;
      line-height: 1.55;
      color: #334155;
      font-weight: 600;
    }
    @media (max-width: 820px) {
      .meta {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .seal-wrap {
      display: flex;
      justify-content: center;
      margin: 6px 0 26px;
    }
    .seal {
      position: relative;
      width: 118px;
      height: 118px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 32% 28%, color-mix(in srgb, var(--accent) 70%, #fff) 0%, var(--accent) 38%, color-mix(in srgb, var(--primary) 40%, var(--accent)) 72%, var(--primary) 100%);
      box-shadow:
        0 0 0 3px color-mix(in srgb, var(--accent) 55%, #fff),
        0 0 0 6px color-mix(in srgb, var(--primary) 55%, var(--accent)),
        0 10px 24px color-mix(in srgb, var(--primary) 28%, transparent);
    }
    .seal::before {
      content: "";
      position: absolute;
      inset: 8px;
      border-radius: 50%;
      border: 1.5px dashed rgba(255,255,255,0.55);
      pointer-events: none;
    }
    .seal::after {
      content: "";
      position: absolute;
      inset: 14px;
      border-radius: 50%;
      background:
        radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--primary) 75%, #0a2530), color-mix(in srgb, var(--primary) 92%, #041218));
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.18);
      z-index: 0;
    }
    .seal-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      color: #fff;
      text-align: center;
      padding-top: 2px;
    }
    .seal-content svg {
      width: 22px;
      height: 22px;
      margin-bottom: 2px;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.25));
    }
    .seal-content .seal-check {
      fill: color-mix(in srgb, var(--accent) 82%, #fff);
    }
    .seal-content .seal-tick {
      fill: none;
      stroke: var(--primary);
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .seal-content .seal-kicker {
      font-family: "Source Sans 3", system-ui, sans-serif;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: color-mix(in srgb, var(--accent) 75%, #fff);
      line-height: 1;
    }
    .seal-content .seal-title {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      line-height: 1.05;
      color: #fff;
    }
    .seal-content .seal-sub {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: color-mix(in srgb, var(--accent) 65%, #fff);
      line-height: 1.1;
    }
    .footer-block {
      margin-top: 8px;
      padding-top: 18px;
      border-top: 1px solid color-mix(in srgb, var(--primary) 18%, #e2e8f0);
    }
    .signs {
      display: flex;
      justify-content: space-between;
      gap: 28px;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }
    .sign {
      min-width: 180px;
      flex: 1;
      text-align: center;
      font-size: 13px;
      color: var(--muted);
    }
    .sign .line {
      border-top: 1.5px solid color-mix(in srgb, var(--primary) 35%, #94a3b8);
      margin: 36px 12px 8px;
    }
    .sign strong { display: block; color: var(--ink); font-size: 13px; }
    .bottom-note {
      text-align: center;
      font-size: 12px;
      color: var(--muted);
      line-height: 1.5;
      white-space: pre-wrap;
      margin: 0 0 14px;
      padding-bottom: 14px;
      border-bottom: 1.5px solid color-mix(in srgb, var(--primary) 28%, #cbd5e1);
    }
    .footer-address-bar {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      text-align: center;
      padding: 10px 16px;
      border-radius: 10px;
      background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 6%, #fff), color-mix(in srgb, var(--accent) 5%, #fff));
      border: 1px solid color-mix(in srgb, var(--primary) 14%, #e2e8f0);
    }
    .footer-address-bar .addr-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--primary);
    }
    .footer-address-bar .addr {
      margin: 0;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--ink);
      line-height: 1.55;
      max-width: 92%;
    }
    @media print {
      body { background: white; }
      .page { margin: 0; max-width: none; padding: 0; }
      .sheet { box-shadow: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="sheet">
      <div class="inner">
        <header class="top-band">
          <div class="top-main">
            ${logoBlock}
            <div class="brand-copy">
              <h2 class="company">${escapeHtml(brand.companyName)}</h2>
              ${tagline}
              ${headerLine}
              ${addressLine}
            </div>
          </div>
          <div class="contact-bar">
            ${emailCell}
            ${gstCell}
            ${mobileCell}
          </div>
        </header>

        <div class="ribbon">Official Training Certificate</div>
        <h1>Certificate of Completion</h1>
        <p class="sub">This is to certify that</p>
        <div class="name">${escapeHtml(args.traineeName)}</div>
        <p class="sub">has successfully completed the training programme</p>
        <div class="prog">${escapeHtml(args.programmeTitle)}</div>

        <div class="seal-wrap">
          <div class="seal" aria-label="Verified and awarded">
            <div class="seal-content">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle class="seal-check" cx="12" cy="12" r="11"/>
                <path class="seal-tick" d="M7.2 12.2l3.1 3.1 6.5-6.6"/>
              </svg>
              <span class="seal-kicker">Official</span>
              <span class="seal-title">Verified</span>
              <span class="seal-sub">&amp; Awarded</span>
            </div>
          </div>
        </div>

        <div class="meta">
          ${
            scoreLine
              ? `<div class="meta-card"><span class="label">Assessment</span><span class="value">${escapeHtml(scoreLine)}</span></div>`
              : `<div class="meta-card"><span class="label">Assessment</span><span class="value">—</span></div>`
          }
          <div class="meta-card"><span class="label">Issued on</span><span class="value">${escapeHtml(issued)}</span></div>
          <div class="meta-card"><span class="label">Training date</span><span class="value">${escapeHtml(trainingDateLabel || "—")}</span></div>
          <div class="meta-card"><span class="label">Training code</span><span class="value">${escapeHtml(args.trainingCode || "—")}</span></div>
        </div>
        <div class="meta-rule" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="result-note ${
          args.passed === true ? "pass" : args.passed === false ? "fail" : ""
        }">
          <div class="title">Performance &amp; Next Training</div>
          <p>${escapeHtml(performanceSummary)}</p>
        </div>

        <div class="footer-block">
          <div class="signs">
            <div class="sign">
              <div class="line"></div>
              <strong>Authorized Signatory</strong>
              ${escapeHtml(brand.companyName)}
            </div>
            <div class="sign">
              <div class="line"></div>
              <strong>Training Department</strong>
              Quality &amp; Learning
            </div>
          </div>
          <p class="bottom-note">${footerText}</p>
          ${footerAddressBar}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  function escapeHtml(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  async function generateCertificate(row: EvalRow) {
    if (!certificatesGroup) return;
    setError(null);
    setMessage(null);
    setCertBusyId(row.id);
    try {
      const issuedAt = new Date().toISOString();
      const title = `Certificate — ${certificatesGroup.programme_title}`;
      const html = buildCertificateHtml({
        traineeName: row.trainee_name,
        programmeTitle: certificatesGroup.programme_title,
        score: row.score,
        maxScore: row.max_score,
        passed: row.passed,
        issuedAt,
        trainingCode: certificatesGroup.training_code,
        trainingDate: certificatesGroup.training_date,
      });

      const existing = certificatesByUser[row.user_id];
      let certId = existing?.id ?? crypto.randomUUID();
      const storagePath = `${row.user_id}/${certId}.html`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });

      const { error: uploadErr } = await supabase.storage
        .from("certificates")
        .upload(storagePath, blob, {
          contentType: "text/html;charset=utf-8",
          upsert: true,
        });
      if (uploadErr) {
        setError(uploadErr.message);
        return;
      }

      if (existing) {
        const { data, error: updErr } = await supabase
          .from("certificates")
          .update({
            title,
            programme_id: row.programme_id,
            session_id: row.session_id,
            storage_path: storagePath,
            issued_at: issuedAt,
          })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (updErr) {
          setError(updErr.message);
          return;
        }
        setCertificatesByUser((prev) => ({
          ...prev,
          [row.user_id]: data as Certificate,
        }));
      } else {
        const { data, error: insErr } = await supabase
          .from("certificates")
          .insert({
            id: certId,
            user_id: row.user_id,
            programme_id: row.programme_id,
            session_id: row.session_id,
            title,
            issued_at: issuedAt,
            storage_path: storagePath,
          })
          .select("*")
          .single();
        if (insErr) {
          setError(insErr.message);
          return;
        }
        setCertificatesByUser((prev) => ({
          ...prev,
          [row.user_id]: data as Certificate,
        }));
      }
      setMessage(`Certificate generated for ${row.trainee_name}.`);
    } finally {
      setCertBusyId(null);
    }
  }

  async function viewCertificate(row: EvalRow) {
    const cert = certificatesByUser[row.user_id];
    if (!cert) {
      setError("Generate the certificate first.");
      return;
    }
    setError(null);
    const html = buildCertificateHtml({
      traineeName: row.trainee_name,
      programmeTitle: certificatesGroup?.programme_title ?? cert.title,
      score: row.score,
      maxScore: row.max_score,
      passed: row.passed,
      issuedAt: cert.issued_at,
      trainingCode: certificatesGroup?.training_code,
      trainingDate: certificatesGroup?.training_date,
    });
    let openUrl: string | null = null;
    if (cert.storage_path) {
      const { data } = await supabase.storage
        .from("certificates")
        .createSignedUrl(cert.storage_path, 60 * 30);
      openUrl = data?.signedUrl ?? null;
    }
    setViewCert({ title: cert.title, html, openUrl });
  }

  async function sendCertificate(row: EvalRow) {
    const cert = certificatesByUser[row.user_id];
    if (!cert) {
      setError("Generate the certificate first.");
      return;
    }
    setError(null);
    setMessage(null);
    setCertBusyId(row.id);
    try {
      const { data: trainee } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", row.user_id)
        .maybeSingle();
      const certPath =
        (trainee as Profile | null)?.role === "org_admin"
          ? "/dashboard/organization/certificates"
          : "/dashboard/individual/certificates";
      const { error: notifyErr } = await supabase
        .from("app_notifications")
        .insert({
          user_id: row.user_id,
          title: `Certificate ready: ${certificatesGroup?.programme_title ?? cert.title}`,
          body: `Your training certificate for "${certificatesGroup?.programme_title ?? cert.title}" is ready. Open Certificates to view it.`,
          link: certPath,
          kind: "certificate_issued",
          metadata: {
            certificate_id: cert.id,
            programme_id: row.programme_id,
            evaluation_id: row.id,
          },
        });
      if (notifyErr) {
        setError(notifyErr.message);
        return;
      }
      setMessage(`Certificate notification sent to ${row.trainee_name}.`);
    } finally {
      setCertBusyId(null);
    }
  }

  function openEvaluate(row: EvalRow) {
    setEvaluateRow(row);
    const existing = new Map(
      (row.question_evaluations ?? []).map((q) => [q.questionId, q]),
    );
    const answerById = new Map(
      (row.answers ?? []).map((a) => [a.questionId, a]),
    );
    const next: Record<string, { awardedMarks: string; feedback: string }> =
      {};
    for (const q of row.questions ?? []) {
      const prior = existing.get(q.id);
      if (prior) {
        next[q.id] = {
          awardedMarks: String(prior.awardedMarks),
          feedback: prior.feedback ?? "",
        };
        continue;
      }
      // Sensible default for MCQ when answer key exists
      const ans = answerById.get(q.id);
      if (
        q.type === "mcq" &&
        q.correctOptionIndex != null &&
        ans?.selectedOption != null
      ) {
        const correct = ans.selectedOption === q.correctOptionIndex;
        next[q.id] = {
          awardedMarks: String(correct ? q.marks : 0),
          feedback: correct ? "Correct." : "Incorrect.",
        };
      } else {
        next[q.id] = { awardedMarks: "", feedback: "" };
      }
    }
    setQuestionMarks(next);
    const seededTotal = Object.values(next).reduce((sum, item) => {
      const n = Number(item.awardedMarks);
      return sum + (Number.isNaN(n) ? 0 : n);
    }, 0);
    const max =
      row.max_score ??
      (row.questions ?? []).reduce((s, q) => s + (q.marks || 0), 0);
    const defaultPassed =
      row.passed != null
        ? row.passed
        : max > 0
          ? seededTotal / max >= 0.6
          : true;
    setEvalForm({
      passed: defaultPassed ? "true" : "false",
      notes: row.evaluator_notes ?? "",
    });
  }

  function evaluationTotals() {
    const questions = evaluateRow?.questions ?? [];
    const max = questions.reduce((s, q) => s + (Number(q.marks) || 0), 0);
    let total = 0;
    for (const q of questions) {
      const n = Number(questionMarks[q.id]?.awardedMarks);
      if (!Number.isNaN(n)) total += Math.max(0, Math.min(q.marks || 0, n));
    }
    return { total, max };
  }

  async function runAiEvaluation() {
    if (!evaluateRow) return;
    setError(null);
    setMessage(null);
    setAiEvaluating(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        ok?: boolean;
        error?: string;
        questionEvaluations?: TraineeQuestionEvaluation[];
        totalScore?: number;
        passed?: boolean;
        summaryNotes?: string;
      }>("evaluate-trainee-answers", {
        body: {
          programmeTitle: evaluateRow.programme_title,
          questions: evaluateRow.questions ?? [],
          answers: evaluateRow.answers ?? [],
          passPercent: 60,
        },
      });
      if (fnError) {
        setError(data?.error || fnError.message || "AI evaluation failed.");
        return;
      }
      if (data?.error || !data?.questionEvaluations) {
        setError(data?.error || "AI evaluation failed.");
        return;
      }
      const next: Record<string, { awardedMarks: string; feedback: string }> =
        {};
      for (const item of data.questionEvaluations) {
        next[item.questionId] = {
          awardedMarks: String(item.awardedMarks ?? 0),
          feedback: item.feedback ?? "",
        };
      }
      setQuestionMarks(next);
      setEvalForm((f) => ({
        passed: data.passed === false ? "false" : "true",
        notes: data.summaryNotes?.trim() || f.notes,
      }));
      setMessage("AI evaluation applied — review and save.");
    } finally {
      setAiEvaluating(false);
    }
  }

  async function saveEvaluation() {
    if (!evaluateRow || !profile) return;
    setError(null);
    setMessage(null);
    const questions = evaluateRow.questions ?? [];
    const question_evaluations: TraineeQuestionEvaluation[] = [];
    for (const q of questions) {
      const raw = questionMarks[q.id]?.awardedMarks;
      const awarded = Number(raw);
      if (raw === "" || Number.isNaN(awarded) || awarded < 0) {
        setError(`Enter marks for question: ${q.text.slice(0, 80)}`);
        return;
      }
      if (awarded > (q.marks || 0)) {
        setError(
          `Marks for a question cannot exceed ${q.marks}. Check: ${q.text.slice(0, 80)}`,
        );
        return;
      }
      question_evaluations.push({
        questionId: q.id,
        awardedMarks: awarded,
        feedback: questionMarks[q.id]?.feedback?.trim() || undefined,
        isCorrect:
          q.type === "mcq" && q.correctOptionIndex != null
            ? (evaluateRow.answers ?? []).find((a) => a.questionId === q.id)
                ?.selectedOption === q.correctOptionIndex
            : null,
      });
    }
    const score = question_evaluations.reduce(
      (s, item) => s + item.awardedMarks,
      0,
    );
    const max_score = questions.reduce((s, q) => s + (q.marks || 0), 0);
    setBusyId(evaluateRow.id);
    const { error: updErr } = await supabase
      .from("trainee_evaluations")
      .update({
        question_evaluations,
        score,
        max_score,
        passed: evalForm.passed === "true",
        evaluator_notes: evalForm.notes.trim() || null,
        status: "evaluated",
        evaluated_by: profile.id,
        evaluated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", evaluateRow.id);
    setBusyId(null);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setMessage(`Evaluation saved for ${evaluateRow.trainee_name}.`);
    setEvaluateRow(null);
    await syncAndLoad();
  }

  return (
    <div>
      <PageHeader title="Evaluation of Trainee" />
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-emerald-700">{message}</p> : null}

      {groups.length === 0 ? (
        <EmptyState
          message={
            isTrainerView
              ? "No completed trainings assigned to you yet. Once a training assigned to you is marked Completed, it will appear here."
              : "No completed trainings yet. Mark a training Completed in Assign Programmes to start evaluation."
          }
        />
      ) : (
        <Panel className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-12 border border-slate-200 px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={
                        groups.length > 0 &&
                        selectedIds.length === groups.length
                      }
                      onChange={toggleSelectAll}
                      aria-label="Select all programmes"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Training ID
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Programme
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Trainee
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Training Effectiveness
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Status
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const liveGroup =
                    groups.find(
                      (g) =>
                        g.training_request_id === group.training_request_id,
                    ) ?? group;
                  const status = groupEvalStatus(liveGroup.trainees);
                  const statusClass =
                    status.tone === "emerald"
                      ? "bg-emerald-50 text-emerald-700"
                      : status.tone === "amber"
                        ? "bg-amber-50 text-amber-700"
                        : status.tone === "sky"
                          ? "bg-sky-50 text-sky-700"
                          : "bg-slate-100 text-slate-600";
                  return (
                    <tr
                      key={group.training_request_id}
                      className="hover:bg-slate-50/80"
                    >
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(
                            group.training_request_id,
                          )}
                          onChange={() =>
                            toggleSelect(group.training_request_id)
                          }
                          aria-label={`Select ${group.training_code}`}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-left">
                        <span className="font-mono text-xs font-semibold tracking-wide text-indigo-700">
                          {group.training_code}
                        </span>
                        {group.training_date ? (
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {group.training_date}
                          </div>
                        ) : null}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium text-slate-900">
                        {group.programme_title}
                        <div className="mt-0.5 text-xs font-normal text-slate-500">
                          {liveGroup.trainees.length} trainee
                          {liveGroup.trainees.length === 1 ? "" : "s"}
                        </div>
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => setTraineesGroup(liveGroup)}
                          className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          View
                        </button>
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => setEffectivenessGroup(liveGroup)}
                          className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                        >
                          View
                        </button>
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClass}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => void openCertificatesModal(liveGroup)}
                          className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                          title="Generate and send certificates"
                        >
                          Certificate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {certificatesGroup ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="certificates-title"
        >
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="certificates-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Certificates
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-mono text-xs font-semibold text-indigo-700">
                    {certificatesGroup.training_code}
                  </span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  {certificatesGroup.programme_title}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  setCertificatesGroup(null);
                  setCertificatesByUser({});
                }}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="border border-slate-200 px-3 py-2.5 text-left">
                      Employee
                    </th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center">
                      Evaluation
                    </th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center">
                      Certificate Status
                    </th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center">
                      Generate Certificate
                    </th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center">
                      View Certificate
                    </th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center">
                      Send Certificate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    groups.find(
                      (g) =>
                        g.training_request_id ===
                        certificatesGroup.training_request_id,
                    )?.trainees ?? certificatesGroup.trainees
                  ).map((row) => {
                    const cert = certificatesByUser[row.user_id];
                    const busy = certBusyId === row.id;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="border border-slate-200 px-3 py-2.5 !text-left">
                          <div className="font-medium text-slate-900">
                            {row.trainee_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {row.trainee_email || "—"}
                          </div>
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                          {row.score != null
                            ? `${row.score}${
                                row.max_score != null
                                  ? ` / ${row.max_score}`
                                  : ""
                              }`
                            : "—"}
                          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {statusLabel(row.status)}
                          </div>
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          {cert ? (
                            <div>
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                                Generated
                              </span>
                              <div className="mt-1 text-[10px] text-slate-500">
                                {new Date(cert.issued_at).toLocaleDateString(
                                  "en-IN",
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">
                              Not generated
                            </span>
                          )}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void generateCertificate(row)}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {busy
                              ? "Working…"
                              : cert
                                ? "Regenerate"
                                : "Generate Certificate"}
                          </button>
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          <button
                            type="button"
                            disabled={busy || !cert}
                            onClick={() => void viewCertificate(row)}
                            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            View Certificate
                          </button>
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          <button
                            type="button"
                            disabled={busy || !cert}
                            onClick={() => void sendCertificate(row)}
                            className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                          >
                            Send Certificate
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {viewCert ? (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-slate-100"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-teal-900 to-slate-800 px-4 py-3 text-white shadow-sm">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-200/90">
                Official certificate preview
              </p>
              <h2 className="truncate text-base font-semibold text-white">
                {viewCert.title}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {viewCert.openUrl ? (
                <a
                  href={viewCert.openUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
                >
                  Open in new tab
                </a>
              ) : null}
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-white/80 hover:bg-white/10"
                onClick={() => setViewCert(null)}
                title="Close"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
          <iframe
            title={viewCert.title}
            srcDoc={viewCert.html}
            className="min-h-0 w-full flex-1 bg-slate-100"
          />
        </div>
      ) : null}

      {effectivenessGroup ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="effectiveness-title"
        >
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="effectiveness-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Training Effectiveness
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-mono text-xs font-semibold text-indigo-700">
                    {effectivenessGroup.training_code}
                  </span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  {effectivenessGroup.programme_title}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={effectivenessAiBusy || Boolean(effectivenessBusyId)}
                  onClick={() => void runAiEffectiveness()}
                  className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                >
                  {effectivenessAiBusy
                    ? "AI Rating…"
                    : "AI Rate Effectiveness"}
                </button>
                <button
                  type="button"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                  onClick={() => {
                    setEffectivenessGroup(null);
                    setEffectivenessSuggestions({});
                  }}
                 title="Close" aria-label="Close">
                  ×
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="border border-slate-200 px-3 py-2.5 text-left">
                      Trainee
                    </th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center">
                      Current
                    </th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center">
                      Rate Effectiveness
                    </th>
                    <th className="border border-slate-200 px-3 py-2.5 text-left">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    groups.find(
                      (g) =>
                        g.training_request_id ===
                        effectivenessGroup.training_request_id,
                    )?.trainees ?? effectivenessGroup.trainees
                  ).map((row) => (
                    <EffectivenessRow
                      key={row.id}
                      row={row}
                      busy={
                        effectivenessBusyId === row.id || effectivenessAiBusy
                      }
                      suggestion={effectivenessSuggestions[row.id] ?? null}
                      onSave={(rating, notes) =>
                        void saveEffectiveness(row, rating, notes)
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {traineesGroup ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trainees-eval-title"
        >
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="trainees-eval-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Trainees
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-mono text-xs font-semibold text-indigo-700">
                    {traineesGroup.training_code}
                  </span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  {traineesGroup.programme_title}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => setTraineesGroup(null)}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="border border-slate-200 px-3 py-2.5 text-left">
                      Trainee
                    </th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center">
                      Send Question Paper Link
                    </th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center">
                      Answer Sheet Received
                    </th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center">
                      Evaluation
                    </th>
                    <th className="border border-slate-200 px-3 py-2.5 text-center">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    groups.find(
                      (g) =>
                        g.training_request_id ===
                        traineesGroup.training_request_id,
                    )?.trainees ?? traineesGroup.trainees
                  ).map((row) => {
                    const busy = busyId === row.id;
                    const received =
                      row.status === "submitted" || row.status === "evaluated";
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="border border-slate-200 px-3 py-2.5 !text-left">
                          <div className="font-medium text-slate-900">
                            {row.trainee_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {row.trainee_email || "—"}
                            {row.trainee_mobile
                              ? ` · ${row.trainee_mobile}`
                              : ""}
                          </div>
                          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {statusLabel(row.status)}
                          </div>
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          <button
                            type="button"
                            disabled={busy || row.status === "evaluated"}
                            onClick={() => void openSendLinkModal(row)}
                            className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                          >
                            {row.link_sent_at
                              ? busy
                                ? "Sending…"
                                : "Resend Link"
                              : busy
                                ? "Sending…"
                                : "Send Link"}
                          </button>
                          {row.link_sent_at ? (
                            <div className="mt-1 text-[10px] text-slate-500">
                              Sent{" "}
                              {new Date(row.link_sent_at).toLocaleString(
                                "en-IN",
                              )}
                            </div>
                          ) : null}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          {received ? (
                            <div>
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                                Received
                              </span>
                              {row.submitted_at ? (
                                <div className="mt-1 text-[10px] text-slate-500">
                                  {new Date(row.submitted_at).toLocaleString(
                                    "en-IN",
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          <div className="inline-flex flex-col items-center gap-1.5">
                            {row.status === "evaluated" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => openEvaluate(row)}
                                className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                                title="Reevaluate answers"
                              >
                                Reevaluate
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!received || busy}
                                onClick={() => openEvaluate(row)}
                                className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                              >
                                Evaluate
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-800">
                          {row.score != null
                            ? `${row.score}${
                                row.max_score != null
                                  ? ` / ${row.max_score}`
                                  : ""
                              }`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {sendLinkRow ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-question-link-title"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="send-question-link-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Send Question Paper Link
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {sendLinkRow.trainee_name} · {sendLinkRow.programme_title}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                disabled={busyId === sendLinkRow.id}
                onClick={() => {
                  setSendLinkRow(null);
                  setSendPapers([]);
                  setSendPaperId("");
                  setSendInstructions("");
                }}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            {loadingSendPapers ? (
              <p className="text-sm text-slate-500">Loading question papers…</p>
            ) : (
              <div className="grid gap-3">
                <label className="text-xs font-semibold text-slate-600">
                  Question Paper *
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                    value={sendPaperId}
                    onChange={(e) => setSendPaperId(e.target.value)}
                  >
                    <option value="">Select question paper</option>
                    {sendPapers.map((paper) => (
                      <option key={paper.id} value={paper.id}>
                        {paper.file_name}
                        {paper.created_at
                          ? ` · ${new Date(paper.created_at).toLocaleDateString(
                              "en-IN",
                            )}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {sendPapers.length === 0 ? (
                  <p className="text-xs text-amber-700">
                    No question paper found for this training. Generate one in
                    Training Questions Paper first.
                  </p>
                ) : null}
                <label className="text-xs font-semibold text-slate-600">
                  Instructions (optional)
                  <textarea
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                    placeholder="e.g. Attempt all MCQs. Clause answers must include clause number."
                    value={sendInstructions}
                    onChange={(e) => setSendInstructions(e.target.value)}
                  />
                </label>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                disabled={busyId === sendLinkRow.id}
                onClick={() => {
                  setSendLinkRow(null);
                  setSendPapers([]);
                  setSendPaperId("");
                  setSendInstructions("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={
                  busyId === sendLinkRow.id ||
                  loadingSendPapers ||
                  !sendPaperId
                }
                onClick={() => void confirmSendQuestionLink()}
              >
                {busyId === sendLinkRow.id ? "Sending…" : "Send Link"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {evaluateRow ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-white"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Evaluate — {evaluateRow.trainee_name}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {evaluateRow.programme_title}
                {evaluationTotals().max > 0
                  ? ` · Max ${evaluationTotals().max}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={aiEvaluating || busyId === evaluateRow.id}
                onClick={() => void runAiEvaluation()}
                className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
              >
                {aiEvaluating ? "AI Evaluating…" : "AI Evaluate"}
              </button>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => setEvaluateRow(null)}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="mx-auto w-full max-w-4xl space-y-4">
              {(evaluateRow.questions ?? []).map((q, idx) => {
                const ans = (evaluateRow.answers ?? []).find(
                  (a) => a.questionId === q.id,
                );
                const traineeAnswer =
                  ans?.selectedOption != null && q.options
                    ? q.options[ans.selectedOption]
                    : ans?.textAnswer?.trim() || null;
                const correctText =
                  q.type === "mcq" &&
                  q.correctOptionIndex != null &&
                  q.options?.[q.correctOptionIndex]
                    ? q.options[q.correctOptionIndex]
                    : null;
                return (
                  <div
                    key={q.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      Q{idx + 1}. {q.text}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        ({q.marks} marks · {q.type === "mcq" ? "MCQ" : "Text"})
                      </span>
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-slate-50 p-3 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Trainee answer
                        </p>
                        <p className="mt-1 text-slate-800">
                          {traineeAnswer || (
                            <span className="text-slate-400">No answer</span>
                          )}
                        </p>
                        {correctText ? (
                          <p className="mt-2 text-xs text-slate-500">
                            Answer key:{" "}
                            <span className="font-medium text-slate-700">
                              {correctText}
                            </span>
                          </p>
                        ) : null}
                      </div>
                      <div className="grid gap-2">
                        <label className="text-xs font-semibold text-slate-600">
                          Marks awarded (max {q.marks})
                          <input
                            type="number"
                            min={0}
                            max={q.marks}
                            step="0.5"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            value={questionMarks[q.id]?.awardedMarks ?? ""}
                            onChange={(e) =>
                              setQuestionMarks((prev) => ({
                                ...prev,
                                [q.id]: {
                                  awardedMarks: e.target.value,
                                  feedback: prev[q.id]?.feedback ?? "",
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Feedback
                          <textarea
                            rows={2}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            value={questionMarks[q.id]?.feedback ?? ""}
                            onChange={(e) =>
                              setQuestionMarks((prev) => ({
                                ...prev,
                                [q.id]: {
                                  awardedMarks:
                                    prev[q.id]?.awardedMarks ?? "",
                                  feedback: e.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}

              {(evaluateRow.questions ?? []).length === 0 ? (
                <EmptyState message="No questions on this evaluation." />
              ) : null}

              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                <h3 className="text-sm font-semibold text-indigo-950">
                  Total & result
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      Total marks
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {evaluationTotals().total}
                      <span className="text-sm font-normal text-slate-500">
                        {" "}
                        / {evaluationTotals().max}
                      </span>
                    </p>
                  </div>
                  <label className="text-xs font-semibold text-slate-600">
                    Result *
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={evalForm.passed}
                      onChange={(e) =>
                        setEvalForm((f) => ({ ...f, passed: e.target.value }))
                      }
                    >
                      <option value="true">Passed</option>
                      <option value="false">Failed</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600 sm:col-span-1">
                    Overall notes
                    <textarea
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={evalForm.notes}
                      onChange={(e) =>
                        setEvalForm((f) => ({ ...f, notes: e.target.value }))
                      }
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-4 sm:px-6">
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              onClick={() => setEvaluateRow(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busyId === evaluateRow.id || aiEvaluating}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => void saveEvaluation()}
            >
              {busyId === evaluateRow.id ? "Saving…" : "Save Evaluation"}
            </button>
          </div>
        </div>
      ) : null}

      {viewRow ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Answers — {viewRow.trainee_name}
                </h2>
                <p className="text-sm text-slate-500">{viewRow.programme_title}</p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => setViewRow(null)}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>
            <div className="space-y-3">
              {(viewRow.questions ?? []).map((q) => {
                const ans = (viewRow.answers ?? []).find(
                  (a) => a.questionId === q.id,
                );
                return (
                  <div
                    key={q.id}
                    className="rounded-lg border border-slate-200 p-3 text-sm"
                  >
                    <p className="font-semibold text-slate-900">
                      {q.text}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        ({q.marks} marks)
                      </span>
                    </p>
                    <p className="mt-2 text-slate-700">
                      {ans?.selectedOption != null && q.options
                        ? q.options[ans.selectedOption]
                        : ans?.textAnswer?.trim() || (
                            <span className="text-slate-400">No answer</span>
                          )}
                    </p>
                  </div>
                );
              })}
              {!viewRow.answers?.length ? (
                <EmptyState message="No answers submitted yet." />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TraineeEvaluationsPage() {
  const { profile } = useAuth();
  const readOnly = useWorkspaceReadOnly();
  type EvalNotice = {
    id: string;
    title: string;
    body: string;
    link: string | null;
    duplicateIds: string[];
  };
  type TraineeEvalRow = TraineeEvaluation & {
    programme_title: string;
    notification: EvalNotice | null;
  };
  const [rows, setRows] = useState<TraineeEvalRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewNotice, setViewNotice] = useState<EvalNotice | null>(null);
  const [active, setActive] = useState<TraineeEvalRow | null>(null);
  const [answers, setAnswers] = useState<
    Record<string, { selectedOption?: number; textAnswer?: string }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  async function load() {
    if (!profile) return;
    const [{ data, error: loadErr }, { data: notices }] = await Promise.all([
      supabase
        .from("trainee_evaluations")
        .select("*")
        .eq("user_id", profile.id)
        .in("status", ["link_sent", "in_progress", "submitted", "evaluated"])
        .order("updated_at", { ascending: false }),
      supabase
        .from("app_notifications")
        .select("id, title, body, link, metadata")
        .eq("user_id", profile.id)
        .eq("kind", "evaluation_invite")
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    if (loadErr) {
      setError(loadErr.message);
      setRows([]);
      setSelectedIds([]);
      return;
    }
    const noticeList =
      ((notices ?? []) as Array<{
        id: string;
        title: string;
        body: string;
        link: string | null;
        metadata: Record<string, unknown> | null;
      }>) ?? [];
    const list = (data ?? []) as TraineeEvaluation[];
    const programmeIds = [
      ...new Set(
        list.map((e) => e.programme_id).filter((id): id is string => Boolean(id)),
      ),
    ];
    const { data: progs } = programmeIds.length
      ? await supabase
          .from("training_programmes")
          .select("id, title")
          .in("id", programmeIds)
      : { data: [] as Array<{ id: string; title: string }> };
    const titleById = new Map(
      ((progs ?? []) as Array<{ id: string; title: string }>).map((p) => [
        p.id,
        p.title,
      ]),
    );

    const noticesByEvalId = new Map<string, typeof noticeList>();
    const noticesByProgramme = new Map<string, typeof noticeList>();
    for (const n of noticeList) {
      const evalId =
        typeof n.metadata?.evaluation_id === "string"
          ? n.metadata.evaluation_id
          : null;
      if (evalId) {
        const bucket = noticesByEvalId.get(evalId) ?? [];
        bucket.push(n);
        noticesByEvalId.set(evalId, bucket);
        continue;
      }
      const titleKey = n.title.replace(/^Question paper:\s*/i, "").trim();
      if (titleKey) {
        const bucket = noticesByProgramme.get(titleKey) ?? [];
        bucket.push(n);
        noticesByProgramme.set(titleKey, bucket);
      }
    }

    const usedNoticeIds = new Set<string>();
    const next: TraineeEvalRow[] = list.map((e) => {
      const programme_title =
        (e.programme_id && titleById.get(e.programme_id)) || "Programme";
      const matched = (
        noticesByEvalId.get(e.id) ??
        noticesByProgramme.get(programme_title) ??
        []
      ).filter((n) => !usedNoticeIds.has(n.id));
      for (const n of matched) usedNoticeIds.add(n.id);
      const primary = matched[0] ?? null;
      return {
        ...e,
        programme_title,
        notification: primary
          ? {
              id: primary.id,
              title: primary.title,
              body: primary.body,
              link: primary.link,
              duplicateIds: matched.map((n) => n.id),
            }
          : null,
      };
    });

    setRows(next);
    setSelectedIds((prev) =>
      prev.filter((id) => next.some((r) => r.id === id)),
    );
  }

  useEffect(() => {
    void load();
  }, [profile?.id]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (rows.length > 0 && selectedIds.length === rows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((r) => r.id));
    }
  }

  async function dismissNotice(notice: EvalNotice) {
    const ids = notice.duplicateIds.length
      ? notice.duplicateIds
      : [notice.id];
    await supabase
      .from("app_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    setRows((prev) =>
      prev.map((r) =>
        r.notification?.duplicateIds.some((id) => ids.includes(id))
          ? { ...r, notification: null }
          : r,
      ),
    );
    setViewNotice(null);
  }

  function openAttempt(row: TraineeEvalRow) {
    if (readOnly) return;
    if (row.status === "submitted" || row.status === "evaluated") {
      setActive(row);
      const map: Record<string, { selectedOption?: number; textAnswer?: string }> =
        {};
      for (const a of row.answers ?? []) {
        map[a.questionId] = {
          selectedOption: a.selectedOption,
          textAnswer: a.textAnswer,
        };
      }
      setAnswers(map);
      return;
    }
    setActive(row);
    const map: Record<string, { selectedOption?: number; textAnswer?: string }> =
      {};
    for (const a of row.answers ?? []) {
      map[a.questionId] = {
        selectedOption: a.selectedOption,
        textAnswer: a.textAnswer,
      };
    }
    setAnswers(map);
    if (row.status === "link_sent") {
      void supabase
        .from("trainee_evaluations")
        .update({
          status: "in_progress",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .then(() => void load());
    }
  }

  async function saveAnswerSheet() {
    if (readOnly || !active || !profile) return;
    setError(null);
    setMessage(null);
    const payload = (active.questions ?? []).map((q) => ({
      questionId: q.id,
      selectedOption: answers[q.id]?.selectedOption,
      textAnswer: answers[q.id]?.textAnswer,
    }));
    setSaving(true);
    const { error: updErr } = await supabase
      .from("trainee_evaluations")
      .update({
        answers: payload,
        status:
          active.status === "submitted" || active.status === "evaluated"
            ? active.status
            : "in_progress",
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.id)
      .eq("user_id", profile.id);
    setSaving(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setMessage("Answer sheet saved.");
    setActive((prev) =>
      prev
        ? {
            ...prev,
            answers: payload,
            status:
              prev.status === "submitted" || prev.status === "evaluated"
                ? prev.status
                : "in_progress",
          }
        : prev,
    );
    await load();
  }

  async function submitEvaluation(row: TraineeEvalRow) {
    if (readOnly || !profile) return;
    if (row.status === "submitted" || row.status === "evaluated") return;
    setError(null);
    setMessage(null);

    const answerList = row.answers ?? [];
    const answerMap = new Map(answerList.map((a) => [a.questionId, a]));
    const questions = row.questions ?? [];
    if (questions.length === 0) {
      setError("Open the question paper and save answers before submitting.");
      return;
    }
    for (const q of questions) {
      const a = answerMap.get(q.id);
      if (q.type === "mcq") {
        if (a?.selectedOption == null) {
          setError(
            "Please open the question paper, complete all answers, and Save Answer Sheet before submitting.",
          );
          return;
        }
      } else if (!a?.textAnswer?.trim()) {
        setError(
          "Please open the question paper, complete all answers, and Save Answer Sheet before submitting.",
        );
        return;
      }
    }

    setSubmittingId(row.id);
    const { error: updErr } = await supabase
      .from("trainee_evaluations")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("user_id", profile.id);
    setSubmittingId(null);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setMessage("Answer sheet submitted successfully.");
    await load();
  }

  const locked = useMemo(
    () =>
      active?.status === "submitted" ||
      active?.status === "evaluated" ||
      readOnly,
    [active?.status, readOnly],
  );

  return (
    <div>
      <PageHeader
        title={
          isOrgLearnerRole(profile?.role)
            ? "Training Evaluation"
            : "My Evaluations"
        }
      />
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-emerald-700">{message}</p> : null}

      {rows.length === 0 ? (
        <EmptyState message="No evaluation invitations yet." />
      ) : (
        <Panel className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-12 border border-slate-200 px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={
                        rows.length > 0 && selectedIds.length === rows.length
                      }
                      onChange={toggleSelectAll}
                      aria-label="Select all evaluations"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Training Programme
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Question Paper
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Status
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Score
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Notification
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        aria-label={`Select ${row.programme_title}`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium text-slate-900">
                      {row.programme_title}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => openAttempt(row)}
                        disabled={readOnly}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                      >
                        {row.status === "submitted" ||
                        row.status === "evaluated"
                          ? "View"
                          : "Open Question Paper"}
                      </button>
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      {row.status === "submitted" ||
                      row.status === "evaluated" ? (
                        <span className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          Submitted
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={readOnly || submittingId === row.id}
                          onClick={() => void submitEvaluation(row)}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {submittingId === row.id ? "Submitting…" : "Submit"}
                        </button>
                      )}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {row.score != null
                        ? `${row.score}${row.max_score != null ? ` / ${row.max_score}` : ""}`
                        : "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      {row.notification ? (
                        <button
                          type="button"
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                          onClick={() => setViewNotice(row.notification)}
                        >
                          View Notification
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {viewNotice ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">
                {viewNotice.title}
              </h2>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => setViewNotice(null)}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>
            <p className="whitespace-pre-line text-sm text-slate-700">
              {viewNotice.body}
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void dismissNotice(viewNotice)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {active ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-white"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {active.programme_title}
                </h2>
                <p className="text-sm text-slate-500">
                  Online answer sheet · {active.questions?.length ?? 0} questions
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => setActive(null)}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              <div className="mx-auto w-full max-w-4xl space-y-4">
                {(active.questions ?? []).map((q, idx) => (
                  <div
                    key={q.id}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      Q{idx + 1}. {q.text}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        ({q.marks} marks)
                      </span>
                    </p>
                    {q.type === "mcq" && q.options?.length ? (
                      <div className="mt-2 space-y-1.5">
                        {q.options.map((opt, oi) => (
                          <label
                            key={oi}
                            className="flex items-start gap-2 text-sm text-slate-700"
                          >
                            <input
                              type="radio"
                              name={q.id}
                              disabled={locked}
                              checked={answers[q.id]?.selectedOption === oi}
                              onChange={() =>
                                setAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: { selectedOption: oi },
                                }))
                              }
                              className="mt-1"
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        rows={3}
                        disabled={locked}
                        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                        value={answers[q.id]?.textAnswer ?? ""}
                        onChange={(e) =>
                          setAnswers((prev) => ({
                            ...prev,
                            [q.id]: { textAnswer: e.target.value },
                          }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {!locked ? (
              <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-4 sm:px-6">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setActive(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveAnswerSheet()}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Answer Sheet"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
