import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  EmptyState,
  PageHeader,
  Panel,
} from "@/components/dashboard-shell";
import { PresentationAiPreview } from "@/components/PresentationAiPreview";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import type {
  Invoice,
  InvoiceStatus,
  Organization,
  Profile,
  ProgrammeStatus,
  ProgrammeTrainingAsset,
  ProgrammeTrainingAssetCategory,
  ProgrammeTrainingAssetSourceType,
  SessionStatus,
  TrainingProgramme,
  TrainingRequest,
  TrainingSession,
} from "@/lib/supabase/types";

function inr(cents: number) {
  return `₹${(cents / 100).toLocaleString("en-IN")}`;
}

function HtmlPreviewFrame({
  url,
  title,
}: {
  url: string;
  title: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to load preview (${res.status})`);
        }
        const text = await res.text();
        if (!cancelled) setHtml(text);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load HTML preview.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-slate-600">{error}</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Open externally
        </a>
      </div>
    );
  }

  if (html == null) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-slate-500">
        Loading preview…
      </div>
    );
  }

  return (
    <iframe
      title={title}
      srcDoc={html}
      sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"
      allow="fullscreen"
      className="h-full min-h-[280px] w-full rounded-lg border border-slate-200 bg-white"
    />
  );
}

function TextPreviewFrame({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to load preview (${res.status})`);
        }
        const body = await res.text();
        if (!cancelled) setText(body);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load text preview.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center p-6 text-sm text-slate-600">
        {error}
      </div>
    );
  }
  if (text == null) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-slate-500">
        Loading preview…
      </div>
    );
  }
  return (
    <pre className="h-full min-h-[280px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
      {text}
    </pre>
  );
}

