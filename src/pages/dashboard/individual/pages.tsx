import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
} from "@/components/dashboard-shell";
import { useWorkspaceScopedProfile as useAuth, useWorkspaceReadOnly } from "@/features/workspace/WorkspacePreview";
import { isOrgLearnerRole } from "@/lib/auth/roles";
import {
  externalMeetingHref,
  meetingPlatformLabel,
} from "@/lib/meetings/links";
import { supabase } from "@/lib/supabase/client";
import type {
  Assessment,
  AssessmentAttempt,
  Certificate,
  Enrollment,
  LearnerEducation,
  LearnerSkill,
  ProgrammeAssignment,
  TraineeEvaluation,
  TraineeEvaluationAnswer,
  TraineeEvaluationQuestion,
  TrainingProgramme,
  TrainingRequest,
  TrainingSession,
} from "@/lib/supabase/types";

export function IndividualOverviewPage() {
  const { profile } = useAuth();
  const isOrgLearner = isOrgLearnerRole(profile?.role);
  const [counts, setCounts] = useState({
    sessions: 0,
    assessments: 0,
    certificates: 0,
    ongoing: 0,
    evaluations: 0,
  });

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const [enr, attempts, certs, ongoingReq, evals] = await Promise.all([
        supabase
          .from("enrollments")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id),
        supabase
          .from("assessment_attempts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id),
        supabase
          .from("certificates")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id),
        supabase
          .from("training_requests")
          .select("id", { count: "exact", head: true })
          .contains("employee_ids", [profile.id])
          .in("status", ["approved", "hold", "scheduled"]),
        supabase
          .from("trainee_evaluations")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .in("status", ["link_sent", "in_progress", "submitted", "evaluated"]),
      ]);
      setCounts({
        sessions: enr.count ?? 0,
        assessments: attempts.count ?? 0,
        certificates: certs.count ?? 0,
        ongoing: ongoingReq.count ?? 0,
        evaluations: evals.count ?? 0,
      });
    })();
  }, [profile]);

  return (
    <div>
      <PageHeader
        title={profile?.role === "org_admin" ? "My Dashboard" : "Dashboard"}
      />
      {isOrgLearner ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Ongoing Trainings" value={counts.ongoing} />
          <StatCard label="Training Evaluation" value={counts.evaluations} />
          <StatCard label="Certificates" value={counts.certificates} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Enrolled sessions" value={counts.sessions} />
          <StatCard label="Assessment attempts" value={counts.assessments} />
          <StatCard label="Certificates" value={counts.certificates} />
        </div>
      )}
    </div>
  );
}

export function IndividualSessionsPage() {
  return <IndividualAssignedTrainingsPage />;
}