export function QiProgrammesPage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const matterIdFromUrl = searchParams.get("matter");
  const matterTabFromUrl = searchParams.get("matterTab");
  const [rows, setRows] = useState<TrainingProgramme[]>([]);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const emptyForm = {
    title: "",
    description: "",
    category: "",
    duration_hours: "8",
    price: "15000",
    delivery_mode: "onsite",
    status: "published" as ProgrammeStatus,
  };
  const [form, setForm] = useState(emptyForm);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingProgrammeId, setEditingProgrammeId] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [matterProgramme, setMatterProgramme] =
    useState<TrainingProgramme | null>(null);
  const [matterAssets, setMatterAssets] = useState<ProgrammeTrainingAsset[]>(
    [],
  );
  const [selectedMatterAssetIds, setSelectedMatterAssetIds] = useState<
    string[]
  >([]);
  const [previewAsset, setPreviewAsset] =
    useState<ProgrammeTrainingAsset | null>(null);
  const [uploadingMatterFile, setUploadingMatterFile] = useState(false);
  const [showAddSources, setShowAddSources] = useState(false);
  const [sourceMode, setSourceMode] = useState<
    "menu" | "file" | "website" | "youtube" | "text"
  >("menu");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [savingSource, setSavingSource] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [generatingAiAsset, setGeneratingAiAsset] = useState(false);
  const emptyAiForm = {
    sessionTime: "2 hours",
    language: "English",
    pages: "10-12",
    style: "Professional",
    audience: "Intermediate",
    examDuration: "60 minutes",
    totalMarks: "50",
    questionCount: "15-20",
    difficulty: "Mixed",
    paperType: "Mix",
    answerFormat: "Mix",
    questionPaperAssetId: "",
    notes: "",
  };
  const [aiForm, setAiForm] = useState(emptyAiForm);
  const [aiSelectedSourceIds, setAiSelectedSourceIds] = useState<string[]>([]);
  const [showAiFilePicker, setShowAiFilePicker] = useState(false);

  const matterTabs: Array<{
    id: ProgrammeTrainingAssetCategory;
    label: string;
  }> = [
    { id: "matter_files", label: "Training Matter Files" },
    { id: "presentation", label: "Training Presentation" },
    { id: "question_paper", label: "Training Questions Paper" },
    { id: "answer_sheet", label: "Training Answer Sheet" },
  ];

  const validMatterTabs = matterTabs.map((t) => t.id);
  const matterTab: ProgrammeTrainingAssetCategory =
    matterTabFromUrl &&
    validMatterTabs.includes(matterTabFromUrl as ProgrammeTrainingAssetCategory)
      ? (matterTabFromUrl as ProgrammeTrainingAssetCategory)
      : "matter_files";

  const aiEnabledTabs: ProgrammeTrainingAssetCategory[] = [
    "presentation",
    "question_paper",
    "answer_sheet",
  ];
  const showAiForTab = aiEnabledTabs.includes(matterTab);

  function setMatterTab(tab: ProgrammeTrainingAssetCategory) {
    const next = new URLSearchParams(searchParams);
    if (matterIdFromUrl) {
      next.set("matter", matterIdFromUrl);
      next.set("matterTab", tab);
      setSearchParams(next, { replace: true });
    }
    setSelectedMatterAssetIds([]);
    setPreviewAsset(null);
    setShowAiAssistant(false);
    setShowAddSources(false);
    setSourceMode("menu");
  }

  async function load() {
    const [progRes, orgRes] = await Promise.all([
      supabase
        .from("training_programmes")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("organizations").select("id, name").eq("type", "tenant"),
    ]);
    const programmes = (progRes.data ?? []) as TrainingProgramme[];
    setRows(programmes);
    setSelectedIds((prev) =>
      prev.filter((id) => programmes.some((p) => p.id === id)),
    );
    const map: Record<string, string> = {};
    for (const o of (orgRes.data ?? []) as Array<{ id: string; name: string }>) {
      map[o.id] = o.name;
    }
    setOrgNames(map);

    const userIds = [
      ...new Set(
        programmes
          .map((p) => p.submitted_by_user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (userIds.length) {
      const { data: people } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      const users: Record<string, string> = {};
      for (const p of (people ?? []) as Array<{
        id: string;
        full_name: string;
        email: string | null;
      }>) {
        users[p.id] = p.full_name || p.email || "Learner";
      }
      setUserNames(users);
    } else {
      setUserNames({});
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!matterIdFromUrl) {
      setMatterProgramme(null);
      setMatterAssets([]);
      return;
    }

    const fromRows = rows.find((p) => p.id === matterIdFromUrl);
    if (fromRows) {
      setMatterProgramme(fromRows);
      void loadMatterAssets(fromRows.id);
      return;
    }

    let cancelled = false;
    void supabase
      .from("training_programmes")
      .select("*")
      .eq("id", matterIdFromUrl)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setMatterProgramme(data as TrainingProgramme);
          void loadMatterAssets((data as TrainingProgramme).id);
        } else {
          setMatterProgramme(null);
          const next = new URLSearchParams(searchParams);
          next.delete("matter");
          next.delete("matterTab");
          setSearchParams(next, { replace: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [matterIdFromUrl, rows]);

  async function saveProgramme() {
    setError(null);
    setMessage(null);
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category || null,
      duration_hours: Number(form.duration_hours) || null,
      price_cents: Math.round(Number(form.price || "0") * 100),
      delivery_mode: form.delivery_mode,
      status: form.status,
    };
    const { error: err } = editingProgrammeId
      ? await supabase
          .from("training_programmes")
          .update(payload)
          .eq("id", editingProgrammeId)
      : await supabase.from("training_programmes").insert({
          ...payload,
          created_by: profile?.id ?? null,
        });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    const wasEditing = Boolean(editingProgrammeId);
    setForm(emptyForm);
    setEditingProgrammeId(null);
    setShowFormModal(false);
    setMessage(wasEditing ? "Programme updated." : "Programme created.");
    await load();
  }

  function openCreateProgramme() {
    setError(null);
    setEditingProgrammeId(null);
    setForm(emptyForm);
    setShowFormModal(true);
  }

  function openEditProgramme(p: TrainingProgramme) {
    setError(null);
    setEditingProgrammeId(p.id);
    setForm({
      title: p.title,
      description: p.description || "",
      category: p.category || "",
      duration_hours: String(p.duration_hours ?? "8"),
      price: String((p.price_cents ?? 0) / 100),
      delivery_mode: p.delivery_mode || "onsite",
      status: p.status,
    });
    setShowFormModal(true);
  }

  async function deleteProgramme(p: TrainingProgramme) {
    setError(null);
    setMessage(null);
    const ok = window.confirm(
      `Delete programme "${p.title}"? This cannot be undone.`,
    );
    if (!ok) return;
    const { error: err } = await supabase
      .from("training_programmes")
      .delete()
      .eq("id", p.id);
    if (err) {
      setError(err.message);
      return;
    }
    setSelectedIds((prev) => prev.filter((id) => id !== p.id));
    setMessage("Programme deleted.");
    await load();
  }

  async function setStatus(id: string, status: ProgrammeStatus) {
    setError(null);
    setMessage(null);
    const { error: err } = await supabase
      .from("training_programmes")
      .update({ status })
      .eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage(
      status === "published"
        ? "Programme published."
        : status === "archived"
          ? "Programme archived."
          : status === "draft"
            ? "Programme marked as draft."
            : `Programme marked as ${status}.`,
    );
    await load();
  }

  const pendingSubmissions = rows.filter(
    (p) =>
      p.status === "draft" &&
      (p.submitted_by_org_id || p.submitted_by_user_id),
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (selectedIds.length === rows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((p) => p.id));
    }
  }

  async function loadMatterAssets(programmeId: string) {
    const { data } = await supabase
      .from("programme_training_assets")
      .select("*")
      .eq("programme_id", programmeId)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as ProgrammeTrainingAsset[];
    setMatterAssets(list);
    setSelectedMatterAssetIds((prev) =>
      prev.filter((id) => list.some((a) => a.id === id)),
    );
  }

  function openTrainingMatter(p: TrainingProgramme) {
    setError(null);
    setPreviewAsset(null);
    setSelectedMatterAssetIds([]);
    const next = new URLSearchParams(searchParams);
    next.set("matter", p.id);
    next.set("matterTab", "matter_files");
    setSearchParams(next);
  }

  function closeTrainingMatter() {
    const next = new URLSearchParams(searchParams);
    next.delete("matter");
    next.delete("matterTab");
    setSearchParams(next);
    setMatterProgramme(null);
    setMatterAssets([]);
    setSelectedMatterAssetIds([]);
    setPreviewAsset(null);
    setShowAiAssistant(false);
    setShowAiFilePicker(false);
    setAiForm(emptyAiForm);
    setAiSelectedSourceIds([]);
    setShowAddSources(false);
    setSourceMode("menu");
    setSourceTitle("");
    setSourceUrl("");
    setSourceText("");
  }

  function openAddSources() {
    setError(null);
    setSourceMode("menu");
    setSourceTitle("");
    setSourceUrl("");
    setSourceText("");
    setShowAddSources(true);
  }

  function openAiAssistant() {
    setError(null);
    const questionPapers = matterAssets.filter(
      (a) => a.category === "question_paper",
    );
    setAiForm({
      ...emptyAiForm,
      questionPaperAssetId: questionPapers[0]?.id ?? "",
    });
    setShowAiFilePicker(false);
    const matterIds = matterAssets
      .filter((a) => a.category === "matter_files")
      .map((a) => a.id);
    setAiSelectedSourceIds(matterIds);
    setShowAiAssistant(true);
  }

  function toggleAiSourceSelect(id: string) {
    setAiSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAllAiSources(ids: string[]) {
    const allSelected =
      ids.length > 0 && ids.every((id) => aiSelectedSourceIds.includes(id));
    setAiSelectedSourceIds(allSelected ? [] : ids);
  }

  function buildAiExtraInstructions() {
    if (matterTab === "presentation") {
      return [
        `Session time: ${aiForm.sessionTime}`,
        `Presentation language: ${aiForm.language}`,
        `Number of presentation pages/slides: ${aiForm.pages}`,
        `Presentation style: ${aiForm.style}`,
        `Audience level: ${aiForm.audience}`,
        aiForm.notes.trim()
          ? `Additional notes: ${aiForm.notes.trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (matterTab === "answer_sheet") {
      const selectedPaper = matterAssets.find(
        (a) =>
          a.category === "question_paper" &&
          a.id === aiForm.questionPaperAssetId,
      );
      return [
        `Answer sheet language: ${aiForm.language}`,
        `Total marks: ${aiForm.totalMarks}`,
        `Number of questions/answers: ${aiForm.questionCount}`,
        `Difficulty level: ${aiForm.difficulty}`,
        selectedPaper
          ? `Selected question paper: ${selectedPaper.file_name} (id: ${selectedPaper.id})`
          : "No question paper selected — generate a matching answer key from training matter.",
        `Exam duration reference: ${aiForm.examDuration}`,
        "Include model answers and marking points for each question.",
        "If a question paper is provided, align answers exactly to that paper in order.",
        aiForm.notes.trim() ? `Additional notes: ${aiForm.notes.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    return [
      `Exam duration: ${aiForm.examDuration}`,
      `Question paper language: ${aiForm.language}`,
      `Total marks: ${aiForm.totalMarks}`,
      `Number of questions: ${aiForm.questionCount}`,
      `Difficulty level: ${aiForm.difficulty}`,
      `Type of question paper: ${aiForm.paperType}`,
      paperTypeInstruction(aiForm.paperType),
      `Answer format on sheet: ${aiForm.answerFormat}`,
      answerFormatInstruction(aiForm.answerFormat),
      aiForm.notes.trim() ? `Additional notes: ${aiForm.notes.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function paperTypeInstruction(paperType: string) {
    switch (paperType) {
      case "Clause Find":
        return "Question style: Clause Find — ask trainees to identify, locate, or quote the correct clause/sub-clause from the standard or training matter. Prefer short answers with clause numbers.";
      case "MCQ":
        return "Question style: MCQ only — every question must be multiple choice with exactly 4 options and one correct answer.";
      case "Descriptive":
        return "Question style: Descriptive — short and long answer questions only (no MCQ). Focus on explanation, application, and procedure.";
      case "Mix":
      default:
        return "Question style: Mix — include a balanced mix of MCQ, clause-find, short answer, and descriptive questions.";
    }
  }

  function answerFormatInstruction(answerFormat: string) {
    switch (answerFormat) {
      case "Checkbox":
        return "Answer area: use type \"mcq\" with 4 options for every question so the sheet shows checkboxes to tick answers.";
      case "Clause":
        return "Answer area: use type \"clause\" for every question so the sheet shows a clause-number write-in box (e.g. Clause No. ______).";
      case "Written":
        return "Answer area: use type \"written\" (or short/long) for every question so the sheet shows lined space to write the answer.";
      case "Mix":
      default:
        return "Answer area: Mix — for MCQ use type \"mcq\" (checkboxes), for clause-find use type \"clause\" (clause write-in), for descriptive use type \"written\" (answer writing space).";
    }
  }

  async function generateAiAsset() {
    if (!matterProgramme) return;
    if (
      matterTab !== "presentation" &&
      matterTab !== "question_paper" &&
      matterTab !== "answer_sheet"
    ) {
      return;
    }

    if (matterTab === "answer_sheet") {
      const papers = matterAssets.filter((a) => a.category === "question_paper");
      if (papers.length > 0 && !aiForm.questionPaperAssetId) {
        setError("Select a question paper from this training first.");
        return;
      }
    }

    const fnName =
      matterTab === "presentation"
        ? "generate-presentation"
        : matterTab === "answer_sheet"
          ? "generate-answer-sheet"
          : "generate-question-paper";

    setGeneratingAiAsset(true);
    setError(null);
    setMessage(null);
    const matterFileIds =
      aiSelectedSourceIds.length > 0
        ? aiSelectedSourceIds
        : matterAssets
            .filter((a) => a.category === "matter_files")
            .map((a) => a.id);
    const { data, error: fnError } = await supabase.functions.invoke<{
      ok?: boolean;
      error?: string;
      asset?: ProgrammeTrainingAsset;
      slideCount?: number;
      questionCount?: number;
      answerCount?: number;
      totalMarks?: number;
    }>(fnName, {
      body: {
        programmeId: matterProgramme.id,
        extraInstructions: buildAiExtraInstructions(),
        matterAssetIds: matterFileIds,
        ...(matterTab === "answer_sheet" && aiForm.questionPaperAssetId
          ? { questionPaperAssetId: aiForm.questionPaperAssetId }
          : {}),
      },
    });
    setGeneratingAiAsset(false);
    if (fnError) {
      let detail = fnError.message;
      try {
        const ctx = (fnError as { context?: Response }).context;
        if (ctx) {
          const body = (await ctx.json()) as { error?: string };
          if (body?.error) detail = body.error;
        }
      } catch {
        // keep generic message
      }
      setError(detail);
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }
    if (matterTab === "presentation") {
      setMessage(
        data?.slideCount
          ? `AI presentation created (${data.slideCount} slides). Open in App to present or download.`
          : "AI presentation created.",
      );
    } else if (matterTab === "answer_sheet") {
      setMessage(
        data?.answerCount
          ? `AI answer sheet created (${data.answerCount} answers${
              data.totalMarks != null ? `, ${data.totalMarks} marks` : ""
            }). Open in App or download.`
          : "AI answer sheet created.",
      );
    } else {
      setMessage(
        data?.questionCount
          ? `AI question paper created (${data.questionCount} questions${
              data.totalMarks != null ? `, ${data.totalMarks} marks` : ""
            }). Open in App or download.`
          : "AI question paper created.",
      );
    }
    await loadMatterAssets(matterProgramme.id);
    if (data?.asset) {
      setShowAiAssistant(false);
      setShowAiFilePicker(false);
      setAiForm(emptyAiForm);
      setAiSelectedSourceIds([]);
      setSelectedMatterAssetIds([]);
      setPreviewAsset(data.asset);
    }
  }

  async function uploadMatterFile(file: File) {
    if (!matterProgramme || !profile?.id) return;
    setUploadingMatterFile(true);
    setError(null);
    const safeName = file.name.replace(/[^\w.\-()+ ]+/g, "_");
    const path = `${matterProgramme.id}/${matterTab}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("training-assets")
      .upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (uploadError) {
      setUploadingMatterFile(false);
      setError(uploadError.message);
      return;
    }
    const { data: pub } = supabase.storage
      .from("training-assets")
      .getPublicUrl(path);
    const { error: insertError } = await supabase
      .from("programme_training_assets")
      .insert({
        programme_id: matterProgramme.id,
        category: matterTab,
        source_type: "file",
        file_name: file.name,
        file_url: pub.publicUrl,
        storage_path: path,
        file_size: file.size,
        mime_type: file.type || null,
        uploaded_by: profile.id,
      });
    setUploadingMatterFile(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setShowAddSources(false);
    setSourceMode("menu");
    await loadMatterAssets(matterProgramme.id);
  }

  async function saveLinkSource(kind: "website" | "youtube") {
    if (!matterProgramme || !profile?.id) return;
    const url = sourceUrl.trim();
    if (!url) {
      setError("Please enter a valid URL.");
      return;
    }
    try {
      // Validate URL format
      new URL(url);
    } catch {
      setError("Please enter a valid URL (include https://).");
      return;
    }
    if (kind === "youtube" && !getYoutubeVideoId(url)) {
      setError("Please enter a valid YouTube video URL.");
      return;
    }
    setSavingSource(true);
    setError(null);
    const title =
      sourceTitle.trim() ||
      (kind === "youtube" ? "YouTube video" : "Website link");
    const path = `external/${kind}/${matterProgramme.id}/${Date.now()}`;
    const { error: insertError } = await supabase
      .from("programme_training_assets")
      .insert({
        programme_id: matterProgramme.id,
        category: matterTab,
        source_type: kind,
        file_name: title,
        file_url: url,
        storage_path: path,
        file_size: null,
        mime_type: kind === "youtube" ? "video/youtube" : "text/uri-list",
        uploaded_by: profile.id,
      });
    setSavingSource(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setShowAddSources(false);
    setSourceMode("menu");
    setSourceTitle("");
    setSourceUrl("");
    await loadMatterAssets(matterProgramme.id);
  }

  async function saveTextSource() {
    if (!matterProgramme || !profile?.id) return;
    const text = sourceText.trim();
    if (!text) {
      setError("Please enter some text.");
      return;
    }
    setSavingSource(true);
    setError(null);
    const title = sourceTitle.trim() || "Text note";
    const safeTitle = title.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 60);
    const path = `${matterProgramme.id}/${matterTab}/${Date.now()}-${safeTitle}.txt`;
    const bytes = new Blob([text], { type: "text/plain;charset=utf-8" });
    const { error: uploadError } = await supabase.storage
      .from("training-assets")
      .upload(path, bytes, {
        upsert: false,
        contentType: "text/plain;charset=utf-8",
      });
    if (uploadError) {
      setSavingSource(false);
      setError(uploadError.message);
      return;
    }
    const { data: pub } = supabase.storage
      .from("training-assets")
      .getPublicUrl(path);
    const { error: insertError } = await supabase
      .from("programme_training_assets")
      .insert({
        programme_id: matterProgramme.id,
        category: matterTab,
        source_type: "text",
        file_name: `${title}.txt`,
        file_url: pub.publicUrl,
        storage_path: path,
        file_size: bytes.size,
        mime_type: "text/plain",
        uploaded_by: profile.id,
      });
    setSavingSource(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setShowAddSources(false);
    setSourceMode("menu");
    setSourceTitle("");
    setSourceText("");
    await loadMatterAssets(matterProgramme.id);
  }

  async function deleteMatterAsset(asset: ProgrammeTrainingAsset) {
    setError(null);
    const ok = window.confirm(`Delete "${asset.file_name}"?`);
    if (!ok) return;
    if (
      asset.storage_path &&
      !asset.storage_path.startsWith("external/")
    ) {
      await supabase.storage
        .from("training-assets")
        .remove([asset.storage_path]);
    }
    const { error: delError } = await supabase
      .from("programme_training_assets")
      .delete()
      .eq("id", asset.id);
    if (delError) {
      setError(delError.message);
      return;
    }
    if (previewAsset?.id === asset.id) setPreviewAsset(null);
    await loadMatterAssets(asset.programme_id);
  }

  function getAssetSourceType(
    asset: ProgrammeTrainingAsset,
  ): ProgrammeTrainingAssetSourceType {
    if (asset.source_type) {
      // AI HTML decks are stored as source_type=file with mime text/html
      if (asset.source_type === "text" && isHtmlAsset(asset)) return "file";
      return asset.source_type;
    }
    const mime = (asset.mime_type || "").toLowerCase();
    if (mime.includes("youtube")) return "youtube";
    if (mime === "text/uri-list") return "website";
    if (isHtmlAsset(asset)) return "file";
    if (
      mime.startsWith("text/") ||
      asset.file_name.toLowerCase().endsWith(".txt")
    ) {
      return "text";
    }
    return "file";
  }

  function getYoutubeVideoId(url: string) {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        return u.pathname.replace("/", "") || null;
      }
      if (u.hostname.includes("youtube.com")) {
        return u.searchParams.get("v") || null;
      }
    } catch {
      return null;
    }
    return null;
  }

  function sourceTypeLabel(type: ProgrammeTrainingAssetSourceType) {
    if (type === "website") return "Website";
    if (type === "youtube") return "YouTube";
    if (type === "text") return "Text";
    return "File";
  }

  function sourceTypeEmoji(type: ProgrammeTrainingAssetSourceType) {
    if (type === "website") return "🌐";
    if (type === "youtube") return "▶️";
    if (type === "text") return "📝";
    return "📄";
  }

  function toggleMatterAssetSelect(id: string) {
    setSelectedMatterAssetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAllMatterAssets() {
    const activeIds = activeMatterAssets.map((a) => a.id);
    const allSelected =
      activeIds.length > 0 &&
      activeIds.every((id) => selectedMatterAssetIds.includes(id));
    if (allSelected) {
      setSelectedMatterAssetIds((prev) =>
        prev.filter((id) => !activeIds.includes(id)),
      );
    } else {
      setSelectedMatterAssetIds((prev) => [
        ...new Set([...prev, ...activeIds]),
      ]);
    }
  }

  function canPreviewInApp(asset: ProgrammeTrainingAsset) {
    const type = getAssetSourceType(asset);
    if (type === "website" || type === "youtube" || type === "text") return true;
    const mime = (asset.mime_type || "").toLowerCase();
    const name = asset.file_name.toLowerCase();
    return (
      mime.includes("pdf") ||
      mime.includes("html") ||
      mime.startsWith("image/") ||
      mime.startsWith("text/") ||
      name.endsWith(".pdf") ||
      name.endsWith(".html") ||
      name.endsWith(".htm") ||
      name.endsWith(".txt") ||
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".webp") ||
      name.endsWith(".gif")
    );
  }

  function isHtmlAsset(asset: ProgrammeTrainingAsset) {
    const mime = (asset.mime_type || "").toLowerCase();
    const name = asset.file_name.toLowerCase();
    return mime.includes("html") || name.endsWith(".html") || name.endsWith(".htm");
  }

  function isImageAsset(asset: ProgrammeTrainingAsset) {
    const mime = (asset.mime_type || "").toLowerCase();
    const name = asset.file_name.toLowerCase();
    return (
      mime.startsWith("image/") ||
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".webp") ||
      name.endsWith(".gif")
    );
  }

  function isTextAsset(asset: ProgrammeTrainingAsset) {
    const type = getAssetSourceType(asset);
    if (type === "text") return true;
    const mime = (asset.mime_type || "").toLowerCase();
    const name = asset.file_name.toLowerCase();
    return mime.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md");
  }

  const activeMatterAssets = matterAssets.filter((a) => a.category === matterTab);
  const activeMatterLabel =
    matterTabs.find((t) => t.id === matterTab)?.label ?? "Training Matter";
  const selectedActiveMatterCount = selectedMatterAssetIds.filter((id) =>
    activeMatterAssets.some((a) => a.id === id),
  ).length;

  return (
    <div>
      <PageHeader
        title="Training Programmes"
        actions={
          <button
            type="button"
            onClick={openCreateProgramme}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Add Programme
          </button>
        }
      />
      {error && !showFormModal && !matterProgramme ? (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      ) : null}
      {message ? <p className="mb-3 text-sm text-emerald-700">{message}</p> : null}

      {matterProgramme ? (
        <div
          className="fixed inset-0 z-50 flex h-dvh w-screen flex-col bg-white"
          role="dialog"
          aria-modal="true"
          aria-labelledby="training-matter-title"
        >
          <div className="relative flex shrink-0 flex-wrap items-center justify-between gap-3 overflow-hidden border-b border-indigo-200/60 bg-gradient-to-r from-cyan-600 via-indigo-600 to-violet-600 px-4 py-5 sm:px-6 lg:px-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 15% 20%, rgba(255,255,255,.35), transparent 35%), radial-gradient(circle at 85% 10%, rgba(34,211,238,.45), transparent 40%)",
              }}
            />
            <div className="relative">
              <h2
                id="training-matter-title"
                className="text-xl font-semibold text-white sm:text-2xl"
              >
                Training Matter
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-indigo-100">
                {matterProgramme.title}
              </p>
            </div>
            <div className="relative flex flex-wrap items-center gap-2">
              <button
                type="button"
                title="Close"
                aria-label="Close"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/30 bg-white/15 text-2xl leading-none text-white backdrop-blur-sm hover:bg-white/25"
                onClick={closeTrainingMatter}
              >
                  ×
                </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside className="hidden w-64 shrink-0 flex-col border-r border-indigo-100 bg-gradient-to-b from-cyan-50 via-indigo-50 to-violet-50 sm:flex">
              <p className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-500">
                Sections
              </p>
              <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-4">
                {matterTabs.map((tab) => {
                  const active = matterTab === tab.id;
                  const tones: Record<
                    string,
                    { active: string; idle: string }
                  > = {
                    matter_files: {
                      active:
                        "bg-gradient-to-r from-cyan-500 to-sky-600 text-white shadow-md shadow-cyan-200",
                      idle: "bg-white/70 text-cyan-800 hover:bg-cyan-100/80",
                    },
                    presentation: {
                      active:
                        "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-200",
                      idle: "bg-white/70 text-indigo-800 hover:bg-indigo-100/80",
                    },
                    question_paper: {
                      active:
                        "bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white shadow-md shadow-fuchsia-200",
                      idle: "bg-white/70 text-fuchsia-800 hover:bg-fuchsia-100/80",
                    },
                    answer_sheet: {
                      active:
                        "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-200",
                      idle: "bg-white/70 text-emerald-800 hover:bg-emerald-100/80",
                    },
                  };
                  const tone = tones[tab.id] ?? tones.matter_files;
                  const icons: Record<string, string> = {
                    matter_files: "📂",
                    presentation: "🎬",
                    question_paper: "📝",
                    answer_sheet: "✅",
                  };
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setMatterTab(tab.id)}
                      className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                        active ? tone.active : tone.idle
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden>{icons[tab.id] ?? "•"}</span>
                        <span className="truncate">{tab.label}</span>
                      </span>
                    </button>
                  );
                })}
              </nav>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
              {error ? (
                <p className="mb-3 shrink-0 text-sm text-red-600">{error}</p>
              ) : null}
              {message ? (
                <p className="mb-3 shrink-0 text-sm text-emerald-700">{message}</p>
              ) : null}

              <div className="mb-3 flex shrink-0 gap-2 overflow-x-auto sm:hidden">
                {matterTabs.map((tab) => {
                  const active = matterTab === tab.id;
                  const mobileTone: Record<string, string> = {
                    matter_files: active
                      ? "bg-gradient-to-r from-cyan-500 to-sky-600 text-white"
                      : "border border-cyan-200 bg-cyan-50 text-cyan-800",
                    presentation: active
                      ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white"
                      : "border border-indigo-200 bg-indigo-50 text-indigo-800",
                    question_paper: active
                      ? "bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white"
                      : "border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
                    answer_sheet: active
                      ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
                      : "border border-emerald-200 bg-emerald-50 text-emerald-800",
                  };
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setMatterTab(tab.id)}
                      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        mobileTone[tab.id] ?? mobileTone.matter_files
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  {activeMatterLabel}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  {showAiForTab ? (
                    <button
                      type="button"
                      onClick={openAiAssistant}
                      className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      AI Assistant
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={openAddSources}
                    disabled={uploadingMatterFile || savingSource}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {uploadingMatterFile || savingSource
                      ? "Saving…"
                      : "Add Sources"}
                  </button>
                </div>
              </div>

              {showAddSources ? (
                <div
                  className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="add-sources-title"
                >
                  <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h2
                          id="add-sources-title"
                          className="text-lg font-semibold text-slate-900"
                        >
                          Add Sources
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Choose how you want to add content to this section.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                        disabled={uploadingMatterFile || savingSource}
                        onClick={() => {
                          setShowAddSources(false);
                          setSourceMode("menu");
                        }}
                       title="Close" aria-label="Close">
                  ×
                </button>
                    </div>

                    {error ? (
                      <p className="mb-3 text-sm text-red-600">{error}</p>
                    ) : null}

                    {sourceMode === "menu" ? (
                      <div className="grid gap-2">
                        {[
                          {
                            id: "file" as const,
                            title: "Upload File",
                            desc: "PDF, Word, Excel, Image, and all file types",
                            emoji: "📄",
                          },
                          {
                            id: "website" as const,
                            title: "Add Website Link",
                            desc: "Reference any webpage URL",
                            emoji: "🌐",
                          },
                          {
                            id: "youtube" as const,
                            title: "Add YouTube Video Link",
                            desc: "Add a training video from YouTube",
                            emoji: "▶️",
                          },
                          {
                            id: "text" as const,
                            title: "Add Text",
                            desc: "Paste notes or training content",
                            emoji: "📝",
                          },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setError(null);
                              setSourceMode(opt.id);
                            }}
                            className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50/50"
                          >
                            <span className="text-xl leading-none">
                              {opt.emoji}
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-slate-900">
                                {opt.title}
                              </span>
                              <span className="mt-0.5 block text-xs text-slate-500">
                                {opt.desc}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {sourceMode === "file" ? (
                      <div className="space-y-3">
                        <button
                          type="button"
                          className="text-xs font-semibold text-indigo-600"
                          onClick={() => setSourceMode("menu")}
                        >
                          ← Back
                        </button>
                        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center hover:bg-slate-100">
                          <span className="text-sm font-semibold text-slate-800">
                            {uploadingMatterFile
                              ? "Uploading…"
                              : "Choose a file to upload"}
                          </span>
                          <span className="mt-1 text-xs text-slate-500">
                            PDF, Word, Excel, PowerPoint, images, zip, and more
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            disabled={uploadingMatterFile}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void uploadMatterFile(file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    ) : null}

                    {sourceMode === "website" || sourceMode === "youtube" ? (
                      <div className="space-y-3">
                        <button
                          type="button"
                          className="text-xs font-semibold text-indigo-600"
                          onClick={() => setSourceMode("menu")}
                        >
                          ← Back
                        </button>
                        <label className="block text-xs font-semibold text-slate-600">
                          Title (optional)
                          <input
                            value={sourceTitle}
                            onChange={(e) => setSourceTitle(e.target.value)}
                            placeholder={
                              sourceMode === "youtube"
                                ? "Video title"
                                : "Website title"
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          />
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                          {sourceMode === "youtube"
                            ? "YouTube URL"
                            : "Website URL"}
                          <input
                            value={sourceUrl}
                            onChange={(e) => setSourceUrl(e.target.value)}
                            placeholder={
                              sourceMode === "youtube"
                                ? "https://www.youtube.com/watch?v=..."
                                : "https://example.com/page"
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          />
                        </label>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            disabled={savingSource}
                            onClick={() => setSourceMode("menu")}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingSource}
                            onClick={() =>
                              void saveLinkSource(
                                sourceMode === "youtube"
                                  ? "youtube"
                                  : "website",
                              )
                            }
                            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                          >
                            {savingSource ? "Saving…" : "Add source"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {sourceMode === "text" ? (
                      <div className="space-y-3">
                        <button
                          type="button"
                          className="text-xs font-semibold text-indigo-600"
                          onClick={() => setSourceMode("menu")}
                        >
                          ← Back
                        </button>
                        <label className="block text-xs font-semibold text-slate-600">
                          Title (optional)
                          <input
                            value={sourceTitle}
                            onChange={(e) => setSourceTitle(e.target.value)}
                            placeholder="Note title"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          />
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                          Text
                          <textarea
                            rows={8}
                            value={sourceText}
                            onChange={(e) => setSourceText(e.target.value)}
                            placeholder="Paste or type training content…"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          />
                        </label>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            disabled={savingSource}
                            onClick={() => setSourceMode("menu")}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingSource}
                            onClick={() => void saveTextSource()}
                            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                          >
                            {savingSource ? "Saving…" : "Add text"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {showAiForTab && showAiAssistant ? (
                <div
                  className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="ai-assistant-title"
                >
                  <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <h2
                        id="ai-assistant-title"
                        className="text-lg font-semibold text-slate-900"
                      >
                        {matterTab === "presentation"
                          ? "AI Presentation Assistant"
                          : matterTab === "answer_sheet"
                            ? "AI Answer Sheet Assistant"
                            : "AI Question Paper Assistant"}
                      </h2>
                      <button
                        type="button"
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                        disabled={generatingAiAsset}
                        onClick={() => {
                          setShowAiAssistant(false);
                          setShowAiFilePicker(false);
                        }}
                       title="Close" aria-label="Close">
                  ×
                </button>
                    </div>

                    {error ? (
                      <p className="mb-3 text-sm text-red-600">{error}</p>
                    ) : null}

                    {matterTab === "presentation" ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-slate-600">
                          Session Time
                          <select
                            value={aiForm.sessionTime}
                            onChange={(e) =>
                              setAiForm({
                                ...aiForm,
                                sessionTime: e.target.value,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          >
                            <option value="30 minutes">30 minutes</option>
                            <option value="1 hour">1 hour</option>
                            <option value="2 hours">2 hours</option>
                            <option value="3 hours">3 hours</option>
                            <option value="4 hours">4 hours</option>
                            <option value="Full day">Full day</option>
                          </select>
                        </label>

                        <label className="text-xs font-semibold text-slate-600">
                          Presentation Language
                          <select
                            value={aiForm.language}
                            onChange={(e) =>
                              setAiForm({ ...aiForm, language: e.target.value })
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          >
                            <option value="English">English</option>
                            <option value="Hindi">Hindi</option>
                            <option value="Hinglish">Hinglish</option>
                          </select>
                        </label>

                        <label className="text-xs font-semibold text-slate-600">
                          Presentation Pages
                          <select
                            value={aiForm.pages}
                            onChange={(e) =>
                              setAiForm({ ...aiForm, pages: e.target.value })
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          >
                            <option value="6-8">6–8 slides</option>
                            <option value="8-10">8–10 slides</option>
                            <option value="10-12">10–12 slides</option>
                            <option value="12-14">12–14 slides</option>
                            <option value="15-20">15–20 slides</option>
                            <option value="20-25">20–25 slides</option>
                            <option value="25-30">25–30 slides</option>
                            <option value="30-40">30–40 slides</option>
                            <option value="40-50">40–50 slides</option>
                            <option value="50-60">50–60 slides</option>
                          </select>
                        </label>

                        <label className="text-xs font-semibold text-slate-600">
                          Presentation Style
                          <select
                            value={aiForm.style}
                            onChange={(e) =>
                              setAiForm({ ...aiForm, style: e.target.value })
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          >
                            <option value="Professional">Professional</option>
                            <option value="Simple & clear">
                              Simple & clear
                            </option>
                            <option value="Technical / detailed">
                              Technical / detailed
                            </option>
                          </select>
                        </label>

                        <label className="text-xs font-semibold text-slate-600">
                          Audience Level
                          <select
                            value={aiForm.audience}
                            onChange={(e) =>
                              setAiForm({ ...aiForm, audience: e.target.value })
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          >
                            <option value="Beginner">Beginner</option>
                            <option value="Intermediate">Intermediate</option>
                            <option value="Advanced">Advanced</option>
                          </select>
                        </label>

                        <div className="flex flex-col justify-end">
                          <button
                            type="button"
                            onClick={() => setShowAiFilePicker((v) => !v)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Choose Files
                            {aiSelectedSourceIds.length > 0
                              ? ` (${aiSelectedSourceIds.length})`
                              : ""}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {matterTab === "answer_sheet" ? (
                          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                            Question Paper *
                            <select
                              value={aiForm.questionPaperAssetId}
                              onChange={(e) =>
                                setAiForm({
                                  ...aiForm,
                                  questionPaperAssetId: e.target.value,
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                            >
                              <option value="">
                                Select question paper from this training
                              </option>
                              {matterAssets
                                .filter((a) => a.category === "question_paper")
                                .map((paper) => (
                                  <option key={paper.id} value={paper.id}>
                                    {paper.file_name}
                                    {paper.created_at
                                      ? ` · ${new Date(
                                          paper.created_at,
                                        ).toLocaleDateString("en-IN")}`
                                      : ""}
                                  </option>
                                ))}
                            </select>
                            {matterAssets.filter(
                              (a) => a.category === "question_paper",
                            ).length === 0 ? (
                              <span className="mt-1 block text-[11px] font-normal text-amber-700">
                                No question paper found for this training.
                                Generate one in Training Questions Paper first.
                              </span>
                            ) : null}
                          </label>
                        ) : null}

                        <label className="text-xs font-semibold text-slate-600">
                          Exam Duration
                          <select
                            value={aiForm.examDuration}
                            onChange={(e) =>
                              setAiForm({
                                ...aiForm,
                                examDuration: e.target.value,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          >
                            <option value="30 minutes">30 minutes</option>
                            <option value="45 minutes">45 minutes</option>
                            <option value="60 minutes">60 minutes</option>
                            <option value="90 minutes">90 minutes</option>
                            <option value="120 minutes">120 minutes</option>
                          </select>
                        </label>

                        <label className="text-xs font-semibold text-slate-600">
                          {matterTab === "answer_sheet"
                            ? "Answer Language"
                            : "Paper Language"}
                          <select
                            value={aiForm.language}
                            onChange={(e) =>
                              setAiForm({ ...aiForm, language: e.target.value })
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          >
                            <option value="English">English</option>
                            <option value="Hindi">Hindi</option>
                            <option value="Hinglish">Hinglish</option>
                          </select>
                        </label>

                        <label className="text-xs font-semibold text-slate-600">
                          Total Marks
                          <select
                            value={aiForm.totalMarks}
                            onChange={(e) =>
                              setAiForm({
                                ...aiForm,
                                totalMarks: e.target.value,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          >
                            <option value="25">25 marks</option>
                            <option value="50">50 marks</option>
                            <option value="75">75 marks</option>
                            <option value="100">100 marks</option>
                          </select>
                        </label>

                        <label className="text-xs font-semibold text-slate-600">
                          {matterTab === "answer_sheet"
                            ? "Number of Answers"
                            : "Number of Questions"}
                          <select
                            value={aiForm.questionCount}
                            onChange={(e) =>
                              setAiForm({
                                ...aiForm,
                                questionCount: e.target.value,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          >
                            <option value="10-12">10–12 questions</option>
                            <option value="12-15">12–15 questions</option>
                            <option value="15-20">15–20 questions</option>
                            <option value="20-25">20–25 questions</option>
                          </select>
                        </label>

                        {matterTab === "question_paper" ? (
                          <>
                            <label className="text-xs font-semibold text-slate-600">
                              Type of Question Paper
                              <select
                                value={aiForm.paperType}
                                onChange={(e) =>
                                  setAiForm({
                                    ...aiForm,
                                    paperType: e.target.value,
                                  })
                                }
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                              >
                                <option value="Clause Find">Clause Find</option>
                                <option value="Mix">Mix</option>
                                <option value="MCQ">MCQ</option>
                                <option value="Descriptive">Descriptive</option>
                              </select>
                            </label>

                            <label className="text-xs font-semibold text-slate-600">
                              Answer format on sheet
                              <select
                                value={aiForm.answerFormat}
                                onChange={(e) =>
                                  setAiForm({
                                    ...aiForm,
                                    answerFormat: e.target.value,
                                  })
                                }
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                              >
                                <option value="Checkbox">
                                  Checkbox (option questions)
                                </option>
                                <option value="Clause">
                                  Clause write-in
                                </option>
                                <option value="Written">
                                  Written answer space
                                </option>
                                <option value="Mix">
                                  Mix (by question type)
                                </option>
                              </select>
                            </label>
                          </>
                        ) : null}

                        <label className="text-xs font-semibold text-slate-600">
                          Difficulty Level
                          <select
                            value={aiForm.difficulty}
                            onChange={(e) =>
                              setAiForm({
                                ...aiForm,
                                difficulty: e.target.value,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                          >
                            <option value="Easy">Easy</option>
                            <option value="Mixed">Mixed</option>
                            <option value="Moderate">Moderate</option>
                            <option value="Hard">Hard</option>
                          </select>
                        </label>

                        <div className="flex flex-col justify-end">
                          <button
                            type="button"
                            onClick={() => setShowAiFilePicker((v) => !v)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Choose Files
                            {aiSelectedSourceIds.length > 0
                              ? ` (${aiSelectedSourceIds.length})`
                              : ""}
                          </button>
                        </div>
                      </div>
                    )}

                    {showAiFilePicker ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Training Matter Sources
                          </p>
                          {(() => {
                            const matterSources = matterAssets.filter(
                              (a) => a.category === "matter_files",
                            );
                            const ids = matterSources.map((a) => a.id);
                            return (
                              <button
                                type="button"
                                className="text-xs font-semibold text-indigo-600"
                                onClick={() => toggleAllAiSources(ids)}
                              >
                                {ids.length > 0 &&
                                ids.every((id) =>
                                  aiSelectedSourceIds.includes(id),
                                )
                                  ? "Clear all"
                                  : "Select all"}
                              </button>
                            );
                          })()}
                        </div>
                        {matterAssets.filter((a) => a.category === "matter_files")
                          .length === 0 ? (
                          <p className="text-sm text-slate-500">
                            No sources uploaded yet in Training Matter Files.
                          </p>
                        ) : (
                          <ul className="max-h-48 space-y-1 overflow-auto">
                            {matterAssets
                              .filter((a) => a.category === "matter_files")
                              .map((asset) => (
                                <li key={asset.id}>
                                  <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 h-4 w-4"
                                      checked={aiSelectedSourceIds.includes(
                                        asset.id,
                                      )}
                                      onChange={() =>
                                        toggleAiSourceSelect(asset.id)
                                      }
                                    />
                                    <span className="min-w-0 text-sm text-slate-800">
                                      <span className="mr-1">
                                        {sourceTypeEmoji(
                                          getAssetSourceType(asset),
                                        )}
                                      </span>
                                      {asset.file_name}
                                    </span>
                                  </label>
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    ) : null}

                    <label className="mt-3 block text-xs font-semibold text-slate-600">
                      Extra notes (optional)
                      <textarea
                        rows={2}
                        value={aiForm.notes}
                        onChange={(e) =>
                          setAiForm({ ...aiForm, notes: e.target.value })
                        }
                        placeholder="Any special focus or instructions…"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                      />
                    </label>

                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={generatingAiAsset}
                        onClick={() => {
                          setShowAiAssistant(false);
                          setShowAiFilePicker(false);
                        }}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-2xl leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={generatingAiAsset}
                        onClick={() => void generateAiAsset()}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {generatingAiAsset
                          ? matterTab === "presentation"
                            ? "Creating presentation…"
                            : matterTab === "answer_sheet"
                              ? "Creating answer sheet…"
                              : "Creating question paper…"
                          : "Generate with AI"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
                <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-xl border border-slate-200">
                  {activeMatterAssets.length === 0 ? (
                    <div className="flex h-full min-h-[180px] items-center justify-center p-6">
                      <p className="text-sm text-slate-500">
                        No sources added for this section yet.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="w-12 border border-slate-200 px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={
                                activeMatterAssets.length > 0 &&
                                selectedActiveMatterCount ===
                                  activeMatterAssets.length
                              }
                              onChange={toggleSelectAllMatterAssets}
                              aria-label="Select all files"
                              className="h-4 w-4"
                            />
                          </th>
                          <th className="border border-slate-200 px-3 py-2.5 text-left">
                            Source
                          </th>
                          <th className="border border-slate-200 px-3 py-2.5 text-center">
                            Uploaded
                          </th>
                          <th className="border border-slate-200 px-3 py-2.5 text-center">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeMatterAssets.map((asset) => {
                          const sourceType = getAssetSourceType(asset);
                          const isExternalLink =
                            sourceType === "website" ||
                            sourceType === "youtube";
                          return (
                          <tr key={asset.id} className="hover:bg-slate-50/80">
                            <td className="border border-slate-200 px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={selectedMatterAssetIds.includes(
                                  asset.id,
                                )}
                                onChange={() =>
                                  toggleMatterAssetSelect(asset.id)
                                }
                                aria-label={`Select ${asset.file_name}`}
                                className="h-4 w-4"
                              />
                            </td>
                            <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium text-slate-900">
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5" aria-hidden>
                                  {sourceTypeEmoji(sourceType)}
                                </span>
                                <div className="min-w-0">
                                  <div>{asset.file_name}</div>
                                  <div className="text-xs font-normal text-slate-500">
                                    {sourceTypeLabel(sourceType)}
                                    {asset.file_size != null
                                      ? ` · ${(asset.file_size / 1024).toFixed(1)} KB`
                                      : ""}
                                    {isExternalLink ? (
                                      <span className="block truncate">
                                        {asset.file_url}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-600">
                              {new Date(asset.created_at).toLocaleString(
                                "en-IN",
                              )}
                            </td>
                            <td className="border border-slate-200 px-3 py-2.5 text-center">
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                <button
                                  type="button"
                                  title="Open in App"
                                  aria-label="Open in App"
                                  className="rounded-md px-1.5 py-0.5 text-base leading-none hover:bg-indigo-50"
                                  onClick={() => setPreviewAsset(asset)}
                                >
                                  👁️
                                </button>
                                {!isExternalLink ? (
                                  <a
                                    href={asset.file_url}
                                    download={asset.file_name}
                                    title="Download"
                                    aria-label="Download"
                                    className="rounded-md px-1.5 py-0.5 text-base leading-none hover:bg-emerald-50"
                                  >
                                    ⬇️
                                  </a>
                                ) : null}
                                <a
                                  href={asset.file_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="External"
                                  aria-label="Open externally"
                                  className="rounded-md px-1.5 py-0.5 text-base leading-none hover:bg-slate-100"
                                >
                                  🔗
                                </a>
                                <button
                                  type="button"
                                  title="Delete"
                                  aria-label="Delete"
                                  className="rounded-md px-1.5 py-0.5 text-base leading-none hover:bg-rose-50"
                                  onClick={() => void deleteMatterAsset(asset)}
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {previewAsset ? (
                  <div className="flex min-h-[320px] w-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 lg:w-[48%]">
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {sourceTypeEmoji(getAssetSourceType(previewAsset))}{" "}
                          {previewAsset.file_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {getAssetSourceType(previewAsset) === "youtube"
                            ? "YouTube preview"
                            : getAssetSourceType(previewAsset) === "website"
                              ? "Website preview"
                              : isHtmlAsset(previewAsset)
                                ? previewAsset.category === "question_paper"
                                  ? "In-app question paper — scroll, download, or print"
                                  : previewAsset.category === "presentation"
                                    ? "Slide preview — use AI Improve / Recreate on each slide"
                                    : "In-app preview"
                                : "In-app preview"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {getAssetSourceType(previewAsset) === "file" ||
                        getAssetSourceType(previewAsset) === "text" ? (
                          <a
                            href={previewAsset.file_url}
                            download={previewAsset.file_name}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            ⬇️
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                          onClick={() => setPreviewAsset(null)}
                         title="Close" aria-label="Close">
                  ×
                </button>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 bg-white p-2">
                      {(() => {
                        const type = getAssetSourceType(previewAsset);
                        if (type === "youtube") {
                          const videoId = getYoutubeVideoId(
                            previewAsset.file_url,
                          );
                          return videoId ? (
                            <iframe
                              title={previewAsset.file_name}
                              src={`https://www.youtube.com/embed/${videoId}`}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className="h-full min-h-[280px] w-full rounded-lg border border-slate-200"
                            />
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                              <p className="text-sm text-slate-600">
                                Invalid YouTube URL.
                              </p>
                              <a
                                href={previewAsset.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                              >
                                Open externally
                              </a>
                            </div>
                          );
                        }
                        if (type === "website") {
                          return (
                            <iframe
                              title={previewAsset.file_name}
                              src={previewAsset.file_url}
                              className="h-full min-h-[280px] w-full rounded-lg border border-slate-200"
                            />
                          );
                        }
                        if (!canPreviewInApp(previewAsset)) {
                          return (
                            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                              <p className="text-sm text-slate-600">
                                This file type cannot be previewed in the app.
                              </p>
                              <a
                                href={previewAsset.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                              >
                                Open externally
                              </a>
                            </div>
                          );
                        }
                        if (isImageAsset(previewAsset)) {
                          return (
                            <div className="flex h-full items-center justify-center overflow-auto">
                              <img
                                src={previewAsset.file_url}
                                alt={previewAsset.file_name}
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                          );
                        }
                        if (isHtmlAsset(previewAsset)) {
                          if (previewAsset.category === "presentation") {
                            return (
                              <PresentationAiPreview
                                asset={previewAsset}
                                onAssetUpdated={(updated) => {
                                  setPreviewAsset(updated);
                                  setMatterAssets((prev) =>
                                    prev.map((a) =>
                                      a.id === updated.id ? updated : a,
                                    ),
                                  );
                                }}
                              />
                            );
                          }
                          return (
                            <HtmlPreviewFrame
                              url={previewAsset.file_url}
                              title={previewAsset.file_name}
                            />
                          );
                        }
                        if (type === "text") {
                          return (
                            <TextPreviewFrame url={previewAsset.file_url} />
                          );
                        }
                        return (
                          <iframe
                            title={previewAsset.file_name}
                            src={previewAsset.file_url}
                            className="h-full min-h-[280px] w-full rounded-lg border border-slate-200"
                          />
                        );
                      })()}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showFormModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-programme-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="add-programme-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  {editingProgrammeId ? "Edit Programme" : "Add Programme"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editingProgrammeId
                    ? "Update programme details for organizations and individuals."
                    : "Create a programme for organizations and individuals."}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  if (saving) return;
                  setShowFormModal(false);
                  setEditingProgrammeId(null);
                  setForm(emptyForm);
                }}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            {error ? (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Title
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                />
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Description
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Category
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Duration (hours)
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.duration_hours}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, duration_hours: e.target.value }))
                  }
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Price (INR)
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price: e.target.value }))
                  }
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Delivery mode
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.delivery_mode}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, delivery_mode: e.target.value }))
                  }
                >
                  <option value="onsite">Onsite</option>
                  <option value="online">Online</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                onClick={() => {
                  setShowFormModal(false);
                  setEditingProgrammeId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveProgramme()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving
                  ? editingProgrammeId
                    ? "Saving…"
                    : "Publishing…"
                  : editingProgrammeId
                    ? "Save changes"
                    : "Publish programme"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingSubmissions.length > 0 ? (
        <Panel className="mb-4 border-amber-200 bg-amber-50/60">
          <h2 className="text-sm font-semibold text-amber-900">
            Pending submissions ({pendingSubmissions.length})
          </h2>
          <p className="mt-1 text-xs text-amber-800">
            Review and click Go Live to publish these programmes for booking.
          </p>
          <div className="mt-3 grid gap-2">
            {pendingSubmissions.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{p.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{p.description}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    From:{" "}
                    {p.submitted_by_org_id
                      ? (orgNames[p.submitted_by_org_id] ?? "Organization")
                      : p.submitted_by_user_id
                        ? (userNames[p.submitted_by_user_id] ?? "Learner")
                        : "—"}{" "}
                    · {p.category ?? "General"} · {p.duration_hours ?? "—"} hrs ·{" "}
                    {p.delivery_mode}
                  </p>
                  {p.submission_notes ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Notes: {p.submission_notes}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void setStatus(p.id, "published")}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Go Live
                  </button>
                  <button
                    type="button"
                    onClick={() => void setStatus(p.id, "archived")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  >
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState message="No programmes yet." />
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
                      aria-label="Select all programmes"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Title
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Category
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Duration
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Mode
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Price
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Training Matter
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Status
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        aria-label={`Select ${p.title}`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium text-slate-900">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{p.title}</span>
                        {p.submitted_by_org_id ? (
                          <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                            Org
                          </span>
                        ) : null}
                        {p.submitted_by_user_id ? (
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
                            Learner
                          </span>
                        ) : null}
                      </div>
                      {p.description ? (
                        <div className="mt-0.5 line-clamp-2 text-xs font-normal text-slate-500">
                          {p.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {p.category ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {p.duration_hours != null ? `${p.duration_hours} hrs` : "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center capitalize text-slate-700">
                      {p.delivery_mode || "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {inr(p.price_cents ?? 0)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => openTrainingMatter(p)}
                        className="relative inline-flex items-center rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Training Matter
                        {p.training_matter?.trim() ? (
                          <span
                            className="ml-1.5 h-2 w-2 rounded-full bg-emerald-500"
                            aria-label="Matter available"
                          />
                        ) : null}
                      </button>
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <select
                        value={p.status}
                        onChange={(e) =>
                          void setStatus(
                            p.id,
                            e.target.value as ProgrammeStatus,
                          )
                        }
                        aria-label={`Status for ${p.title}`}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Publish</option>
                        <option value="archived">Archive</option>
                      </select>
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          title="Edit"
                          aria-label={`Edit ${p.title}`}
                          onClick={() => openEditProgramme(p)}
                          className="rounded-md px-1.5 py-0.5 text-base leading-none hover:bg-indigo-50"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          aria-label={`Delete ${p.title}`}
                          onClick={() => void deleteProgramme(p)}
                          className="rounded-md px-1.5 py-0.5 text-base leading-none hover:bg-rose-50"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

export function QiSessionsPage() {
  const { profile } = useAuth();
  const [programmes, setProgrammes] = useState<TrainingProgramme[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [trainers, setTrainers] = useState<Profile[]>([]);
  const [learners, setLearners] = useState<Profile[]>([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [form, setForm] = useState({
    programme_id: "",
    title: "",
    starts_at: "",
    ends_at: "",
    location: "",
    org_id: "",
    trainer_id: "",
    capacity: "30",
    mode: "onsite",
    assessment_title: "End-of-session assessment",
    notes: "",
  });
  const [enrollUserId, setEnrollUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [p, s, o, t, l] = await Promise.all([
      supabase
        .from("training_programmes")
        .select("*")
        .order("title", { ascending: true }),
      supabase
        .from("training_sessions")
        .select("*")
        .order("starts_at", { ascending: false }),
      supabase
        .from("organizations")
        .select("*")
        .eq("type", "tenant")
        .order("name"),
      supabase
        .from("profiles")
        .select("*")
        .in("role", ["trainer", "super_admin", "employee"])
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .order("full_name"),
      supabase
        .from("profiles")
        .select("*")
        .in("role", ["individual", "org_employee"])
        .eq("is_active", true)
        .order("full_name"),
    ]);
    setProgrammes((p.data ?? []) as TrainingProgramme[]);
    setSessions((s.data ?? []) as TrainingSession[]);
    setOrgs((o.data ?? []) as Organization[]);
    setTrainers((t.data ?? []) as Profile[]);
    setLearners((l.data ?? []) as Profile[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createSession() {
    setError(null);
    setMessage(null);
    if (!form.programme_id || !form.title.trim()) {
      setError("Programme and title are required.");
      return;
    }
    const { data: session, error: err } = await supabase
      .from("training_sessions")
      .insert({
        programme_id: form.programme_id,
        title: form.title.trim(),
        starts_at: form.starts_at
          ? new Date(form.starts_at).toISOString()
          : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        location: form.location || null,
        org_id: form.org_id || null,
        trainer_id: form.trainer_id || profile?.id || null,
        capacity: Number(form.capacity) || null,
        mode: form.mode,
        notes: form.notes || null,
        status: "scheduled",
      })
      .select("*")
      .single();
    if (err) {
      setError(err.message);
      return;
    }
    if (form.assessment_title.trim() && session) {
      await supabase.from("assessments").insert({
        session_id: session.id,
        title: form.assessment_title.trim(),
        passing_score: 70,
      });
    }
    if (form.org_id && session) {
      const { data: members } = await supabase
        .from("profiles")
        .select("id")
        .eq("org_id", form.org_id)
        .eq("role", "org_employee")
        .eq("is_active", true);
      if (members?.length) {
        await supabase.from("enrollments").insert(
          members.map((m) => ({
            session_id: session.id,
            user_id: m.id,
            status: "enrolled" as const,
          })),
        );
      }
    }
    setMessage("Session created. Org employees auto-enrolled when org selected.");
    setForm((f) => ({
      ...f,
      title: "",
      starts_at: "",
      ends_at: "",
      location: "",
      notes: "",
    }));
    await load();
  }

  async function setSessionStatus(id: string, status: SessionStatus) {
    await supabase.from("training_sessions").update({ status }).eq("id", id);
    await load();
  }

  async function enrollOne() {
    setError(null);
    setMessage(null);
    if (!selectedSession || !enrollUserId) return;
    const { error: err } = await supabase.from("enrollments").insert({
      session_id: selectedSession,
      user_id: enrollUserId,
      status: "enrolled",
    });
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Learner enrolled.");
    setEnrollUserId("");
  }

  async function issueCertsForSession() {
    setError(null);
    setMessage(null);
    if (!selectedSession) return;
    const session = sessions.find((s) => s.id === selectedSession);
    if (!session) return;
    const { data: enrolled } = await supabase
      .from("enrollments")
      .select("user_id")
      .eq("session_id", selectedSession);
    if (!enrolled?.length) {
      setError("No enrollments on this session.");
      return;
    }
    const rows = enrolled.map((e) => ({
      user_id: e.user_id,
      session_id: selectedSession,
      programme_id: session.programme_id,
      title: `Certificate — ${session.title}`,
    }));
    const { error: err } = await supabase.from("certificates").insert(rows);
    if (err) {
      setError(err.message);
      return;
    }
    await supabase
      .from("enrollments")
      .update({ status: "completed" })
      .eq("session_id", selectedSession);
    setMessage(`Issued ${rows.length} certificate(s).`);
  }

  return (
    <div>
      <PageHeader
        title="Sessions & Delivery"
        description="Schedule sessions, enroll learners, run assessments, and issue certificates."
      />
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-emerald-700">{message}</p> : null}

      <Panel className="mb-4 grid gap-2 sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-sm font-semibold">Create session</h2>
        <label className="text-xs font-semibold">
          Programme
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            value={form.programme_id}
            onChange={(e) => {
              const programme = programmes.find((p) => p.id === e.target.value);
              setForm((f) => ({
                ...f,
                programme_id: e.target.value,
                title: programme
                  ? `${programme.title} — Session`
                  : f.title,
                mode: programme?.delivery_mode ?? f.mode,
              }));
            }}
          >
            <option value="">Select programme</option>
            {programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Session title
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </label>
        <label className="text-xs font-semibold">
          Starts at
          <input
            type="datetime-local"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            value={form.starts_at}
            onChange={(e) =>
              setForm((f) => ({ ...f, starts_at: e.target.value }))
            }
          />
        </label>
        <label className="text-xs font-semibold">
          Ends at
          <input
            type="datetime-local"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            value={form.ends_at}
            onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
          />
        </label>
        <label className="text-xs font-semibold">
          Organization (optional — auto-enrolls employees)
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            value={form.org_id}
            onChange={(e) => setForm((f) => ({ ...f, org_id: e.target.value }))}
          >
            <option value="">Open / individuals</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Trainer
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            value={form.trainer_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, trainer_id: e.target.value }))
            }
          >
            <option value="">Assign later / self</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name || t.email} ({t.role})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Location / meeting link
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            value={form.location}
            onChange={(e) =>
              setForm((f) => ({ ...f, location: e.target.value }))
            }
          />
        </label>
        <label className="text-xs font-semibold">
          Capacity
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            value={form.capacity}
            onChange={(e) =>
              setForm((f) => ({ ...f, capacity: e.target.value }))
            }
          />
        </label>
        <label className="text-xs font-semibold">
          Mode
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            value={form.mode}
            onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}
          >
            <option value="onsite">Onsite</option>
            <option value="online">Online</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </label>
        <label className="text-xs font-semibold">
          Assessment title
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            value={form.assessment_title}
            onChange={(e) =>
              setForm((f) => ({ ...f, assessment_title: e.target.value }))
            }
          />
        </label>
        <button
          type="button"
          onClick={() => void createSession()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white sm:col-span-2 sm:w-fit"
        >
          Create session
        </button>
      </Panel>

      <Panel className="mb-6 grid gap-2 sm:grid-cols-3">
        <h2 className="sm:col-span-3 text-sm font-semibold">
          Enroll learner / issue certificates
        </h2>
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={selectedSession}
          onChange={(e) => setSelectedSession(e.target.value)}
        >
          <option value="">Select session</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={enrollUserId}
          onChange={(e) => setEnrollUserId(e.target.value)}
        >
          <option value="">Select learner</option>
          {learners.map((l) => (
            <option key={l.id} value={l.id}>
              {l.full_name || l.email} ({l.role})
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void enrollOne()}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
          >
            Enroll
          </button>
          <button
            type="button"
            onClick={() => void issueCertsForSession()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
          >
            Issue certificates
          </button>
        </div>
      </Panel>

      {sessions.length === 0 ? (
        <EmptyState message="No sessions yet. Create the first delivery session above." />
      ) : (
        <Panel>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2">Title</th>
                <th className="pb-2">When</th>
                <th className="pb-2">Mode</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-2 font-medium">
                    {s.title}
                    <div className="text-xs font-normal text-slate-500">
                      {s.location ?? "—"}
                    </div>
                  </td>
                  <td className="py-2 text-xs">
                    {s.starts_at
                      ? new Date(s.starts_at).toLocaleString()
                      : "TBD"}
                  </td>
                  <td className="py-2 capitalize">{s.mode}</td>
                  <td className="py-2 capitalize">{s.status}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {(
                        [
                          "scheduled",
                          "in_progress",
                          "completed",
                          "cancelled",
                        ] as SessionStatus[]
                      ).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => void setSessionStatus(s.id, st)}
                          className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase"
                        >
                          {st.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

export function QiTrainingRequestsPage() {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === "super_admin";
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<
    Array<
      TrainingRequest & {
        org_name?: string;
        programme_title?: string;
        requester_name?: string;
      }
    >
  >([]);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [tableSearch, setTableSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected" | "scheduled"
  >("all");
  const [orgFilter, setOrgFilter] = useState(searchParams.get("org") ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [viewingRequest, setViewingRequest] = useState<
    (TrainingRequest & { programme_title?: string }) | null
  >(null);
  const [requestEmployees, setRequestEmployees] = useState<Profile[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  function displayTitle(
    row: TrainingRequest & { programme_title?: string },
  ) {
    if (row.programme_title?.trim()) return row.programme_title.trim();
    return row.title.replace(/^Request:\s*/i, "").trim() || "Training";
  }

  async function load() {
    const [reqs, orgRows, progRows] = await Promise.all([
      supabase
        .from("training_requests")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("organizations").select("id, name, type"),
      supabase.from("training_programmes").select("id, title"),
    ]);
    const tenantOrgs = (
      (orgRows.data ?? []) as Array<{ id: string; name: string; type: string }>
    ).filter((o) => o.type === "tenant");
    const orgMap = new Map(tenantOrgs.map((o) => [o.id, o.name]));
    setOrgs(tenantOrgs.map((o) => ({ id: o.id, name: o.name })));
    const progMap = new Map(
      ((progRows.data ?? []) as Array<{ id: string; title: string }>).map(
        (p) => [p.id, p.title],
      ),
    );
    const requests = (reqs.data ?? []) as TrainingRequest[];
    const requesterIds = [
      ...new Set(
        requests
          .map((r) => r.requested_by)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const requesterNameById = new Map<string, string>();
    if (requesterIds.length > 0) {
      const { data: people } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", requesterIds);
      for (const p of people ?? []) {
        requesterNameById.set(
          p.id,
          p.full_name?.trim() || p.email || "Individual",
        );
      }
    }

    const list = requests.map((r) => ({
      ...r,
      org_name: r.org_id ? orgMap.get(r.org_id) : undefined,
      programme_title: r.programme_id
        ? progMap.get(r.programme_id)
        : undefined,
      requester_name: r.requested_by
        ? requesterNameById.get(r.requested_by)
        : undefined,
    }));
    setRows(list);
    setSelectedIds((prev) =>
      prev.filter((id) => list.some((r) => r.id === id)),
    );
  }

  useEffect(() => {
    void load();
  }, []);

  const filtersActive =
    tableSearch.trim() !== "" || statusFilter !== "all" || orgFilter !== "";

  const filteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (orgFilter) {
        if (orgFilter === "__individual__") {
          if (r.org_id) return false;
        } else if (r.org_id !== orgFilter) {
          return false;
        }
      }
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      const title = displayTitle(r);
      const receivedLabel = r.created_at
        ? new Date(r.created_at).toLocaleDateString("en-IN")
        : "";
      const hay = [
        title,
        r.training_code,
        r.org_name,
        r.requester_name,
        r.preferred_date,
        receivedLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, tableSearch, statusFilter, orgFilter]);

  function clearFilters() {
    setTableSearch("");
    setStatusFilter("all");
    setOrgFilter("");
  }

  async function deleteRequest(
    row: TrainingRequest & { programme_title?: string },
  ) {
    const ok = window.confirm(
      `Delete request "${displayTitle(row)}"? This cannot be undone.`,
    );
    if (!ok) return;
    setMessage(null);
    const { error } = await supabase
      .from("training_requests")
      .delete()
      .eq("id", row.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Request deleted.");
    await load();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (
      filteredRows.length > 0 &&
      selectedIds.length === filteredRows.length &&
      filteredRows.every((r) => selectedIds.includes(r.id))
    ) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRows.map((r) => r.id));
    }
  }

  async function setStatus(id: string, status: string) {
    setMessage(null);
    const { error } = await supabase
      .from("training_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(`Request marked as ${status}.`);
    await load();
  }

  async function openEmployees(
    row: TrainingRequest & { programme_title?: string },
  ) {
    setViewingRequest(row);
    setRequestEmployees([]);
    const ids = row.employee_ids ?? [];
    if (ids.length === 0) return;
    setLoadingEmployees(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .in("id", ids);
      setRequestEmployees((data ?? []) as Profile[]);
    } finally {
      setLoadingEmployees(false);
    }
  }

  const allFilteredSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selectedIds.includes(r.id));

  const messageIsSuccess =
    message !== null &&
    (message.toLowerCase().includes("marked") ||
      message.toLowerCase().includes("deleted"));

  return (
    <div>
      <PageHeader
        title="Training Requests"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
              aria-pressed={searchOpen}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                searchOpen || tableSearch
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen((open) => !open)}
              aria-pressed={filterOpen}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                filterOpen || statusFilter !== "all" || orgFilter
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Filter
            </button>
          </div>
        }
      />
      {message ? (
        <p
          className={`mb-3 text-sm ${
            messageIsSuccess ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {message}
        </p>
      ) : null}

      {searchOpen ? (
        <div className="mb-3">
          <input
            type="search"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            placeholder="Search title, code, organization, requester…"
            aria-label="Search training requests"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:max-w-md"
            autoFocus
          />
        </div>
      ) : null}

      {filterOpen ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/90 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </span>
            {(
              [
                { id: "all", label: "All" },
                { id: "pending", label: "Pending" },
                { id: "approved", label: "Approved" },
                { id: "scheduled", label: "Scheduled" },
                { id: "rejected", label: "Rejected" },
              ] as const
            ).map((option) => {
              const active = statusFilter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStatusFilter(option.id)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Organization
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              aria-label="Filter by organization"
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium normal-case text-slate-700"
            >
              <option value="">All</option>
              <option value="__individual__">Individual</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>

          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState message="No training requests yet." />
      ) : filteredRows.length === 0 ? (
        <EmptyState message="No training requests match your search or filters." />
      ) : (
        <Panel className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-12 border border-slate-200 px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all training requests"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Title
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Organization / Individual
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Total Employee
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Preferred date
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Received
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Status
                  </th>
                  {isSuperAdmin ? (
                    <th className="border border-slate-200 px-3 py-2.5 text-center">
                      Action
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const title = displayTitle(r);
                  const employeeCount = r.employee_ids?.length ?? 0;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          aria-label={`Select ${title}`}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-left font-medium text-slate-900">
                        {title}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                        {r.org_name ? (
                          <div>
                            <p className="font-medium text-slate-900">
                              {r.org_name}
                            </p>
                            {r.requester_name ? (
                              <p className="mt-0.5 text-xs text-slate-500">
                                {r.requester_name}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          r.requester_name || "—"
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <div className="inline-flex items-center justify-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {employeeCount}
                          </span>
                          <button
                            type="button"
                            disabled={employeeCount === 0}
                            onClick={() => void openEmployees(r)}
                            className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            View
                          </button>
                        </div>
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                        {r.preferred_date || "—"}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                        {r.created_at
                          ? new Date(r.created_at).toLocaleDateString("en-IN")
                          : "—"}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <select
                          className={`rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize ${
                            r.status === "approved"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                              : r.status === "rejected"
                                ? "border-rose-300 bg-rose-50 text-rose-800"
                                : "border-slate-300 bg-slate-50 text-slate-700"
                          }`}
                          value={r.status}
                          aria-label={`Status for ${title}`}
                          onChange={(e) =>
                            void setStatus(r.id, e.target.value)
                          }
                        >
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                          {r.status === "scheduled" ? (
                            <option value="scheduled">Scheduled</option>
                          ) : null}
                        </select>
                      </td>
                      {isSuperAdmin ? (
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          <button
                            type="button"
                            title="Delete request"
                            aria-label={`Delete ${title}`}
                            onClick={() => void deleteRequest(r)}
                            className="rounded-md px-1.5 py-0.5 text-base leading-none hover:bg-rose-50"
                          >
                            🗑️
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {viewingRequest ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="request-employees-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="request-employees-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Employees
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {displayTitle(viewingRequest)} ·{" "}
                  {viewingRequest.employee_ids?.length ?? 0} employee
                  {(viewingRequest.employee_ids?.length ?? 0) === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  setViewingRequest(null);
                  setRequestEmployees([]);
                }}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            {loadingEmployees ? (
              <p className="text-sm text-slate-500">Loading employees…</p>
            ) : requestEmployees.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No employees linked to this request.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="border border-slate-200 px-3 py-2 text-left">
                        Name
                      </th>
                      <th className="border border-slate-200 px-3 py-2 text-center">
                        Email
                      </th>
                      <th className="border border-slate-200 px-3 py-2 text-center">
                        Mobile
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestEmployees.map((p) => (
                      <tr key={p.id}>
                        <td className="border border-slate-200 px-3 py-2 text-left font-medium text-slate-900">
                          {p.full_name || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-center text-slate-700">
                          {p.email || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-center text-slate-700">
                          {p.mobile || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function QiFinancePage() {
  const [rows, setRows] = useState<
    Array<Invoice & { org_name?: string }>
  >([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [form, setForm] = useState({
    invoice_number: "",
    amount: "",
    org_id: "",
    notes: "",
    status: "draft" as InvoiceStatus,
  });

  async function load() {
    const [inv, orgRows] = await Promise.all([
      supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("organizations").select("id, name").eq("type", "tenant"),
    ]);
    const orgMap = new Map(
      ((orgRows.data ?? []) as Array<{ id: string; name: string }>).map((o) => [
        o.id,
        o.name,
      ]),
    );
    setOrgs((orgRows.data ?? []) as Organization[]);
    setRows(
      ((inv.data ?? []) as Invoice[]).map((i) => ({
        ...i,
        org_name: i.org_id ? orgMap.get(i.org_id) : undefined,
      })),
    );
  }

  useEffect(() => {
    void load();
  }, []);

  async function createInvoice() {
    if (!form.invoice_number.trim()) return;
    await supabase.from("invoices").insert({
      invoice_number: form.invoice_number.trim(),
      amount_cents: Math.round(Number(form.amount || "0") * 100),
      org_id: form.org_id || null,
      notes: form.notes || null,
      status: form.status,
      currency: "INR",
      issued_at: new Date().toISOString(),
    });
    setForm({
      invoice_number: "",
      amount: "",
      org_id: "",
      notes: "",
      status: "draft",
    });
    await load();
  }

  async function setStatus(id: string, status: InvoiceStatus) {
    await supabase.from("invoices").update({ status }).eq("id", id);
    await load();
  }

  const totalPaid = rows
    .filter((r) => r.status === "paid")
    .reduce((s, r) => s + r.amount_cents, 0);

  return (
    <div>
      <PageHeader
        title="Finance Management"
        description="Invoices for training engagements with organizations and individuals."
      />
      <Panel className="mb-4">
        <p className="text-sm text-slate-600">
          Paid revenue:{" "}
          <strong className="text-slate-900">{inr(totalPaid)}</strong>
        </p>
      </Panel>
      <Panel className="mb-4 grid gap-2 sm:grid-cols-2">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Invoice number"
          value={form.invoice_number}
          onChange={(e) =>
            setForm((f) => ({ ...f, invoice_number: e.target.value }))
          }
        />
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Amount (INR)"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
        />
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={form.org_id}
          onChange={(e) => setForm((f) => ({ ...f, org_id: e.target.value }))}
        >
          <option value="">Organization (optional)</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={form.status}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              status: e.target.value as InvoiceStatus,
            }))
          }
        >
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
        </select>
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
        <button
          type="button"
          onClick={() => void createInvoice()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white sm:w-fit"
        >
          Create invoice
        </button>
      </Panel>
      {rows.length === 0 ? (
        <EmptyState message="No invoices yet." />
      ) : (
        <Panel>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2">Number</th>
                <th className="pb-2">Organization</th>
                <th className="pb-2">Amount</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{inv.invoice_number}</td>
                  <td className="py-2">{inv.org_name ?? "—"}</td>
                  <td className="py-2">{inr(inv.amount_cents)}</td>
                  <td className="py-2 capitalize">{inv.status}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {(["draft", "sent", "paid", "void"] as InvoiceStatus[]).map(
                        (st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => void setStatus(inv.id, st)}
                            className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase"
                          >
                            {st}
                          </button>
                        ),
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

export function QiStaffProfilesPage({
  kind,
}: {
  kind: "trainer" | "employee";
}) {
  const isTrainer = kind === "trainer";
  const pageTitle = isTrainer ? "Trainers Profile" : "QI Employees";
  const roleLabel = isTrainer ? "Trainer" : "QI Employee";
  const defaultDesignation = isTrainer ? "Trainer" : "QI Staff";
  const loginHint = isTrainer
    ? "They can sign in via Trainer Login."
    : "They can sign in via QI Staff Login.";

  const emptyForm = {
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    mobile: "",
    staffRole: kind as "trainer" | "employee",
    designation: defaultDesignation,
    qualification: "",
    education: "",
    experience: "",
    skills: "",
    photoUrl: "",
    city: "",
    state: "",
    country: "",
    pinCode: "",
    address: "",
  };

  const [rows, setRows] = useState<Profile[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  async function load() {
    const { data, error: loadError } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", kind)
      .order("created_at", { ascending: false });
    if (loadError) {
      setError(loadError.message);
      setRows([]);
      return;
    }
    const list = (data ?? []) as Profile[];
    setRows(list);
    setSelectedIds((prev) =>
      prev.filter((id) => list.some((p) => p.id === id)),
    );
  }

  useEffect(() => {
    setForm({
      ...emptyForm,
      staffRole: kind,
      designation: defaultDesignation,
    });
    setSelectedIds([]);
    setMessage(null);
    setError(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when module kind changes
  }, [kind]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (selectedIds.length === rows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((p) => p.id));
    }
  }

  function updateForm(field: keyof typeof emptyForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetPhotoState(url: string | null = null) {
    setPhotoFile(null);
    setPhotoPreview(url);
  }

  function onPhotoSelected(file: File | null) {
    if (!file) {
      resetPhotoState(form.photoUrl || null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file for the photo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo must be 5 MB or smaller.");
      return;
    }
    setError(null);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function uploadStaffPhoto(userId: string, file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `profile-photos/${userId}/photo.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("org-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) throw new Error(uploadError.message);
    const { data: pub } = supabase.storage.from("org-assets").getPublicUrl(path);
    return `${pub.publicUrl}?t=${Date.now()}`;
  }

  function formatSkills(raw: string | null | undefined) {
    return (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function truncateText(value: string | null | undefined, max = 80) {
    const text = value?.trim() || "";
    if (!text) return "—";
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  function openAddModal() {
    setError(null);
    setEditingId(null);
    setForm({
      ...emptyForm,
      staffRole: kind,
      designation: defaultDesignation,
    });
    resetPhotoState(null);
    setShowAddModal(true);
  }

  function openEditModal(p: Profile) {
    setError(null);
    setEditingId(p.id);
    setForm({
      fullName: p.full_name ?? "",
      email: p.email ?? "",
      password: "",
      confirmPassword: "",
      mobile: p.mobile ?? "",
      staffRole: kind,
      designation: p.designation ?? defaultDesignation,
      qualification: p.qualification ?? "",
      education: p.education ?? "",
      experience: p.experience ?? "",
      skills: p.skills ?? "",
      photoUrl: p.photo_url ?? "",
      city: p.city ?? "",
      state: p.state ?? "",
      country: p.country ?? "",
      pinCode: p.pin_code ?? "",
      address: p.address ?? "",
    });
    resetPhotoState(p.photo_url ?? null);
    setShowAddModal(true);
  }

  function closeModal() {
    if (saving) return;
    setShowAddModal(false);
    setEditingId(null);
    setForm({
      ...emptyForm,
      staffRole: kind,
      designation: defaultDesignation,
    });
    resetPhotoState(null);
  }

  async function setActiveStatus(id: string, isActive: boolean) {
    setError(null);
    setMessage(null);
    // Activating also approves the account so the user can actually sign in.
    // Login gate checks approval_status, not just is_active.
    const patch = isActive
      ? { is_active: true, approval_status: "approved" as const }
      : { is_active: false };
    const { error: err } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage(isActive ? "Profile activated." : "Profile deactivated.");
    await load();
  }

  async function deleteStaff(p: Profile) {
    const label = p.full_name || p.email || "this profile";
    const ok = window.confirm(
      `Delete "${label}"? This will remove their login and cannot be undone.`,
    );
    if (!ok) return;

    setError(null);
    setMessage(null);
    const { data, error: fnError } = await supabase.functions.invoke<{
      ok?: boolean;
      error?: string;
    }>("delete-trainer", {
      body: { action: "delete", userId: p.id },
    });

    if (data?.error || !data?.ok) {
      setError(data?.error ?? fnError?.message ?? "Failed to delete profile.");
      return;
    }
    if (fnError) {
      setError(fnError.message);
      return;
    }

    setMessage("Profile deleted.");
    setSelectedIds((prev) => prev.filter((id) => id !== p.id));
    await load();
  }

  async function saveStaff() {
    setError(null);
    setMessage(null);
    if (!form.fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!form.email.trim()) {
      setError("User ID (email) is required.");
      return;
    }

    if (editingId) {
      if (form.password || form.confirmPassword) {
        if (form.password !== form.confirmPassword) {
          setError("Password and Confirm Password do not match.");
          return;
        }
        if (form.password.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }
      }

      setSaving(true);
      let nextPhotoUrl = form.photoUrl.trim() || null;
      try {
        if (photoFile) {
          nextPhotoUrl = await uploadStaffPhoto(editingId, photoFile);
        }
      } catch (err) {
        setSaving(false);
        setError(
          err instanceof Error ? err.message : "Failed to upload photo.",
        );
        return;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: form.fullName.trim(),
          role: kind,
          designation: form.designation.trim() || defaultDesignation,
          qualification: form.qualification.trim() || null,
          education: form.education.trim() || null,
          experience: form.experience.trim() || null,
          skills: form.skills.trim() || null,
          photo_url: nextPhotoUrl,
          mobile: form.mobile.trim() || null,
          city: form.city.trim() || null,
          state: form.state.trim() || null,
          country: form.country.trim() || null,
          pin_code: form.pinCode.trim() || null,
          address: form.address.trim() || null,
          email: form.email.trim().toLowerCase(),
        })
        .eq("id", editingId);

      if (updateError) {
        setSaving(false);
        setError(updateError.message);
        return;
      }

      if (form.password) {
        const { data, error: fnError } = await supabase.functions.invoke<{
          ok?: boolean;
          error?: string;
        }>("delete-trainer", {
          body: {
            action: "updatePassword",
            userId: editingId,
            password: form.password,
          },
        });
        if (data?.error || !data?.ok) {
          setSaving(false);
          setError(
            data?.error ??
              fnError?.message ??
              "Profile updated, but password could not be changed.",
          );
          await load();
          return;
        }
      }

      setSaving(false);
      setMessage(`${roleLabel} profile updated.`);
      closeModal();
      await load();
      return;
    }

    if (!form.password) {
      setError("User ID (email) and password are required.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Password and Confirm Password do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSaving(true);
    const { data, error: fnError } = await supabase.functions.invoke<{
      ok?: boolean;
      userId?: string;
      error?: string;
    }>("create-trainer", {
      body: {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        mobile: form.mobile,
        designation: form.designation,
        qualification: form.qualification,
        education: form.education,
        experience: form.experience,
        skills: form.skills,
        photoUrl: form.photoUrl,
        city: form.city,
        state: form.state,
        country: form.country,
        pinCode: form.pinCode,
        address: form.address,
        staffRole: kind,
      },
    });

    if (data?.error || !data?.ok || !data.userId) {
      setSaving(false);
      setError(
        data?.error ?? fnError?.message ?? `Failed to create ${roleLabel}.`,
      );
      return;
    }
    if (fnError) {
      setSaving(false);
      setError(fnError.message);
      return;
    }

    if (photoFile) {
      try {
        const photoUrl = await uploadStaffPhoto(data.userId, photoFile);
        const { error: photoErr } = await supabase
          .from("profiles")
          .update({ photo_url: photoUrl })
          .eq("id", data.userId);
        if (photoErr) {
          setSaving(false);
          setError(
            `${roleLabel} created, but photo upload failed: ${photoErr.message}`,
          );
          await load();
          return;
        }
      } catch (err) {
        setSaving(false);
        setError(
          `${roleLabel} created, but photo upload failed: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
        );
        await load();
        return;
      }
    }

    setSaving(false);
    setMessage(
      `${roleLabel} created. ${loginHint} Use ${form.email.trim()}.`,
    );
    setForm({
      ...emptyForm,
      staffRole: kind,
      designation: defaultDesignation,
    });
    resetPhotoState(null);
    setEditingId(null);
    setShowAddModal(false);
    await load();
  }

  return (
    <div>
      <PageHeader
        title={pageTitle}
        actions={
          <button
            type="button"
            onClick={openAddModal}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Add {roleLabel}
          </button>
        }
      />
      {error && !showAddModal ? (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      ) : null}
      {message ? <p className="mb-3 text-sm text-emerald-700">{message}</p> : null}

      {showAddModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-staff-title"
        >
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="add-staff-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  {editingId ? `Edit ${roleLabel}` : `Add ${roleLabel}`}
                </h2>
              </div>
              <button title="Close" aria-label="Close"
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={closeModal}
              >
                  ×
                </button>
            </div>

            {error ? (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-12">
              <div className="lg:col-span-12">
                <p className="text-xs font-semibold text-slate-600">
                  {roleLabel} Photo
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt={`${roleLabel} preview`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">No photo</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                      onChange={(e) =>
                        onPhotoSelected(e.target.files?.[0] ?? null)
                      }
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      JPG/PNG up to 5 MB. Shown on the {isTrainer ? "trainers" : "employees"} table.
                    </p>
                    {photoPreview ? (
                      <button
                        type="button"
                        className="mt-1 text-xs font-semibold text-rose-600 hover:underline"
                        onClick={() => {
                          setPhotoFile(null);
                          setPhotoPreview(null);
                          updateForm("photoUrl", "");
                        }}
                      >
                        Remove photo
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <label className="block text-xs font-semibold text-slate-600 lg:col-span-4">
                Full Name *
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.fullName}
                  onChange={(e) => updateForm("fullName", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 lg:col-span-4">
                Designation
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.designation}
                  onChange={(e) => updateForm("designation", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 lg:col-span-4">
                Qualification
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.qualification}
                  onChange={(e) => updateForm("qualification", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-3 lg:col-span-6">
                Education
                <textarea
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="e.g. B.Tech Mechanical, IIT Delhi"
                  value={form.education}
                  onChange={(e) => updateForm("education", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-3 lg:col-span-6">
                Experience
                <textarea
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder={
                    isTrainer
                      ? "e.g. 10+ years in ISO / QMS training"
                      : "e.g. 5+ years in operations / coordination"
                  }
                  value={form.experience}
                  onChange={(e) => updateForm("experience", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-3 lg:col-span-12">
                Skills
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="Comma-separated, e.g. ISO 9001, Coordination, Reporting"
                  value={form.skills}
                  onChange={(e) => updateForm("skills", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 lg:col-span-4">
                Mobile Number
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.mobile}
                  onChange={(e) => updateForm("mobile", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 lg:col-span-4">
                User ID (Email) *
                <input
                  type="email"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal disabled:bg-slate-50"
                  value={form.email}
                  onChange={(e) => updateForm("email", e.target.value)}
                  autoComplete="off"
                  disabled={Boolean(editingId)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-3 lg:col-span-12">
                Address
                <textarea
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.address}
                  onChange={(e) => updateForm("address", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 lg:col-span-3">
                Pin Code
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.pinCode}
                  onChange={(e) => updateForm("pinCode", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 lg:col-span-3">
                City
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.city}
                  onChange={(e) => updateForm("city", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 lg:col-span-3">
                State
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.state}
                  onChange={(e) => updateForm("state", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 lg:col-span-3">
                Country
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.country}
                  onChange={(e) => updateForm("country", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-3 lg:col-span-6">
                Password {editingId ? "" : "*"}
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.password}
                  onChange={(e) => updateForm("password", e.target.value)}
                  autoComplete="new-password"
                  placeholder={
                    editingId ? "Leave blank to keep current password" : ""
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-3 lg:col-span-6">
                Confirm Password {editingId ? "" : "*"}
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.confirmPassword}
                  onChange={(e) =>
                    updateForm("confirmPassword", e.target.value)
                  }
                  autoComplete="new-password"
                  placeholder={
                    editingId ? "Leave blank to keep current password" : ""
                  }
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={closeModal}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveStaff()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving
                  ? editingId
                    ? "Saving…"
                    : "Creating…"
                  : editingId
                    ? "Save Changes"
                    : `Create ${roleLabel}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          message={`No ${isTrainer ? "trainers" : "QI employees"} yet. Click Add ${roleLabel} to create one.`}
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
                        rows.length > 0 && selectedIds.length === rows.length
                      }
                      onChange={toggleSelectAll}
                      aria-label={`Select all ${isTrainer ? "trainers" : "employees"}`}
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="w-16 border border-slate-200 px-3 py-2.5 text-center">
                    Photo
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Name
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Email
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Education
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Experience
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Skills
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
                {rows.map((p) => {
                  const designation = p.designation || defaultDesignation;
                  const skillList = formatSkills(p.skills);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          aria-label={`Select ${p.full_name || p.email}`}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        {p.photo_url ? (
                          <img
                            src={p.photo_url}
                            alt={p.full_name || roleLabel}
                            className="mx-auto h-10 w-10 rounded-full object-cover ring-1 ring-slate-200"
                          />
                        ) : (
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                            {(p.full_name || p.email || "?")
                              .slice(0, 1)
                              .toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 !text-left">
                        <div className="font-medium text-slate-900">
                          {p.full_name || "—"}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {designation}
                          {p.qualification ? ` · ${p.qualification}` : ""}
                        </div>
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <div className="text-slate-700">{p.email || "—"}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {p.mobile || "—"}
                        </div>
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 !text-left text-slate-700">
                        {truncateText(p.education || p.qualification)}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 !text-left text-slate-700">
                        {truncateText(p.experience)}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 !text-left">
                        {skillList.length === 0 ? (
                          <span className="text-slate-500">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {skillList.slice(0, 4).map((skill) => (
                              <span
                                key={skill}
                                className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700"
                              >
                                {skill}
                              </span>
                            ))}
                            {skillList.length > 4 ? (
                              <span className="text-[11px] text-slate-500">
                                +{skillList.length - 4}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        {(() => {
                          const isPending = p.approval_status === "pending";
                          const effectiveStatus = isPending
                            ? "pending"
                            : p.is_active
                              ? "active"
                              : "inactive";
                          return (
                            <select
                              className={`rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize ${
                                isPending
                                  ? "border-amber-300 bg-amber-50 text-amber-800"
                                  : p.is_active
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                    : "border-slate-300 bg-slate-50 text-slate-700"
                              }`}
                              value={effectiveStatus}
                              aria-label={`Status for ${p.full_name || p.email}`}
                              onChange={(e) => {
                                if (e.target.value === "pending") return;
                                void setActiveStatus(
                                  p.id,
                                  e.target.value === "active",
                                );
                              }}
                            >
                              {isPending ? (
                                <option value="pending">Pending approval</option>
                              ) : null}
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          );
                        })()}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            title="Edit"
                            aria-label={`Edit ${p.full_name || p.email}`}
                            onClick={() => openEditModal(p)}
                            className="rounded-md px-1.5 py-0.5 text-base leading-none hover:bg-indigo-50"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            aria-label={`Delete ${p.full_name || p.email}`}
                            onClick={() => void deleteStaff(p)}
                            className="rounded-md px-1.5 py-0.5 text-base leading-none hover:bg-rose-50"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

export function QiTrainersPage() {
  return <QiStaffProfilesPage kind="trainer" />;
}

export function QiEmployeesPage() {
  return <QiStaffProfilesPage kind="employee" />;
}

/** @deprecated Use QiTrainersPage — kept for existing imports */
export const QiApprovalsPage = QiTrainersPage;