export function IndividualTrainingPlanPage() {
  const { profile } = useAuth();
  const readOnly = useWorkspaceReadOnly();
  const [requests, setRequests] = useState<TrainingRequest[]>([]);
  const [programmes, setProgrammes] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reqForm, setReqForm] = useState({
    programme_id: "",
    preferred_date: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);

  async function loadPlanData() {
    if (!profile) return;
    const [reqs, progs] = await Promise.all([
      supabase
        .from("training_requests")
        .select("*")
        .eq("requested_by", profile.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("training_programmes")
        .select("id, title")
        .eq("status", "published")
        .order("title"),
    ]);
    const list = (reqs.data ?? []) as TrainingRequest[];
    setRequests(list);
    setProgrammes((progs.data ?? []) as Array<{ id: string; title: string }>);
    setSelectedRequestIds((prev) =>
      prev.filter((id) => list.some((r) => r.id === id)),
    );
  }

  useEffect(() => {
    if (!profile?.id) return;
    void loadPlanData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  function programmeTitle(programmeId: string | null) {
    if (!programmeId) return "—";
    return programmes.find((p) => p.id === programmeId)?.title ?? "—";
  }

  function toggleRequestSelect(id: string) {
    setSelectedRequestIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAllRequests() {
    if (selectedRequestIds.length === requests.length) {
      setSelectedRequestIds([]);
    } else {
      setSelectedRequestIds(requests.map((r) => r.id));
    }
  }

  function statusBadge(status: string) {
    const styles: Record<string, string> = {
      pending: "bg-amber-50 text-amber-800 ring-amber-200",
      approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
      rejected: "bg-red-50 text-red-800 ring-red-200",
      scheduled: "bg-sky-50 text-sky-800 ring-sky-200",
    };
    const cls = styles[status] ?? "bg-slate-50 text-slate-700 ring-slate-200";
    return (
      <span
        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold capitalize ring-1 ${cls}`}
      >
        {status}
      </span>
    );
  }

  function resetRequestForm() {
    setReqForm({ programme_id: "", preferred_date: "" });
    setEditingRequestId(null);
    setError(null);
  }

  function openEditRequest(request: TrainingRequest) {
    if (readOnly) return;
    setError(null);
    setMessage(null);
    setEditingRequestId(request.id);
    setReqForm({
      programme_id: request.programme_id ?? "",
      preferred_date: request.preferred_date ?? "",
    });
    setShowRequestModal(true);
  }

  async function deleteRequest(request: TrainingRequest) {
    if (readOnly) return;
    const ok = window.confirm(
      `Delete training request for "${programmeTitle(request.programme_id)}"?`,
    );
    if (!ok) return;
    setMessage(null);
    setError(null);
    const { error: err } = await supabase
      .from("training_requests")
      .delete()
      .eq("id", request.id);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Training request deleted.");
    setSelectedRequestIds((prev) => prev.filter((id) => id !== request.id));
    await loadPlanData();
  }

  async function submitRequest() {
    setMessage(null);
    setError(null);
    if (readOnly || !profile) return;

    if (!reqForm.programme_id) {
      setError("Please select a Training Programme.");
      return;
    }
    if (!reqForm.preferred_date) {
      setError("Please select a Training Date.");
      return;
    }

    const programme = programmes.find((p) => p.id === reqForm.programme_id);

    setSubmitting(true);
    try {
      if (editingRequestId) {
        const { error: err } = await supabase
          .from("training_requests")
          .update({
            programme_id: reqForm.programme_id,
            title: `Request: ${programme?.title ?? "Training"}`,
            message: `Learner request: ${profile.full_name || profile.email || "Self"}`,
            preferred_date: reqForm.preferred_date,
            employee_ids: [profile.id],
          })
          .eq("id", editingRequestId);
        if (err) {
          setError(err.message);
          return;
        }
        setMessage("Training request updated.");
      } else {
        const { error: err } = await supabase.from("training_requests").insert({
          org_id: profile.org_id,
          programme_id: reqForm.programme_id,
          title: `Request: ${programme?.title ?? "Training"}`,
          message: `Learner request: ${profile.full_name || profile.email || "Self"}`,
          preferred_date: reqForm.preferred_date,
          requested_by: profile.id,
          employee_ids: [profile.id],
          status: "pending",
        });
        if (err) {
          setError(err.message);
          return;
        }
        setMessage("Training request sent to Quality International.");
      }
      resetRequestForm();
      setShowRequestModal(false);
      await loadPlanData();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Training Plan"
        actions={
          readOnly ? undefined : (
            <button
              type="button"
              onClick={() => {
                resetRequestForm();
                setShowRequestModal(true);
              }}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white"
            >
              Request Training
            </button>
          )
        }
      />
      {message ? (
        <p className="mb-3 text-sm text-emerald-700">{message}</p>
      ) : null}
      {error && !showRequestModal ? (
        <p className="mb-3 text-sm text-red-700">{error}</p>
      ) : null}

      {showRequestModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!submitting) {
              resetRequestForm();
              setShowRequestModal(false);
            }
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingRequestId ? "Edit Training Request" : "Request Training"}
              </h2>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  resetRequestForm();
                  setShowRequestModal(false);
                }}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-2xl leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-60"
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            {error ? (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-[3fr_1fr]">
              <label className="min-w-0 text-xs font-semibold text-slate-700">
                Training Programme
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={reqForm.programme_id}
                  onChange={(e) =>
                    setReqForm((f) => ({
                      ...f,
                      programme_id: e.target.value,
                    }))
                  }
                >
                  <option value="">Select programme</option>
                  {programmes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="min-w-0 text-xs font-semibold text-slate-700">
                Training Date
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={reqForm.preferred_date}
                  onChange={(e) =>
                    setReqForm((f) => ({
                      ...f,
                      preferred_date: e.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitRequest()}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting
                  ? editingRequestId
                    ? "Saving…"
                    : "Sending…"
                  : editingRequestId
                    ? "Save Changes"
                    : "Send Request"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  resetRequestForm();
                  setShowRequestModal(false);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <h2 className="mb-2 text-sm font-semibold">Training Requests</h2>
      {requests.length === 0 ? (
        <EmptyState message="No training requests sent yet." />
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
                        requests.length > 0 &&
                        selectedRequestIds.length === requests.length
                      }
                      onChange={toggleSelectAllRequests}
                      aria-label="Select all requests"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Programme
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Preferred Date
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Status
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Submitted
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedRequestIds.includes(r.id)}
                        onChange={() => toggleRequestSelect(r.id)}
                        aria-label={`Select ${programmeTitle(r.programme_id)}`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium text-slate-900">
                      {programmeTitle(r.programme_id)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {r.preferred_date
                        ? new Date(r.preferred_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      {statusBadge(r.status)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      {readOnly ? (
                        <span className="text-xs text-slate-400">View only</span>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditRequest(r)}
                            title="Edit"
                            aria-label="Edit request"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-base leading-none hover:bg-slate-50"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteRequest(r)}
                            title="Delete"
                            aria-label="Delete request"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-base leading-none hover:bg-rose-100"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
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

export function IndividualProgrammeRequestPage() {
  const { profile } = useAuth();
  const readOnly = useWorkspaceReadOnly();
  const [submittedProgrammes, setSubmittedProgrammes] = useState<
    TrainingProgramme[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showProgrammeModal, setShowProgrammeModal] = useState(false);
  const [editingProgrammeId, setEditingProgrammeId] = useState<string | null>(
    null,
  );
  const [programmeSubmitting, setProgrammeSubmitting] = useState(false);
  const [programmeError, setProgrammeError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [programmeForm, setProgrammeForm] = useState({
    title: "",
    description: "",
    category: "",
    duration_hours: "8",
    delivery_mode: "onsite",
    submission_notes: "",
  });

  async function loadSubmitted() {
    if (!profile?.id) return;
    const { data } = await supabase
      .from("training_programmes")
      .select("*")
      .eq("submitted_by_user_id", profile.id)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as TrainingProgramme[];
    setSubmittedProgrammes(list);
    setSelectedIds((prev) =>
      prev.filter((id) => list.some((p) => p.id === id)),
    );
  }

  useEffect(() => {
    if (!profile?.id) return;
    void loadSubmitted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  function resetProgrammeForm() {
    setProgrammeForm({
      title: "",
      description: "",
      category: "",
      duration_hours: "8",
      delivery_mode: "onsite",
      submission_notes: "",
    });
    setEditingProgrammeId(null);
    setProgrammeError(null);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (selectedIds.length === submittedProgrammes.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(submittedProgrammes.map((p) => p.id));
    }
  }

  function openEditProgramme(programme: TrainingProgramme) {
    if (readOnly) return;
    if (programme.status !== "draft") {
      setError("Only pending programmes can be edited.");
      return;
    }
    setError(null);
    setMessage(null);
    setEditingProgrammeId(programme.id);
    setProgrammeForm({
      title: programme.title,
      description: programme.description ?? "",
      category: programme.category ?? "",
      duration_hours: String(programme.duration_hours ?? "8"),
      delivery_mode: programme.delivery_mode || "onsite",
      submission_notes: programme.submission_notes ?? "",
    });
    setShowProgrammeModal(true);
  }

  async function deleteProgramme(programme: TrainingProgramme) {
    if (readOnly) return;
    if (programme.status !== "draft") {
      setError("Only pending programmes can be deleted.");
      return;
    }
    const ok = window.confirm(`Delete programme "${programme.title}"?`);
    if (!ok) return;
    setError(null);
    setMessage(null);
    const { error: err } = await supabase
      .from("training_programmes")
      .delete()
      .eq("id", programme.id);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Programme deleted.");
    setSelectedIds((prev) => prev.filter((id) => id !== programme.id));
    await loadSubmitted();
  }

  async function submitProgramme() {
    setProgrammeError(null);
    setMessage(null);
    setError(null);
    if (readOnly || !profile) return;
    if (!programmeForm.title.trim()) {
      setProgrammeError("Please enter a programme title.");
      return;
    }
    if (!programmeForm.description.trim()) {
      setProgrammeError("Please enter a programme description.");
      return;
    }

    const payload = {
      title: programmeForm.title.trim(),
      description: programmeForm.description.trim(),
      category: programmeForm.category.trim() || null,
      duration_hours: Number(programmeForm.duration_hours) || null,
      delivery_mode: programmeForm.delivery_mode,
      submission_notes: programmeForm.submission_notes.trim(),
    };

    setProgrammeSubmitting(true);
    try {
      if (editingProgrammeId) {
        const { error: err } = await supabase
          .from("training_programmes")
          .update(payload)
          .eq("id", editingProgrammeId);
        if (err) {
          setProgrammeError(err.message);
          return;
        }
        setMessage("Programme updated.");
      } else {
        const { error: err } = await supabase.from("training_programmes").insert({
          ...payload,
          submitted_by_user_id: profile.id,
          submitted_by_org_id: null,
          created_by: profile.id,
          status: "draft",
          price_cents: 0,
        });
        if (err) {
          setProgrammeError(err.message);
          return;
        }
        setMessage(
          "Programme submitted to Quality International for review and go-live.",
        );
      }
      resetProgrammeForm();
      setShowProgrammeModal(false);
      await loadSubmitted();
    } finally {
      setProgrammeSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Programme Request"
        actions={
          readOnly ? undefined : (
            <button
              type="button"
              onClick={() => {
                resetProgrammeForm();
                setShowProgrammeModal(true);
              }}
              className="rounded-lg border border-amber-500 bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
            >
              Submit Programme
            </button>
          )
        }
      />
      {message ? (
        <p className="mb-3 text-sm text-emerald-700">{message}</p>
      ) : null}
      {error && !showProgrammeModal ? (
        <p className="mb-3 text-sm text-red-700">{error}</p>
      ) : null}

      {showProgrammeModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!programmeSubmitting) {
              resetProgrammeForm();
              setShowProgrammeModal(false);
            }
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingProgrammeId
                  ? "Edit Training Programme"
                  : "Submit Training Programme"}
              </h2>
              <button
                type="button"
                disabled={programmeSubmitting}
                onClick={() => {
                  resetProgrammeForm();
                  setShowProgrammeModal(false);
                }}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-2xl leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-60"
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>
            {programmeError ? (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {programmeError}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                Programme Title
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={programmeForm.title}
                  onChange={(e) =>
                    setProgrammeForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="e.g. GLP Awareness"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                Description
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  rows={3}
                  value={programmeForm.description}
                  onChange={(e) =>
                    setProgrammeForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  placeholder="What should this programme cover?"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Category
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={programmeForm.category}
                  onChange={(e) =>
                    setProgrammeForm((f) => ({ ...f, category: e.target.value }))
                  }
                  placeholder="Compliance / Quality / Safety"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Duration (hours)
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={programmeForm.duration_hours}
                  onChange={(e) =>
                    setProgrammeForm((f) => ({
                      ...f,
                      duration_hours: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Preferred Delivery Mode
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={programmeForm.delivery_mode}
                  onChange={(e) =>
                    setProgrammeForm((f) => ({
                      ...f,
                      delivery_mode: e.target.value,
                    }))
                  }
                >
                  <option value="onsite">Onsite</option>
                  <option value="online">Online</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                Notes for Quality International
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  rows={2}
                  value={programmeForm.submission_notes}
                  onChange={(e) =>
                    setProgrammeForm((f) => ({
                      ...f,
                      submission_notes: e.target.value,
                    }))
                  }
                  placeholder="Any special requirements or audience details"
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={programmeSubmitting}
                onClick={() => void submitProgramme()}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {programmeSubmitting
                  ? editingProgrammeId
                    ? "Saving…"
                    : "Submitting…"
                  : editingProgrammeId
                    ? "Save Changes"
                    : "Send to QI"}
              </button>
              <button
                type="button"
                disabled={programmeSubmitting}
                onClick={() => {
                  resetProgrammeForm();
                  setShowProgrammeModal(false);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <h2 className="mb-2 text-sm font-semibold">Submitted Programmes</h2>
      {submittedProgrammes.length === 0 ? (
        <EmptyState message="No programmes submitted yet. Use Submit Programme to propose one." />
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
                        submittedProgrammes.length > 0 &&
                        selectedIds.length === submittedProgrammes.length
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
                    Status
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {submittedProgrammes.map((p) => {
                  const canEdit = !readOnly && p.status === "draft";
                  return (
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
                        {p.title}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                        {p.category ?? "—"}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                        {p.duration_hours ?? "—"} hrs
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center capitalize text-slate-700">
                        {p.delivery_mode}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold capitalize ring-1 ${
                            p.status === "published"
                              ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                              : p.status === "archived"
                                ? "bg-slate-50 text-slate-700 ring-slate-200"
                                : "bg-amber-50 text-amber-800 ring-amber-200"
                          }`}
                        >
                          {p.status === "draft" ? "Pending QI" : p.status}
                        </span>
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditProgramme(p)}
                            disabled={!canEdit}
                            title={
                              canEdit
                                ? "Edit"
                                : "Only pending programmes can be edited"
                            }
                            aria-label="Edit programme"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-base leading-none hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteProgramme(p)}
                            disabled={!canEdit}
                            title={
                              canEdit
                                ? "Delete"
                                : "Only pending programmes can be deleted"
                            }
                            aria-label="Delete programme"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-base leading-none hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
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

type InviteNotice = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  meetingPassword: string | null;
  sessionId: string | null;
  createdAt: string | null;
  readAt: string | null;
};

type AssignedRow = {
  id: string;
  programme: string;
  date: string | null;
  status: string;
  location: string | null;
  meeting_platform: string | null;
  meeting_link: string | null;
  meeting_password: string | null;
  requestId: string | null;
  sessionId: string | null;
  invitations: InviteNotice[];
};

function assignedPlatformLabel(
  platform: string | null | undefined,
  location: string | null | undefined,
) {
  if (platform === "in_app") return "Online Meeting";
  const label = meetingPlatformLabel(platform);
  return label !== "—" ? label : location || "—";
}

function externalJoinHref(raw: string | null | undefined): string | null {
  const href = externalMeetingHref(raw);
  if (!href || !/^https?:\/\//i.test(href)) return null;
  return href;
}

export function IndividualAssignedTrainingsPage() {
  const { profile } = useAuth();
  const ongoingOnly = isOrgLearnerRole(profile?.role);
  const pageTitle = ongoingOnly ? "Ongoing Trainings" : "Assigned Trainings";
  const [rows, setRows] = useState<AssignedRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewInvites, setViewInvites] = useState<InviteNotice[] | null>(null);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const [
        { data: enrollments },
        { data: assignments },
        { data: requestRows },
        { data: notices },
      ] = await Promise.all([
        supabase
          .from("enrollments")
          .select("*")
          .eq("user_id", profile.id)
          .in("status", ["enrolled", "attended"]),
        supabase
          .from("programme_assignments")
          .select("*")
          .eq("user_id", profile.id)
          .eq("status", "active"),
        supabase
          .from("training_requests")
          .select("*")
          .contains("employee_ids", [profile.id])
          .in("status", ["approved", "hold", "scheduled", "completed"])
          .order("updated_at", { ascending: false }),
        supabase
          .from("app_notifications")
          .select("id, kind, title, body, link, metadata, created_at, read_at")
          .eq("user_id", profile.id)
          .in("kind", [
            "training_invitation",
            "evaluation_invite",
            "payment_link",
            "training_assignment",
            "certificate_issued",
          ])
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const noticeList =
        ((notices ?? []) as Array<{
          id: string;
          kind: string;
          title: string;
          body: string;
          link: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string | null;
          read_at: string | null;
        }>) ?? [];

      // Assignment banners are informational only — keep table rows clean.
      const assignmentIds = noticeList
        .filter((n) => n.kind === "training_assignment" && !n.read_at)
        .map((n) => n.id);
      if (assignmentIds.length > 0) {
        void supabase
          .from("app_notifications")
          .update({ read_at: new Date().toISOString() })
          .in("id", assignmentIds);
      }

      const enrollmentList = (enrollments ?? []) as Enrollment[];
      const assignmentList = (assignments ?? []) as ProgrammeAssignment[];
      const requests = (requestRows ?? []) as TrainingRequest[];
      const sessionIds = [
        ...new Set(
          [
            ...enrollmentList.map((e) => e.session_id),
            ...requests
              .map((r) => r.session_id)
              .filter((id): id is string => Boolean(id)),
          ].filter(Boolean),
        ),
      ];
      const programmeIds = [
        ...new Set(
          [
            ...assignmentList.map((a) => a.programme_id),
            ...requests
              .map((r) => r.programme_id)
              .filter((id): id is string => Boolean(id)),
          ].filter(Boolean),
        ),
      ];

      const [{ data: sessions }, { data: programmes }] = await Promise.all([
        sessionIds.length
          ? supabase.from("training_sessions").select("*").in("id", sessionIds)
          : Promise.resolve({ data: [] as TrainingSession[] }),
        programmeIds.length
          ? supabase
              .from("training_programmes")
              .select("id, title")
              .in("id", programmeIds)
          : Promise.resolve({
              data: [] as Array<{ id: string; title: string }>,
            }),
      ]);

      const sessionMap = new Map(
        ((sessions ?? []) as TrainingSession[]).map((s) => [s.id, s]),
      );
      const programmeMap = new Map(
        ((programmes ?? []) as Array<{ id: string; title: string }>).map(
          (p) => [p.id, p.title],
        ),
      );

      const next: AssignedRow[] = [];
      const enrolledSessionIds = new Set(
        enrollmentList.map((e) => e.session_id),
      );
      const seenProgrammeIds = new Set<string>();

      // Active enrollments always appear here — even if the session/request
      // was marked completed on the QI side (trainee still has join access).
      for (const e of enrollmentList) {
        const session = sessionMap.get(e.session_id);
        if (session?.programme_id) seenProgrammeIds.add(session.programme_id);
        const linkedRequest = requests.find((r) => r.session_id === e.session_id);
        next.push({
          id: `enr-${e.id}`,
          programme: session?.title ?? "Session",
          date: session?.starts_at ?? null,
          status: e.status,
          location: session?.location ?? null,
          meeting_platform: session?.meeting_platform ?? null,
          meeting_link: session?.meeting_link ?? null,
          meeting_password: session?.meeting_password ?? null,
          requestId: linkedRequest?.id ?? null,
          sessionId: e.session_id,
          invitations: [],
        });
      }

      for (const r of requests) {
        // Skip finished requests unless the individual still has no enrollment
        // row (assignment-only) — then keep showing until they have a session.
        if (r.status === "completed") {
          if (ongoingOnly) continue;
          // Individual Assigned: still show completed assignment if no enrollment
          // was created yet (invite not sent).
          const alreadyEnrolled =
            (r.session_id && enrolledSessionIds.has(r.session_id)) ||
            (r.programme_id && seenProgrammeIds.has(r.programme_id));
          if (alreadyEnrolled) continue;
        }
        const session = r.session_id ? sessionMap.get(r.session_id) : null;
        if (session && enrolledSessionIds.has(session.id)) continue;
        if (r.programme_id) seenProgrammeIds.add(r.programme_id);
        const title =
          (r.programme_id && programmeMap.get(r.programme_id)) ||
          r.title.replace(/^(Request|Assigned):\s*/i, "") ||
          "Training";
        next.push({
          id: `req-${r.id}`,
          programme: title,
          date: session?.starts_at ?? r.training_date,
          status: r.status,
          location: session?.location ?? null,
          meeting_platform: session?.meeting_platform ?? null,
          meeting_link: session?.meeting_link ?? null,
          meeting_password: session?.meeting_password ?? null,
          requestId: r.id,
          sessionId: r.session_id,
          invitations: [],
        });
      }

      for (const a of assignmentList) {
        if (seenProgrammeIds.has(a.programme_id)) continue;
        next.push({
          id: `asg-${a.id}`,
          programme: programmeMap.get(a.programme_id) ?? "Programme",
          date: a.assigned_at,
          status: a.status,
          location: null,
          meeting_platform: null,
          meeting_link: null,
          meeting_password: null,
          requestId: null,
          sessionId: null,
          invitations: [],
        });
      }

      next.sort((a, b) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return ta - tb;
      });

      const usedInvitationIds = new Set<string>();

      function attachNoticeToRow(
        n: (typeof noticeList)[number],
        row: AssignedRow,
        extras?: Partial<InviteNotice>,
      ) {
        if (usedInvitationIds.has(n.id)) return;
        if (row.invitations.some((x) => x.id === n.id)) return;
        const meta = n.metadata ?? {};
        row.invitations.push({
          id: n.id,
          kind: n.kind,
          title: n.title,
          body: n.body,
          link: extras?.link ?? n.link,
          meetingPassword:
            extras?.meetingPassword ??
            (typeof meta.meeting_password === "string"
              ? meta.meeting_password
              : null),
          sessionId:
            extras?.sessionId ??
            (typeof meta.session_id === "string" ? meta.session_id : null),
          createdAt: n.created_at,
          readAt: n.read_at,
        });
        usedInvitationIds.add(n.id);
      }

      function findRowForNotice(n: (typeof noticeList)[number]) {
        const meta = n.metadata ?? {};
        const requestId =
          typeof meta.training_request_id === "string"
            ? meta.training_request_id
            : null;
        const sessionId =
          typeof meta.session_id === "string" ? meta.session_id : null;
        const session = sessionId ? sessionMap.get(sessionId) : null;

        if (requestId) {
          const byRequest = next.find((r) => r.requestId === requestId);
          if (byRequest) return byRequest;
          // Enrollment may have replaced the request row after invite was sent
          if (sessionId) {
            const bySession = next.find((r) => r.sessionId === sessionId);
            if (bySession) return bySession;
          }
        }
        if (sessionId) {
          const bySession = next.find((r) => r.sessionId === sessionId);
          if (bySession) return bySession;
        }
        if (session) {
          const byMeeting = next.find(
            (r) =>
              (r.meeting_link &&
                session.meeting_link &&
                r.meeting_link === session.meeting_link) ||
              r.programme === session.title,
          );
          if (byMeeting) return byMeeting;
        }
        return next.find(
          (r) =>
            r.programme &&
            (n.title.includes(r.programme) || n.body.includes(r.programme)),
        );
      }

      for (const n of noticeList) {
        if (n.kind === "training_assignment") continue;
        const row = findRowForNotice(n);
        if (!row) continue;
        const meta = n.metadata ?? {};
        const sessionId =
          typeof meta.session_id === "string" ? meta.session_id : null;
        const session = sessionId ? sessionMap.get(sessionId) : null;
        attachNoticeToRow(n, row, {
          link: n.link || row.meeting_link || session?.meeting_link || null,
          meetingPassword:
            (typeof meta.meeting_password === "string"
              ? meta.meeting_password
              : null) ||
            row.meeting_password ||
            session?.meeting_password ||
            null,
          sessionId,
        });
      }

      setRows(next);
      setSelectedIds((prev) =>
        prev.filter((id) => next.some((r) => r.id === id)),
      );
    })();
  }, [profile?.id, ongoingOnly]);

  async function dismissInvitation(noticeId: string) {
    const readAt = new Date().toISOString();
    await supabase
      .from("app_notifications")
      .update({ read_at: readAt })
      .eq("id", noticeId);
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        invitations: r.invitations.map((x) =>
          x.id === noticeId ? { ...x, readAt } : x,
        ),
      })),
    );
    setViewInvites((prev) =>
      prev
        ? prev.map((x) => (x.id === noticeId ? { ...x, readAt } : x))
        : prev,
    );
  }

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

  return (
    <div>
      <PageHeader title={pageTitle} />
      {rows.length === 0 ? (
        <EmptyState message="No assigned trainings yet." />
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
                      aria-label="Select all assigned trainings"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Title
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Date & Time
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Platform
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Status
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Join
                  </th>
                  <th className="min-w-[220px] border border-slate-200 px-3 py-2.5 text-center">
                    Invitations & Notifications
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const invites = r.invitations;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          aria-label={`Select ${r.programme}`}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium text-slate-900">
                        {r.programme}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                        {r.date
                          ? new Date(r.date).toLocaleString("en-IN")
                          : "TBD"}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                        {assignedPlatformLabel(r.meeting_platform, r.location)}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center capitalize text-slate-700">
                        {r.status}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        {(() => {
                          const href = externalJoinHref(r.meeting_link);
                          if (!href) {
                            return <span className="text-slate-400">—</span>;
                          }
                          return (
                            <div className="inline-flex flex-col items-center gap-1">
                              <a
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                              >
                                Join Meeting
                              </a>
                              {r.meeting_password ? (
                                <span className="text-[11px] text-slate-500">
                                  Password:{" "}
                                  <span className="font-semibold text-slate-700">
                                    {r.meeting_password}
                                  </span>
                                </span>
                              ) : null}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        {invites.length > 0 ? (
                          <button
                            type="button"
                            className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                            onClick={() => setViewInvites(invites)}
                          >
                            View ({invites.length})
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {viewInvites && viewInvites.length > 0 ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">
                Invitations & Notifications
              </h2>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => setViewInvites(null)}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>
            <div className="space-y-4">
              {viewInvites.map((viewInvite) => {
                const joinHref = externalJoinHref(viewInvite.link);
                const isAppLink = Boolean(viewInvite.link?.startsWith("/"));
                const kindLabel =
                  viewInvite.kind === "training_invitation"
                    ? "Invitation"
                    : viewInvite.kind === "payment_link"
                      ? "Payment"
                      : viewInvite.kind === "evaluation_invite"
                        ? "Evaluation"
                        : viewInvite.kind === "certificate_issued"
                          ? "Certificate"
                          : "Notification";
                return (
                  <div
                    key={viewInvite.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        {kindLabel}
                      </span>
                      {viewInvite.createdAt ? (
                        <span className="text-[11px] text-slate-400">
                          {new Date(viewInvite.createdAt).toLocaleString(
                            "en-IN",
                          )}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {viewInvite.title}
                    </h3>
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                      {viewInvite.body}
                    </p>
                    {viewInvite.meetingPassword && joinHref ? (
                      <p className="mt-3 text-sm text-slate-600">
                        Meeting password:{" "}
                        <span className="font-semibold text-slate-900">
                          {viewInvite.meetingPassword}
                        </span>
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      {joinHref ? (
                        <a
                          href={joinHref}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          Join Meeting
                        </a>
                      ) : null}
                      {isAppLink && viewInvite.link ? (
                        <Link
                          to={viewInvite.link}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                        >
                          Open
                        </Link>
                      ) : null}
                      {!viewInvite.readAt ? (
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => void dismissInvitation(viewInvite.id)}
                        >
                          Mark as read
                        </button>
                      ) : (
                        <span className="self-center text-[11px] text-slate-400">
                          Read
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type CompletedRow = {
  id: string;
  programme: string;
  trainingDate: string | null;
  certificateTitle: string | null;
  certificatePath: string | null;
  issuedAt: string | null;
};

export function IndividualCompletedTrainingsPage() {
  const { profile } = useAuth();
  const pageTitle = isOrgLearnerRole(profile?.role)
    ? "Training Conducted"
    : "Completed Trainings";
  const [rows, setRows] = useState<CompletedRow[]>([]);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const [
        { data: enrollments },
        { data: activeEnrollments },
        { data: certificates },
        { data: requestRows },
      ] = await Promise.all([
        supabase
          .from("enrollments")
          .select("*")
          .eq("user_id", profile.id)
          .eq("status", "completed"),
        supabase
          .from("enrollments")
          .select("session_id")
          .eq("user_id", profile.id)
          .in("status", ["enrolled", "attended"]),
        supabase
          .from("certificates")
          .select("*")
          .eq("user_id", profile.id)
          .order("issued_at", { ascending: false }),
        supabase
          .from("training_requests")
          .select("*")
          .contains("employee_ids", [profile.id])
          .eq("status", "completed")
          .order("updated_at", { ascending: false }),
      ]);

      const enrollmentList = (enrollments ?? []) as Enrollment[];
      const activeSessionIds = new Set(
        ((activeEnrollments ?? []) as Array<{ session_id: string }>).map(
          (e) => e.session_id,
        ),
      );
      const certList = (certificates ?? []) as Certificate[];
      const requests = (requestRows ?? []) as TrainingRequest[];
      const sessionIds = [
        ...new Set([
          ...enrollmentList.map((e) => e.session_id),
          ...certList
            .map((c) => c.session_id)
            .filter((id): id is string => Boolean(id)),
          ...requests
            .map((r) => r.session_id)
            .filter((id): id is string => Boolean(id)),
        ]),
      ];
      const programmeIds = [
        ...new Set([
          ...certList
            .map((c) => c.programme_id)
            .filter((id): id is string => Boolean(id)),
          ...requests
            .map((r) => r.programme_id)
            .filter((id): id is string => Boolean(id)),
        ]),
      ];

      const [{ data: sessions }, { data: programmes }] = await Promise.all([
        sessionIds.length
          ? supabase.from("training_sessions").select("*").in("id", sessionIds)
          : Promise.resolve({ data: [] as TrainingSession[] }),
        programmeIds.length
          ? supabase
              .from("training_programmes")
              .select("id, title")
              .in("id", programmeIds)
          : Promise.resolve({
              data: [] as Array<{ id: string; title: string }>,
            }),
      ]);

      const sessionMap = new Map(
        ((sessions ?? []) as TrainingSession[]).map((s) => [s.id, s]),
      );
      const programmeMap = new Map(
        ((programmes ?? []) as Array<{ id: string; title: string }>).map((p) => [
          p.id,
          p.title,
        ]),
      );

      const bySessionCert = new Map(
        certList
          .filter((c) => c.session_id)
          .map((c) => [c.session_id as string, c]),
      );

      const completed: CompletedRow[] = [];
      const seenSessions = new Set<string>();
      const seenProgrammes = new Set<string>();

      for (const e of enrollmentList) {
        seenSessions.add(e.session_id);
        const session = sessionMap.get(e.session_id);
        if (session?.programme_id) seenProgrammes.add(session.programme_id);
        const cert = bySessionCert.get(e.session_id);
        const programmeTitle =
          (cert?.programme_id
            ? programmeMap.get(cert.programme_id)
            : null) ||
          session?.title ||
          cert?.title ||
          "Training";
        completed.push({
          id: `enr-${e.id}`,
          programme: programmeTitle,
          trainingDate:
            session?.starts_at ?? session?.ends_at ?? cert?.issued_at ?? null,
          certificateTitle: cert?.title ?? null,
          certificatePath: cert?.storage_path ?? null,
          issuedAt: cert?.issued_at ?? null,
        });
      }

      for (const r of requests) {
        // Still on Assigned/Ongoing via active enrollment — don't duplicate here.
        if (r.session_id && activeSessionIds.has(r.session_id)) continue;
        if (r.session_id && seenSessions.has(r.session_id)) continue;
        if (r.programme_id && seenProgrammes.has(r.programme_id)) continue;
        if (r.programme_id) seenProgrammes.add(r.programme_id);
        const title =
          (r.programme_id && programmeMap.get(r.programme_id)) ||
          r.title.replace(/^(Request|Assigned):\s*/i, "") ||
          "Training";
        completed.push({
          id: `req-${r.id}`,
          programme: title,
          trainingDate: r.training_date,
          certificateTitle: null,
          certificatePath: null,
          issuedAt: null,
        });
      }

      for (const c of certList) {
        if (c.session_id && seenSessions.has(c.session_id)) continue;
        if (c.session_id && activeSessionIds.has(c.session_id)) continue;
        const session = c.session_id ? sessionMap.get(c.session_id) : null;
        completed.push({
          id: `cert-${c.id}`,
          programme:
            (c.programme_id ? programmeMap.get(c.programme_id) : null) ||
            session?.title ||
            c.title,
          trainingDate:
            session?.starts_at ?? session?.ends_at ?? c.issued_at,
          certificateTitle: c.title,
          certificatePath: c.storage_path,
          issuedAt: c.issued_at,
        });
      }

      completed.sort((a, b) => {
        const ta = a.trainingDate ? new Date(a.trainingDate).getTime() : 0;
        const tb = b.trainingDate ? new Date(b.trainingDate).getTime() : 0;
        return tb - ta;
      });
      setRows(completed);
    })();
  }, [profile?.id]);

  return (
    <div>
      <PageHeader title={pageTitle} />
      {rows.length === 0 ? (
        <EmptyState
          message={
            isOrgLearnerRole(profile?.role)
              ? "No conducted trainings yet."
              : "No completed trainings yet."
          }
        />
      ) : (
        <Panel className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Training Programme
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Date of Training
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Certificate Issued
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Training Certificate
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium text-slate-900">
                      {r.programme}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {r.trainingDate
                        ? new Date(r.trainingDate).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {r.issuedAt
                        ? new Date(r.issuedAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {r.certificateTitle || r.certificatePath ? (
                        <span className="font-medium text-emerald-700">
                          {r.certificatePath
                            ? "Available"
                            : r.certificateTitle ?? "Issued"}
                        </span>
                      ) : (
                        <span className="text-amber-700">Pending</span>
                      )}
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

export function IndividualAssessmentsPage() {
  const { profile } = useAuth();
  const readOnly = useWorkspaceReadOnly();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [attempts, setAttempts] = useState<AssessmentAttempt[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!profile) return;
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("session_id")
      .eq("user_id", profile.id);
    const sessionIds = (enrollments ?? []).map((e) => e.session_id);
    if (!sessionIds.length) {
      setAssessments([]);
      setAttempts([]);
      return;
    }
    const [{ data: a }, { data: t }] = await Promise.all([
      supabase.from("assessments").select("*").in("session_id", sessionIds),
      supabase
        .from("assessment_attempts")
        .select("*")
        .eq("user_id", profile.id),
    ]);
    setAssessments(a ?? []);
    setAttempts(t ?? []);
  }

  useEffect(() => {
    void load();
  }, [profile?.id]);

  async function submitAttempt(assessment: Assessment) {
    if (readOnly || !profile) return;
    setMessage(null);
    const score = Math.floor(60 + Math.random() * 40);
    const passed = score >= assessment.passing_score;
    const existing = attempts.find((x) => x.assessment_id === assessment.id);
    if (existing) {
      const { error } = await supabase
        .from("assessment_attempts")
        .update({ score, passed, submitted_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) setMessage(error.message);
    } else {
      const { error } = await supabase.from("assessment_attempts").insert({
        assessment_id: assessment.id,
        user_id: profile.id,
        score,
        passed,
      });
      if (error) setMessage(error.message);
    }
    await load();
  }

  const attemptByAssessment = new Map(
    attempts.map((a) => [a.assessment_id, a]),
  );

  return (
    <div>
      <PageHeader title="Assessments" />
      {message ? <p className="mb-3 text-sm text-red-600">{message}</p> : null}
      {assessments.length === 0 ? (
        <EmptyState message="No assessments available for your enrollments." />
      ) : (
        <div className="grid gap-3">
          {assessments.map((a) => {
            const attempt = attemptByAssessment.get(a.id);
            return (
              <Panel
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-xs text-slate-500">
                    Passing score: {a.passing_score}
                    {attempt
                      ? ` · Last score: ${attempt.score} (${attempt.passed ? "passed" : "failed"})`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => void submitAttempt(a)}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {attempt ? "Retake" : "Attempt"}
                </button>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function IndividualCertificatesPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Certificate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewCert, setViewCert] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [detailBusyId, setDetailBusyId] = useState<string | null>(null);
  const [trainingDetail, setTrainingDetail] = useState<{
    certificate: Certificate;
    programmeTitle: string;
    trainingCode: string | null;
    trainingDate: string | null;
    trainerName: string | null;
    status: string | null;
    score: number | null;
    maxScore: number | null;
    passed: boolean | null;
    submittedAt: string | null;
    evaluatedAt: string | null;
    effectiveness: string | null;
    questions: TraineeEvaluationQuestion[];
    answers: TraineeEvaluationAnswer[];
  } | null>(null);

  useEffect(() => {
    if (!profile) return;
    void supabase
      .from("certificates")
      .select("*")
      .eq("user_id", profile.id)
      .order("issued_at", { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as Certificate[];
        setRows(list);
        setSelectedIds((prev) =>
          prev.filter((id) => list.some((c) => c.id === id)),
        );
      });
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
      setSelectedIds(rows.map((c) => c.id));
    }
  }

  async function getSignedUrl(cert: Certificate) {
    if (!cert.storage_path) {
      throw new Error("Certificate file is not available.");
    }
    const { data, error: urlErr } = await supabase.storage
      .from("certificates")
      .createSignedUrl(cert.storage_path, 60 * 30);
    if (urlErr || !data?.signedUrl) {
      throw new Error(urlErr?.message || "Could not open certificate file.");
    }
    return data.signedUrl;
  }

  async function openTrainingDetail(cert: Certificate) {
    if (!profile) return;
    setError(null);
    setDetailBusyId(cert.id);
    try {
      let evalQuery = supabase
        .from("trainee_evaluations")
        .select("*")
        .eq("user_id", profile.id)
        .order("updated_at", { ascending: false })
        .limit(5);

      if (cert.programme_id) {
        evalQuery = evalQuery.eq("programme_id", cert.programme_id);
      }
      if (cert.session_id) {
        evalQuery = evalQuery.eq("session_id", cert.session_id);
      }

      const { data: evalRows, error: evalErr } = await evalQuery;
      if (evalErr) throw new Error(evalErr.message);

      let evaluation = ((evalRows ?? [])[0] ?? null) as TraineeEvaluation | null;

      // Fallback: same programme title if ids were not linked on certificate
      if (!evaluation && cert.programme_id == null) {
        const { data: allEvals } = await supabase
          .from("trainee_evaluations")
          .select("*")
          .eq("user_id", profile.id)
          .order("updated_at", { ascending: false })
          .limit(20);
        evaluation = ((allEvals ?? [])[0] ?? null) as TraineeEvaluation | null;
      }

      let request: TrainingRequest | null = null;
      let programmeTitle = cert.title.replace(/^Certificate\s*[—–-]\s*/i, "");
      let trainerName: string | null = null;

      if (evaluation?.training_request_id) {
        const { data: req } = await supabase
          .from("training_requests")
          .select("*")
          .eq("id", evaluation.training_request_id)
          .maybeSingle();
        request = (req as TrainingRequest | null) ?? null;
      }

      if (evaluation?.programme_id || cert.programme_id) {
        const progId = evaluation?.programme_id || cert.programme_id;
        const { data: prog } = await supabase
          .from("training_programmes")
          .select("id, title")
          .eq("id", progId!)
          .maybeSingle();
        if ((prog as TrainingProgramme | null)?.title) {
          programmeTitle = (prog as TrainingProgramme).title;
        }
      }

      if (request?.trainer_id) {
        const { data: trainer } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", request.trainer_id)
          .maybeSingle();
        trainerName =
          (trainer as { full_name?: string | null; email?: string | null } | null)
            ?.full_name?.trim() ||
          (trainer as { email?: string | null } | null)?.email ||
          null;
      }

      setTrainingDetail({
        certificate: cert,
        programmeTitle,
        trainingCode: request?.training_code ?? null,
        trainingDate: request?.training_date ?? null,
        trainerName,
        status: evaluation?.status ?? null,
        score: evaluation?.score ?? null,
        maxScore: evaluation?.max_score ?? null,
        passed: evaluation?.passed ?? null,
        submittedAt: evaluation?.submitted_at ?? null,
        evaluatedAt: evaluation?.evaluated_at ?? null,
        effectiveness: evaluation?.effectiveness_rating ?? null,
        questions: evaluation?.questions ?? [],
        answers: evaluation?.answers ?? [],
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not load training / answer sheet.",
      );
    } finally {
      setDetailBusyId(null);
    }
  }

  async function viewCertificate(cert: Certificate) {
    setError(null);
    setBusyId(cert.id);
    try {
      const url = await getSignedUrl(cert);
      setViewCert({ title: cert.title, url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open certificate.");
    } finally {
      setBusyId(null);
    }
  }

  async function downloadCertificate(cert: Certificate) {
    setError(null);
    setBusyId(cert.id);
    try {
      const url = await getSignedUrl(cert);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Download failed.");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const fileName =
        cert.storage_path?.split("/").pop() ||
        `${cert.title.replace(/[^\w\-]+/g, "_")}.html`;
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not download certificate.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function downloadSelected() {
    const selected = rows.filter((c) => selectedIds.includes(c.id));
    for (const cert of selected) {
      if (!cert.storage_path) continue;
      await downloadCertificate(cert);
    }
  }

  function renderTitleLink(c: Certificate) {
    const loading = detailBusyId === c.id;
    return (
      <button
        type="button"
        onClick={() => void openTrainingDetail(c)}
        disabled={loading}
        className="text-left font-medium text-indigo-700 underline-offset-2 hover:underline disabled:opacity-60"
        title="View answer sheet and training details"
      >
        {loading ? "Loading…" : c.title}
      </button>
    );
  }

  return (
    <div>
      <PageHeader
        title="Certificates"
        actions={
          selectedIds.length > 0 ? (
            <button
              type="button"
              onClick={() => void downloadSelected()}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Download selected ({selectedIds.length})
            </button>
          ) : undefined
        }
      />
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {rows.length === 0 ? (
        <EmptyState message="No certificates issued yet." />
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
                      aria-label="Select all certificates"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Title
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Issued
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const busy = busyId === c.id;
                  const hasFile = Boolean(c.storage_path);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80">
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          aria-label={`Select ${c.title}`}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-left">
                        {renderTitleLink(c)}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                        {new Date(c.issued_at).toLocaleDateString()}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <button
                            type="button"
                            disabled={busy || !hasFile}
                            onClick={() => void viewCertificate(c)}
                            className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? "…" : "View"}
                          </button>
                          <button
                            type="button"
                            disabled={busy || !hasFile}
                            onClick={() => void downloadCertificate(c)}
                            className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Download
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

      {trainingDetail ? (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-white"
          role="dialog"
          aria-modal="true"
          aria-labelledby="training-detail-title"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <h2
                id="training-detail-title"
                className="truncate text-base font-semibold text-slate-900"
              >
                {trainingDetail.programmeTitle}
              </h2>
              <p className="truncate text-xs text-slate-500">
                {profile?.full_name?.trim() || profile?.email || "Learner"} ·
                Answer sheet & training details
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
              onClick={() => setTrainingDetail(null)}
             title="Close" aria-label="Close">
                  ×
                </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="mx-auto w-full max-w-4xl space-y-6">
              <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Training details
                </h3>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-slate-500">Training ID</dt>
                    <dd className="font-mono text-sm font-semibold text-indigo-700">
                      {trainingDetail.trainingCode || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Programme</dt>
                    <dd className="text-sm font-medium text-slate-900">
                      {trainingDetail.programmeTitle}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Training date</dt>
                    <dd className="text-sm text-slate-800">
                      {trainingDetail.trainingDate
                        ? new Date(
                            trainingDetail.trainingDate,
                          ).toLocaleDateString("en-IN")
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Trainer</dt>
                    <dd className="text-sm text-slate-800">
                      {trainingDetail.trainerName || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Learner</dt>
                    <dd className="text-sm text-slate-800">
                      {profile?.full_name?.trim() || profile?.email || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Certificate issued</dt>
                    <dd className="text-sm text-slate-800">
                      {new Date(
                        trainingDetail.certificate.issued_at,
                      ).toLocaleDateString("en-IN")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Evaluation status</dt>
                    <dd className="text-sm capitalize text-slate-800">
                      {trainingDetail.status?.replace(/_/g, " ") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Score</dt>
                    <dd className="text-sm text-slate-800">
                      {trainingDetail.score != null &&
                      trainingDetail.maxScore != null
                        ? `${trainingDetail.score} / ${trainingDetail.maxScore}`
                        : "—"}
                      {trainingDetail.passed != null
                        ? trainingDetail.passed
                          ? " · Passed"
                          : " · Not passed"
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Submitted</dt>
                    <dd className="text-sm text-slate-800">
                      {trainingDetail.submittedAt
                        ? new Date(trainingDetail.submittedAt).toLocaleString(
                            "en-IN",
                          )
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Effectiveness</dt>
                    <dd className="text-sm capitalize text-slate-800">
                      {trainingDetail.effectiveness?.replace(/_/g, " ") || "—"}
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Answer sheet
                </h3>
                {trainingDetail.questions.length === 0 ? (
                  <EmptyState message="No answer sheet found for this training yet." />
                ) : (
                  <div className="space-y-3">
                    {trainingDetail.questions.map((q, idx) => {
                      const ans = trainingDetail.answers.find(
                        (a) => a.questionId === q.id,
                      );
                      const answerText =
                        ans?.selectedOption != null && q.options
                          ? q.options[ans.selectedOption]
                          : ans?.textAnswer?.trim() || null;
                      return (
                        <div
                          key={q.id}
                          className="rounded-xl border border-slate-200 bg-white p-4"
                        >
                          <p className="text-sm font-semibold text-slate-900">
                            Q{idx + 1}. {q.text}{" "}
                            <span className="text-xs font-normal text-slate-500">
                              ({q.marks} marks)
                            </span>
                          </p>
                          <p className="mt-2 text-sm text-slate-700">
                            <span className="font-medium text-slate-500">
                              Answer:{" "}
                            </span>
                            {answerText || (
                              <span className="text-slate-400">No answer</span>
                            )}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {viewCert ? (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-white"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2 className="truncate text-base font-semibold text-slate-900">
              {viewCert.title}
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={viewCert.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open in new tab
              </a>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => setViewCert(null)}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>
          </div>
          <iframe
            title={viewCert.title}
            src={viewCert.url}
            className="min-h-0 w-full flex-1 bg-slate-100"
          />
        </div>
      ) : null}
    </div>
  );
}

export function IndividualProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const readOnly = useWorkspaceReadOnly();
  const isOrgEmployee = isOrgLearnerRole(profile?.role);
  const accentBtn = isOrgEmployee ? "bg-emerald-600" : "bg-amber-500";
  const accentTab = isOrgEmployee ? "bg-emerald-600" : "bg-amber-500";

  const [activeTab, setActiveTab] = useState<"profile" | "education">("profile");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    mobile: "",
    dateOfBirth: "",
    occupation: "",
    city: "",
    country: "",
    address: "",
    state: "",
    pinCode: "",
    designation: "",
    department: "",
  });

  const [educations, setEducations] = useState<LearnerEducation[]>([]);
  const [skills, setSkills] = useState<LearnerSkill[]>([]);
  const [showEduModal, setShowEduModal] = useState(false);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [eduSubmitting, setEduSubmitting] = useState(false);
  const [skillSubmitting, setSkillSubmitting] = useState(false);
  const [editingEduId, setEditingEduId] = useState<string | null>(null);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [eduForm, setEduForm] = useState({
    institution: "",
    degree: "",
    field_of_study: "",
    start_year: "",
    end_year: "",
    grade: "",
  });
  const [skillForm, setSkillForm] = useState({
    skill_name: "",
    proficiency: "intermediate",
  });

  async function loadEducationSkills(userId: string) {
    const [eduRes, skillRes] = await Promise.all([
      supabase
        .from("learner_educations")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("learner_skills")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);
    setEducations((eduRes.data ?? []) as LearnerEducation[]);
    setSkills((skillRes.data ?? []) as LearnerSkill[]);
  }

  useEffect(() => {
    if (!profile) return;
    setForm({
      fullName: profile.full_name ?? "",
      mobile: profile.mobile ?? "",
      dateOfBirth: profile.date_of_birth ?? "",
      occupation: profile.occupation ?? "",
      city: profile.city ?? "",
      country: profile.country ?? "",
      address: profile.address ?? "",
      state: profile.state ?? "",
      pinCode: profile.pin_code ?? "",
      designation: profile.designation ?? "",
      department: profile.department ?? "",
    });
    void loadEducationSkills(profile.id);
  }, [profile]);

  async function saveProfile() {
    if (readOnly || !profile) return;
    setError(null);
    setMessage(null);
    if (!form.fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    setSaving(true);
    try {
      const { error: err } = await supabase
        .from("profiles")
        .update({
          full_name: form.fullName.trim(),
          mobile: form.mobile.trim() || null,
          date_of_birth: form.dateOfBirth.trim() || null,
          occupation: form.occupation.trim() || null,
          city: form.city.trim() || null,
          country: form.country.trim() || null,
          address: form.address.trim() || null,
          state: form.state.trim() || null,
          pin_code: form.pinCode.trim() || null,
          designation: form.designation.trim() || null,
          department: isOrgEmployee
            ? form.department.trim() || null
            : profile.department,
        })
        .eq("id", profile.id);

      if (err) {
        setError(err.message);
        return;
      }
      await refreshProfile();
      setMessage("Profile updated.");
    } finally {
      setSaving(false);
    }
  }

  function resetEduForm() {
    setEduForm({
      institution: "",
      degree: "",
      field_of_study: "",
      start_year: "",
      end_year: "",
      grade: "",
    });
    setEditingEduId(null);
  }

  function resetSkillForm() {
    setSkillForm({ skill_name: "", proficiency: "intermediate" });
    setEditingSkillId(null);
  }

  function openEditEducation(row: LearnerEducation) {
    if (readOnly) return;
    setEditingEduId(row.id);
    setEduForm({
      institution: row.institution,
      degree: row.degree,
      field_of_study: row.field_of_study ?? "",
      start_year: row.start_year ?? "",
      end_year: row.end_year ?? "",
      grade: row.grade ?? "",
    });
    setShowEduModal(true);
  }

  function openEditSkill(row: LearnerSkill) {
    if (readOnly) return;
    setEditingSkillId(row.id);
    setSkillForm({
      skill_name: row.skill_name,
      proficiency: row.proficiency || "intermediate",
    });
    setShowSkillModal(true);
  }

  async function saveEducation() {
    if (readOnly || !profile) return;
    setError(null);
    setMessage(null);
    if (!eduForm.institution.trim() || !eduForm.degree.trim()) {
      setError("Institution and degree are required.");
      return;
    }
    setEduSubmitting(true);
    try {
      const payload = {
        institution: eduForm.institution.trim(),
        degree: eduForm.degree.trim(),
        field_of_study: eduForm.field_of_study.trim(),
        start_year: eduForm.start_year.trim() || null,
        end_year: eduForm.end_year.trim() || null,
        grade: eduForm.grade.trim() || null,
      };
      if (editingEduId) {
        const { error: err } = await supabase
          .from("learner_educations")
          .update(payload)
          .eq("id", editingEduId);
        if (err) {
          setError(err.message);
          return;
        }
        setMessage("Education updated.");
      } else {
        const { error: err } = await supabase.from("learner_educations").insert({
          ...payload,
          user_id: profile.id,
        });
        if (err) {
          setError(err.message);
          return;
        }
        setMessage("Education added.");
      }
      resetEduForm();
      setShowEduModal(false);
      await loadEducationSkills(profile.id);
    } finally {
      setEduSubmitting(false);
    }
  }

  async function deleteEducation(row: LearnerEducation) {
    if (readOnly) return;
    if (!profile) return;
    const ok = window.confirm(`Delete education "${row.degree}"?`);
    if (!ok) return;
    setError(null);
    const { error: err } = await supabase
      .from("learner_educations")
      .delete()
      .eq("id", row.id);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Education deleted.");
    await loadEducationSkills(profile.id);
  }

  async function saveSkill() {
    if (readOnly || !profile) return;
    setError(null);
    setMessage(null);
    if (!skillForm.skill_name.trim()) {
      setError("Skill name is required.");
      return;
    }
    setSkillSubmitting(true);
    try {
      const payload = {
        skill_name: skillForm.skill_name.trim(),
        proficiency: skillForm.proficiency,
      };
      if (editingSkillId) {
        const { error: err } = await supabase
          .from("learner_skills")
          .update(payload)
          .eq("id", editingSkillId);
        if (err) {
          setError(err.message);
          return;
        }
        setMessage("Skill updated.");
      } else {
        const { error: err } = await supabase.from("learner_skills").insert({
          ...payload,
          user_id: profile.id,
        });
        if (err) {
          setError(err.message);
          return;
        }
        setMessage("Skill added.");
      }
      resetSkillForm();
      setShowSkillModal(false);
      await loadEducationSkills(profile.id);
    } finally {
      setSkillSubmitting(false);
    }
  }

  async function deleteSkill(row: LearnerSkill) {
    if (readOnly) return;
    if (!profile) return;
    const ok = window.confirm(`Delete skill "${row.skill_name}"?`);
    if (!ok) return;
    setError(null);
    const { error: err } = await supabase
      .from("learner_skills")
      .delete()
      .eq("id", row.id);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Skill deleted.");
    await loadEducationSkills(profile.id);
  }

  if (!profile) return null;

  return (
    <div>
      <PageHeader title="My Profile" />

      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => {
            setActiveTab("profile");
            setMessage(null);
            setError(null);
          }}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "profile"
              ? `${accentTab} text-white`
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          My Profile
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("education");
            setMessage(null);
            setError(null);
          }}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "education"
              ? `${accentTab} text-white`
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Education & Skill
        </button>
      </div>

      {error && !showEduModal && !showSkillModal ? (
        <p className="mb-3 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p className="mb-3 text-sm text-emerald-700">{message}</p>
      ) : null}

      {activeTab === "profile" ? (
        <fieldset disabled={readOnly} className="min-w-0 border-0 p-0">
        <Panel>
          <div className="grid gap-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <label className="text-xs font-semibold text-slate-700">
                Full Name
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.fullName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fullName: e.target.value }))
                  }
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Email
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-600"
                  value={profile.email ?? ""}
                  disabled
                  readOnly
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Mobile
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.mobile}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, mobile: e.target.value }))
                  }
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Date of Birth
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.dateOfBirth}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dateOfBirth: e.target.value }))
                  }
                  placeholder="YYYY-MM-DD"
                />
              </label>

              {isOrgEmployee ? (
                <label className="text-xs font-semibold text-slate-700">
                  Employee ID
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-600"
                    value={profile.employee_code ?? ""}
                    disabled
                    readOnly
                  />
                </label>
              ) : (
                <label className="text-xs font-semibold text-slate-700">
                  Occupation
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                    value={form.occupation}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, occupation: e.target.value }))
                    }
                  />
                </label>
              )}
            </div>

            {isOrgEmployee ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-700">
                  Designation
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                    value={form.designation}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, designation: e.target.value }))
                    }
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Department
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                    value={form.department}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, department: e.target.value }))
                    }
                  />
                </label>
              </div>
            ) : null}

            <label className="text-xs font-semibold text-slate-700">
              Address
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
                placeholder="Street, area, landmark"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="text-xs font-semibold text-slate-700">
                City
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.city}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, city: e.target.value }))
                  }
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                PIN Code
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.pinCode}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pinCode: e.target.value }))
                  }
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                State
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.state}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, state: e.target.value }))
                  }
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Country
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.country}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, country: e.target.value }))
                  }
                />
              </label>
            </div>
          </div>

          <div className="mt-5">
            {!readOnly ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveProfile()}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${accentBtn}`}
              >
                {saving ? "Saving…" : "Save Profile"}
              </button>
            ) : (
              <p className="text-xs font-semibold text-slate-500">
                View only — profile cannot be edited in QI preview.
              </p>
            )}
          </div>
        </Panel>
        </fieldset>
      ) : (
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">Education</h2>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => {
                    resetEduForm();
                    setError(null);
                    setShowEduModal(true);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${accentBtn}`}
                >
                  Add Education
                </button>
              ) : null}
            </div>
            {educations.length === 0 ? (
              <EmptyState message="No education added yet." />
            ) : (
              <Panel className="!p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="border border-slate-200 px-3 py-2.5 text-left">
                          Institution
                        </th>
                        <th className="border border-slate-200 px-3 py-2.5 text-left">
                          Degree
                        </th>
                        <th className="border border-slate-200 px-3 py-2.5 text-center">
                          Field
                        </th>
                        <th className="border border-slate-200 px-3 py-2.5 text-center">
                          Year
                        </th>
                        <th className="border border-slate-200 px-3 py-2.5 text-center">
                          Grade
                        </th>
                        <th className="border border-slate-200 px-3 py-2.5 text-center">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {educations.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/80">
                          <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium text-slate-900">
                            {row.institution}
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 !text-left text-slate-700">
                            {row.degree}
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                            {row.field_of_study || "—"}
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                            {[row.start_year, row.end_year]
                              .filter(Boolean)
                              .join(" – ") || "—"}
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                            {row.grade || "—"}
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center">
                            {readOnly ? (
                              <span className="text-xs text-slate-400">
                                View only
                              </span>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditEducation(row)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-base leading-none hover:bg-slate-50"
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteEducation(row)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-base leading-none hover:bg-rose-100"
                                title="Delete"
                              >
                                🗑️
                              </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </div>

          <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-800">Skills</h2>
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => {
                        resetSkillForm();
                        setError(null);
                        setShowSkillModal(true);
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${accentBtn}`}
                    >
                      Add Skill
                    </button>
                  ) : null}
                </div>
            {skills.length === 0 ? (
              <EmptyState message="No skills added yet." />
            ) : (
              <Panel className="!p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="border border-slate-200 px-3 py-2.5 text-left">
                          Skill
                        </th>
                        <th className="border border-slate-200 px-3 py-2.5 text-center">
                          Proficiency
                        </th>
                        <th className="border border-slate-200 px-3 py-2.5 text-center">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {skills.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/80">
                          <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium text-slate-900">
                            {row.skill_name}
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center capitalize text-slate-700">
                            {row.proficiency}
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center">
                            {readOnly ? (
                              <span className="text-xs text-slate-400">
                                View only
                              </span>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditSkill(row)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-base leading-none hover:bg-slate-50"
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteSkill(row)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-base leading-none hover:bg-rose-100"
                                title="Delete"
                              >
                                🗑️
                              </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}

      {showEduModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!eduSubmitting) {
              resetEduForm();
              setShowEduModal(false);
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {editingEduId ? "Edit Education" : "Add Education"}
            </h2>
            {error ? (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                Institution
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={eduForm.institution}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, institution: e.target.value }))
                  }
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Degree / Course
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={eduForm.degree}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, degree: e.target.value }))
                  }
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Field of Study
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={eduForm.field_of_study}
                  onChange={(e) =>
                    setEduForm((f) => ({
                      ...f,
                      field_of_study: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Start Year
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={eduForm.start_year}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, start_year: e.target.value }))
                  }
                  placeholder="e.g. 2018"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                End Year
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={eduForm.end_year}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, end_year: e.target.value }))
                  }
                  placeholder="e.g. 2022"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                Grade / Score
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={eduForm.grade}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, grade: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={eduSubmitting}
                onClick={() => void saveEducation()}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${accentBtn}`}
              >
                {eduSubmitting ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={eduSubmitting}
                onClick={() => {
                  resetEduForm();
                  setShowEduModal(false);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSkillModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!skillSubmitting) {
              resetSkillForm();
              setShowSkillModal(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {editingSkillId ? "Edit Skill" : "Add Skill"}
            </h2>
            {error ? (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <div className="grid gap-3">
              <label className="text-xs font-semibold text-slate-700">
                Skill Name
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={skillForm.skill_name}
                  onChange={(e) =>
                    setSkillForm((f) => ({ ...f, skill_name: e.target.value }))
                  }
                  placeholder="e.g. HPLC, ISO 17025"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Proficiency
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={skillForm.proficiency}
                  onChange={(e) =>
                    setSkillForm((f) => ({
                      ...f,
                      proficiency: e.target.value,
                    }))
                  }
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </select>
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={skillSubmitting}
                onClick={() => void saveSkill()}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${accentBtn}`}
              >
                {skillSubmitting ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={skillSubmitting}
                onClick={() => {
                  resetSkillForm();
                  setShowSkillModal(false);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
