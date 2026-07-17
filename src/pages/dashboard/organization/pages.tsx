import { useEffect, useState } from "react";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
} from "@/components/dashboard-shell";
import { useWorkspaceScopedProfile as useAuth, useIsWorkspacePreview, useWorkspaceReadOnly } from "@/features/workspace/WorkspacePreview";
import {
  externalMeetingHref,
  meetingPlatformLabel,
} from "@/lib/meetings/links";
import { supabase } from "@/lib/supabase/client";
import type {
  Certificate,
  Organization,
  OrgAccreditation,
  Profile,
  TraineeEvaluation,
  TrainingProgramme,
  TrainingRequest,
  TrainingSession,
} from "@/lib/supabase/types";

type EmployeeTrainingTab =
  | "ongoing"
  | "conducted"
  | "question_paper"
  | "answers"
  | "evaluated"
  | "certificates";

type EmployeeEvalRow = {
  id: string;
  programme_title: string;
  status: TraineeEvaluation["status"];
  link_sent_at: string | null;
  submitted_at: string | null;
  evaluated_at: string | null;
  score: number | null;
  max_score: number | null;
  passed: boolean | null;
};

const ACCREDITATION_OPTIONS = [
  "ISO/IEC 17025",
  "ISO 9001",
  "ISO 14001",
  "ISO 45001",
  "ISO 15189",
  "ISO 17020",
  "ISO 17043",
  "NABL",
  "CAP",
  "GLP",
  "GCP",
  "Other",
];

export function OrgOverviewPage() {
  const { profile } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    if (!profile?.org_id) return;
    void (async () => {
      const [orgRes, empRes, sessRes] = await Promise.all([
        supabase
          .from("organizations")
          .select("*")
          .eq("id", profile.org_id!)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("org_id", profile.org_id!),
        supabase
          .from("training_sessions")
          .select("id", { count: "exact", head: true })
          .eq("org_id", profile.org_id!),
      ]);
      setOrg(orgRes.data);
      setEmployeeCount(empRes.count ?? 0);
      setSessionCount(sessRes.count ?? 0);
    })();
  }, [profile?.org_id]);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Members" value={employeeCount} />
        <StatCard label="Sessions" value={sessionCount} />
        <StatCard label="Industry" value={org?.industry ?? "—"} />
      </div>
    </div>
  );
}

export function OrgEmployeesPage() {
  const { profile } = useAuth();
  const readOnly = useWorkspaceReadOnly();
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Profile | null>(null);
  const [trainingsEmployee, setTrainingsEmployee] = useState<Profile | null>(
    null,
  );
  const [trainingsModalTab, setTrainingsModalTab] =
    useState<EmployeeTrainingTab>("ongoing");
  const [assignedTrainings, setAssignedTrainings] = useState<
    Array<{
      id: string;
      title: string;
      status: string;
      starts_at: string | null;
      source: string;
    }>
  >([]);
  const [employeeEvaluations, setEmployeeEvaluations] = useState<
    EmployeeEvalRow[]
  >([]);
  const [employeeCertificates, setEmployeeCertificates] = useState<
    Certificate[]
  >([]);
  const [loadingTrainings, setLoadingTrainings] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    employeeId: "",
    fullName: "",
    designation: "",
    department: "",
    email: "",
    mobile: "",
    password: "",
    confirmPassword: "",
  });
  const [editForm, setEditForm] = useState({
    employeeId: "",
    fullName: "",
    designation: "",
    department: "",
    mobile: "",
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  async function load() {
    if (!profile?.org_id) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("org_id", profile.org_id)
      .in("role", ["org_admin", "org_employee"])
      .order("created_at", { ascending: false });
    const list = ((data ?? []) as Profile[]).slice().sort((a, b) => {
      // Organization admins first, then employees
      if (a.role !== b.role) {
        if (a.role === "org_admin") return -1;
        if (b.role === "org_admin") return 1;
      }
      return (a.full_name || a.email || "").localeCompare(
        b.full_name || b.email || "",
      );
    });
    setEmployees(list);
    setSelectedIds((prev) => prev.filter((id) => list.some((e) => e.id === id)));
  }

  useEffect(() => {
    void load();
  }, [profile?.org_id]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (selectedIds.length === employees.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(employees.map((e) => e.id));
    }
  }

  function resetForm() {
    setForm({
      employeeId: "",
      fullName: "",
      designation: "",
      department: "",
      email: "",
      mobile: "",
      password: "",
      confirmPassword: "",
    });
  }

  function openEdit(employee: Profile) {
    if (readOnly) return;
    setError(null);
    setEditingEmployee(employee);
    setEditForm({
      employeeId: employee.employee_code ?? "",
      fullName: employee.full_name ?? "",
      designation: employee.designation ?? "",
      department: employee.department ?? "",
      mobile: employee.mobile ?? "",
    });
  }

  async function saveEdit() {
    if (readOnly || !editingEmployee) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await supabase
        .from("profiles")
        .update({
          employee_code: editForm.employeeId.trim() || null,
          full_name: editForm.fullName.trim(),
          designation: editForm.designation.trim() || null,
          department: editForm.department.trim() || null,
          mobile: editForm.mobile.trim() || null,
        })
        .eq("id", editingEmployee.id);
      if (err) {
        setError(err.message);
        return;
      }
      setMessage(`Employee ${editForm.fullName.trim()} updated.`);
      setEditingEmployee(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function openAssignedTrainings(employee: Profile) {
    setTrainingsEmployee(employee);
    setTrainingsModalTab("ongoing");
    setAssignedTrainings([]);
    setEmployeeEvaluations([]);
    setEmployeeCertificates([]);
    setLoadingTrainings(true);
    setError(null);
    try {
      const [
        { data: enrollments },
        { data: assignments },
        { data: requestRows },
        { data: certificates },
        { data: evaluations },
      ] = await Promise.all([
        supabase
          .from("enrollments")
          .select("id, status, session_id")
          .eq("user_id", employee.id),
        supabase
          .from("programme_assignments")
          .select("id, status, programme_id, assigned_at")
          .eq("user_id", employee.id),
        supabase
          .from("training_requests")
          .select(
            "id, title, status, programme_id, training_date, session_id, employee_ids, updated_at",
          )
          .contains("employee_ids", [employee.id])
          .in("status", [
            "pending",
            "approved",
            "hold",
            "scheduled",
            "completed",
          ])
          .order("updated_at", { ascending: false }),
        supabase
          .from("certificates")
          .select("*")
          .eq("user_id", employee.id)
          .order("issued_at", { ascending: false }),
        supabase
          .from("trainee_evaluations")
          .select("*")
          .eq("user_id", employee.id)
          .order("updated_at", { ascending: false }),
      ]);

      const sessionIds = [
        ...new Set(
          [
            ...(enrollments ?? []).map((e) => e.session_id),
            ...(requestRows ?? [])
              .map((r) => r.session_id)
              .filter((id): id is string => Boolean(id)),
          ].filter(Boolean),
        ),
      ];
      const programmeIds = [
        ...new Set(
          [
            ...(assignments ?? []).map((a) => a.programme_id),
            ...(requestRows ?? [])
              .map((r) => r.programme_id)
              .filter((id): id is string => Boolean(id)),
            ...((evaluations ?? []) as TraineeEvaluation[])
              .map((e) => e.programme_id)
              .filter((id): id is string => Boolean(id)),
          ].filter(Boolean),
        ),
      ];

      const [{ data: sessions }, { data: programmes }] = await Promise.all([
        sessionIds.length
          ? supabase
              .from("training_sessions")
              .select("id, title, status, starts_at")
              .in("id", sessionIds)
          : Promise.resolve({ data: [] }),
        programmeIds.length
          ? supabase
              .from("training_programmes")
              .select("id, title, status")
              .in("id", programmeIds)
          : Promise.resolve({ data: [] }),
      ]);

      const sessionMap = new Map(
        ((sessions ?? []) as Array<{
          id: string;
          title: string;
          status: string;
          starts_at: string | null;
        }>).map((s) => [s.id, s]),
      );
      const programmeMap = new Map(
        ((programmes ?? []) as Array<{
          id: string;
          title: string;
          status: string;
        }>).map((p) => [p.id, p]),
      );

      const rows: Array<{
        id: string;
        title: string;
        status: string;
        starts_at: string | null;
        source: string;
      }> = [];

      for (const r of (requestRows ?? []) as Array<{
        id: string;
        title: string;
        status: string;
        programme_id: string | null;
        training_date: string | null;
        session_id: string | null;
      }>) {
        const programmeTitle = r.programme_id
          ? programmeMap.get(r.programme_id)?.title
          : null;
        const session = r.session_id ? sessionMap.get(r.session_id) : null;
        rows.push({
          id: `req-${r.id}`,
          title:
            programmeTitle ||
            r.title.replace(/^(Request|Assigned):\s*/i, "") ||
            "Training",
          status: r.status,
          starts_at: session?.starts_at ?? r.training_date,
          source: "Assigned programme",
        });
      }

      for (const e of enrollments ?? []) {
        const session = sessionMap.get(e.session_id);
        rows.push({
          id: `enr-${e.id}`,
          title: session?.title ?? "Session",
          status: e.status,
          starts_at: session?.starts_at ?? null,
          source: "Session enrollment",
        });
      }

      for (const a of assignments ?? []) {
        const programme = programmeMap.get(a.programme_id);
        rows.push({
          id: `asg-${a.id}`,
          title: programme?.title ?? "Programme",
          status: a.status,
          starts_at: a.assigned_at ?? null,
          source: "Programme assignment",
        });
      }

      setAssignedTrainings(rows);

      const evalList = (evaluations ?? []) as TraineeEvaluation[];
      const reqById = new Map(
        ((requestRows ?? []) as Array<{ id: string; title: string }>).map(
          (r) => [r.id, r],
        ),
      );
      setEmployeeEvaluations(
        evalList.map((e) => {
          const req = reqById.get(e.training_request_id);
          const programmeTitle =
            (e.programme_id && programmeMap.get(e.programme_id)?.title) ||
            req?.title.replace(/^(Request|Assigned):\s*/i, "") ||
            "Programme";
          return {
            id: e.id,
            programme_title: programmeTitle,
            status: e.status,
            link_sent_at: e.link_sent_at,
            submitted_at: e.submitted_at,
            evaluated_at: e.evaluated_at,
            score: e.score,
            max_score: e.max_score,
            passed: e.passed,
          };
        }),
      );
      setEmployeeCertificates((certificates ?? []) as Certificate[]);
    } finally {
      setLoadingTrainings(false);
    }
  }

  const ongoingTrainings = assignedTrainings.filter((t) => {
    const s = t.status.toLowerCase();
    return (
      s !== "completed" &&
      s !== "cancelled" &&
      s !== "rejected" &&
      s !== "inactive"
    );
  });
  const conductedTrainings = assignedTrainings.filter((t) => {
    const s = t.status.toLowerCase();
    return s === "completed";
  });
  const questionPaperReceived = employeeEvaluations.filter(
    (e) =>
      e.status === "link_sent" ||
      e.status === "in_progress" ||
      e.status === "submitted" ||
      e.status === "evaluated",
  );
  const answersSubmitted = employeeEvaluations.filter(
    (e) => e.status === "submitted" || e.status === "evaluated",
  );
  const evaluationsDone = employeeEvaluations.filter(
    (e) => e.status === "evaluated",
  );

  function evalStatusLabel(status: TraineeEvaluation["status"]) {
    switch (status) {
      case "pending_send":
        return "Pending send";
      case "link_sent":
        return "Question paper received";
      case "in_progress":
        return "In progress";
      case "submitted":
        return "Answer submitted";
      case "evaluated":
        return "Evaluated";
      default:
        return status;
    }
  }

  async function addEmployee() {
    setError(null);
    setMessage(null);

    if (readOnly || !profile?.org_id) return;

    if (
      !form.employeeId.trim() ||
      !form.fullName.trim() ||
      !form.designation.trim() ||
      !form.department.trim() ||
      !form.email.trim() ||
      !form.mobile.trim() ||
      !form.password
    ) {
      setError("Please fill all employee fields.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Password and Retype Password do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: adminSessionData } = await supabase.auth.getSession();
      const adminSession = adminSessionData.session;
      if (!adminSession) {
        setError("Your session expired. Please sign in again.");
        return;
      }

      const email = form.email.trim().toLowerCase();

      const { data: invite, error: inviteError } = await supabase
        .from("org_invites")
        .insert({
          org_id: profile.org_id,
          email,
          invited_by: profile.id,
          employee_code: form.employeeId.trim(),
          designation: form.designation.trim(),
          department: form.department.trim(),
          full_name: form.fullName.trim(),
          mobile: form.mobile.trim(),
        })
        .select("*")
        .single();

      if (inviteError || !invite) {
        setError(inviteError?.message ?? "Could not prepare employee record.");
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          data: {
            portal: "organization",
            invite_token: invite.token,
            full_name: form.fullName.trim(),
            designation: form.designation.trim(),
            mobile: form.mobile.trim(),
            employee_code: form.employeeId.trim(),
            department: form.department.trim(),
          },
        },
      });

      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      setMessage(`Employee ${form.fullName.trim()} added successfully.`);
      resetForm();
      setShowForm(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Employees"
        actions={
          readOnly ? undefined : (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setShowForm(true);
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Add Employee
            </button>
          )
        }
      />

      {message ? <p className="mb-3 text-sm text-emerald-700">{message}</p> : null}

      {showForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-employee-title"
          onClick={() => {
            if (!submitting) {
              resetForm();
              setError(null);
              setShowForm(false);
            }
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="add-employee-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Add Employee
                </h2>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  resetForm();
                  setError(null);
                  setShowForm(false);
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

            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["employeeId", "Employee ID", "text"],
                  ["fullName", "Employee Name", "text"],
                  ["designation", "Employee Designation", "text"],
                  ["department", "Employee Department", "text"],
                  ["email", "Employee Email ID", "email"],
                  ["mobile", "Employee Mobile", "tel"],
                  ["password", "Employee Password", "password"],
                  ["confirmPassword", "Employee Retype Password", "password"],
                ] as const
              ).map(([key, label, type]) => (
                <label key={key} className="text-xs font-semibold text-slate-700">
                  {label}
                  <input
                    type={type}
                    required
                    value={form[key]}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  />
                </label>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void addEmployee()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Save Employee"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  resetForm();
                  setError(null);
                  setShowForm(false);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingEmployee ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!submitting) {
              setEditingEmployee(null);
              setError(null);
            }
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">Edit Employee</h2>
            <p className="mt-1 text-sm text-slate-600">
              {editingEmployee.email}
            </p>
            {error ? (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["employeeId", "Employee ID"],
                  ["fullName", "Employee Name"],
                  ["designation", "Employee Designation"],
                  ["department", "Employee Department"],
                  ["mobile", "Employee Mobile"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className={`text-xs font-semibold text-slate-700 ${
                    key === "fullName" ? "sm:col-span-2" : ""
                  }`}
                >
                  {label}
                  <input
                    value={editForm[key]}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  />
                </label>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void saveEdit()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setEditingEmployee(null);
                  setError(null);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {trainingsEmployee ? (
        <div
          className="fixed inset-0 z-50 flex h-dvh w-screen flex-col bg-white"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Employee Training Modules
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {trainingsEmployee.full_name || trainingsEmployee.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTrainingsEmployee(null)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-2xl leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-60"
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            <div className="shrink-0 border-b border-slate-200 px-4 py-3 sm:px-6">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    {
                      id: "ongoing" as const,
                      label: "Ongoing Trainings",
                      count: ongoingTrainings.length,
                    },
                    {
                      id: "conducted" as const,
                      label: "Training Conducted",
                      count: conductedTrainings.length,
                    },
                    {
                      id: "question_paper" as const,
                      label: "Question Paper Received",
                      count: questionPaperReceived.length,
                    },
                    {
                      id: "answers" as const,
                      label: "Answer Submitted",
                      count: answersSubmitted.length,
                    },
                    {
                      id: "evaluated" as const,
                      label: "Evaluated",
                      count: evaluationsDone.length,
                    },
                    {
                      id: "certificates" as const,
                      label: "Certificates",
                      count: employeeCertificates.length,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTrainingsModalTab(tab.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      trainingsModalTab === tab.id
                        ? "bg-emerald-600 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
              {loadingTrainings ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : trainingsModalTab === "certificates" ? (
                employeeCertificates.length === 0 ? (
                  <EmptyState message="No certificates issued for this employee yet." />
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="border border-slate-200 px-3 py-2.5 text-left">
                          Title
                        </th>
                        <th className="border border-slate-200 px-3 py-2.5 text-center">
                          Issued
                        </th>
                        <th className="border border-slate-200 px-3 py-2.5 text-center">
                          File
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeCertificates.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/80">
                          <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium">
                            {c.title}
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center">
                            {new Date(c.issued_at).toLocaleDateString("en-IN")}
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-500">
                            {c.storage_path ?? "Metadata only"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : trainingsModalTab === "question_paper" ||
                trainingsModalTab === "answers" ||
                trainingsModalTab === "evaluated" ? (
                (() => {
                  const rows =
                    trainingsModalTab === "question_paper"
                      ? questionPaperReceived
                      : trainingsModalTab === "answers"
                        ? answersSubmitted
                        : evaluationsDone;
                  if (rows.length === 0) {
                    return (
                      <EmptyState
                        message={
                          trainingsModalTab === "question_paper"
                            ? "No question paper received yet for this employee."
                            : trainingsModalTab === "answers"
                              ? "No answers submitted yet for this employee."
                              : "No evaluations completed yet for this employee."
                        }
                      />
                    );
                  }
                  return (
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="border border-slate-200 px-3 py-2.5 text-left">
                            Programme
                          </th>
                          <th className="border border-slate-200 px-3 py-2.5 text-center">
                            Status
                          </th>
                          <th className="border border-slate-200 px-3 py-2.5 text-center">
                            Link sent
                          </th>
                          <th className="border border-slate-200 px-3 py-2.5 text-center">
                            Answer submitted
                          </th>
                          <th className="border border-slate-200 px-3 py-2.5 text-center">
                            Score
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50/80">
                            <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium">
                              {row.programme_title}
                            </td>
                            <td className="border border-slate-200 px-3 py-2.5 text-center">
                              {evalStatusLabel(row.status)}
                            </td>
                            <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-600">
                              {row.link_sent_at
                                ? new Date(row.link_sent_at).toLocaleString(
                                    "en-IN",
                                  )
                                : "—"}
                            </td>
                            <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-600">
                              {row.submitted_at
                                ? new Date(row.submitted_at).toLocaleString(
                                    "en-IN",
                                  )
                                : "—"}
                            </td>
                            <td className="border border-slate-200 px-3 py-2.5 text-center">
                              {row.status === "evaluated"
                                ? [
                                    String(row.score ?? "—"),
                                    row.max_score != null
                                      ? ` / ${row.max_score}`
                                      : "",
                                    row.passed == null
                                      ? ""
                                      : row.passed
                                        ? " · Pass"
                                        : " · Fail",
                                  ].join("")
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()
              ) : (
                (() => {
                  const rows =
                    trainingsModalTab === "ongoing"
                      ? ongoingTrainings
                      : conductedTrainings;
                  if (rows.length === 0) {
                    return (
                      <EmptyState
                        message={
                          trainingsModalTab === "ongoing"
                            ? "No ongoing trainings for this employee."
                            : "No conducted trainings for this employee yet."
                        }
                      />
                    );
                  }
                  return (
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="border border-slate-200 px-3 py-2.5 text-left">
                            Training
                          </th>
                          <th className="border border-slate-200 px-3 py-2.5 text-center">
                            Type
                          </th>
                          <th className="border border-slate-200 px-3 py-2.5 text-center">
                            Status
                          </th>
                          <th className="border border-slate-200 px-3 py-2.5 text-center">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((t) => (
                          <tr key={t.id} className="hover:bg-slate-50/80">
                            <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium">
                              {t.title}
                            </td>
                            <td className="border border-slate-200 px-3 py-2.5 text-center">
                              {t.source}
                            </td>
                            <td className="border border-slate-200 px-3 py-2.5 text-center capitalize">
                              {t.status}
                            </td>
                            <td className="border border-slate-200 px-3 py-2.5 text-center">
                              {t.starts_at
                                ? new Date(t.starts_at).toLocaleDateString(
                                    "en-IN",
                                  )
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      ) : null}

      <h2 className="mb-2 text-sm font-semibold text-slate-800">
        Active members
      </h2>
      {employees.length === 0 ? (
        <EmptyState message="No members yet. Click Add Employee to create one." />
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
                        employees.length > 0 &&
                        selectedIds.length === employees.length
                      }
                      onChange={toggleSelectAll}
                      aria-label="Select all members"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Employee ID
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Name
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Role
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Designation
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Department
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Email
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Mobile
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/80">
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(e.id)}
                        onChange={() => toggleSelect(e.id)}
                        aria-label={`Select ${e.full_name || e.employee_code || "member"}`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 !text-left text-slate-700">
                      {e.employee_code ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center font-medium text-slate-900">
                      {e.full_name || "—"}
                      {profile?.id === e.id ? (
                        <span className="ml-1 text-[10px] font-semibold text-indigo-600">
                          (You)
                        </span>
                      ) : null}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          e.role === "org_admin"
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {e.role === "org_admin" ? "Admin" : "Employee"}
                      </span>
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {e.designation ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {e.department ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {e.email ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {e.mobile ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {!readOnly ? (
                          <button
                            type="button"
                            onClick={() => openEdit(e)}
                            title="Edit"
                            aria-label="Edit employee"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-base leading-none hover:bg-slate-50"
                          >
                            ✏️
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void openAssignedTrainings(e)}
                          title="Assigned Trainings"
                          aria-label="Assigned trainings"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-base leading-none hover:bg-emerald-500"
                        >
                          📚
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

export function OrgDetailsPage() {
  const { profile } = useAuth();
  const isPreview = useIsWorkspacePreview();
  const canManage = profile?.role === "org_admin" && !isPreview;
  const [org, setOrg] = useState<Organization | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "accreditations">(
    "details",
  );
  const [accreditations, setAccreditations] = useState<OrgAccreditation[]>([]);
  const [showAccModal, setShowAccModal] = useState(false);
  const [accSubmitting, setAccSubmitting] = useState(false);
  const [editingAccId, setEditingAccId] = useState<string | null>(null);
  const [accForm, setAccForm] = useState({
    accreditation_name: "",
    certificate_number: "",
    validity_date: "",
    scope: "",
  });
  const [selectedAccIds, setSelectedAccIds] = useState<string[]>([]);

  async function loadAccreditations(orgId: string) {
    const { data } = await supabase
      .from("org_accreditations")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as OrgAccreditation[];
    setAccreditations(list);
    setSelectedAccIds((prev) =>
      prev.filter((id) => list.some((row) => row.id === id)),
    );
  }

  useEffect(() => {
    if (!profile?.org_id) return;
    void supabase
      .from("organizations")
      .select("*")
      .eq("id", profile.org_id)
      .maybeSingle()
      .then(({ data }) => {
        setOrg(data as Organization | null);
      });
    void loadAccreditations(profile.org_id);
  }, [profile?.org_id]);

  async function uploadLogo(file: File) {
    if (!canManage || !org || !profile?.org_id) return;
    setUploadingLogo(true);
    setMessage(null);
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${profile.org_id}/logo.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("org-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setUploadingLogo(false);
      setError(uploadError.message);
      return;
    }
    const { data: pub } = supabase.storage.from("org-assets").getPublicUrl(path);
    const logoUrl = `${pub.publicUrl}?t=${Date.now()}`;
    const { error: updateError } = await supabase
      .from("organizations")
      .update({ logo_url: logoUrl })
      .eq("id", org.id);
    setUploadingLogo(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setOrg({ ...org, logo_url: logoUrl });
    setMessage("Logo updated.");
    window.dispatchEvent(new Event("org-brand-updated"));
  }

  async function saveDetails() {
    if (!canManage || !org) return;
    setMessage(null);
    setError(null);
    const { error: saveError } = await supabase
      .from("organizations")
      .update({
        name: org.name,
        industry: org.industry,
        city: org.city,
        country: org.country,
        gst_number: org.gst_number,
        address: org.address,
        pin_code: org.pin_code,
        state: org.state,
        contact_email: org.contact_email,
        contact_phone: org.contact_phone,
        contact_person_name: org.contact_person_name,
        logo_url: org.logo_url,
        employee_count: org.employee_count,
      })
      .eq("id", org.id);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setMessage("Organization details saved.");
    window.dispatchEvent(new Event("org-brand-updated"));
  }

  function resetAccForm() {
    setAccForm({
      accreditation_name: "",
      certificate_number: "",
      validity_date: "",
      scope: "",
    });
    setEditingAccId(null);
    setError(null);
  }

  function openAddAccreditation() {
    if (!canManage) return;
    resetAccForm();
    setShowAccModal(true);
  }

  function toggleAccSelect(id: string) {
    setSelectedAccIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAllAcc() {
    if (selectedAccIds.length === accreditations.length) {
      setSelectedAccIds([]);
    } else {
      setSelectedAccIds(accreditations.map((row) => row.id));
    }
  }

  function openEditAccreditation(row: OrgAccreditation) {
    if (!canManage) return;
    setEditingAccId(row.id);
    setAccForm({
      accreditation_name: row.accreditation_name,
      certificate_number: row.certificate_number ?? "",
      validity_date: row.validity_date ?? "",
      scope: row.scope ?? "",
    });
    setError(null);
    setShowAccModal(true);
  }

  async function saveAccreditation() {
    if (!canManage || !profile?.org_id) return;
    setError(null);
    setMessage(null);
    if (!accForm.accreditation_name) {
      setError("Please select an accreditation name.");
      return;
    }
    if (!accForm.certificate_number.trim()) {
      setError("Please enter certificate number.");
      return;
    }
    if (!accForm.validity_date) {
      setError("Please select validity date.");
      return;
    }

    setAccSubmitting(true);
    try {
      const payload = {
        accreditation_name: accForm.accreditation_name,
        certificate_number: accForm.certificate_number.trim(),
        validity_date: accForm.validity_date,
        scope: accForm.scope.trim(),
      };

      if (editingAccId) {
        const { error: updateError } = await supabase
          .from("org_accreditations")
          .update(payload)
          .eq("id", editingAccId);
        if (updateError) {
          setError(updateError.message);
          return;
        }
        setMessage("Accreditation updated.");
      } else {
        const { error: insertError } = await supabase
          .from("org_accreditations")
          .insert({
            ...payload,
            org_id: profile.org_id,
            created_by: profile.id,
          });
        if (insertError) {
          setError(insertError.message);
          return;
        }
        setMessage("Accreditation saved.");
      }
      resetAccForm();
      setShowAccModal(false);
      await loadAccreditations(profile.org_id);
    } finally {
      setAccSubmitting(false);
    }
  }

  async function deleteAccreditation(row: OrgAccreditation) {
    if (!canManage || !profile?.org_id) return;
    const ok = window.confirm(
      `Delete accreditation "${row.accreditation_name}"?`,
    );
    if (!ok) return;
    setError(null);
    setMessage(null);
    const { error: deleteError } = await supabase
      .from("org_accreditations")
      .delete()
      .eq("id", row.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setMessage("Accreditation deleted.");
    await loadAccreditations(profile.org_id);
  }

  if (!org) {
    return <EmptyState message="Organization profile not found." />;
  }

  return (
    <div>
      <PageHeader title="Organization" />

      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => {
            setActiveTab("details");
            setMessage(null);
            setError(null);
          }}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "details"
              ? "bg-emerald-600 text-white"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Organization Details
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("accreditations");
            setMessage(null);
            setError(null);
          }}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "accreditations"
              ? "bg-emerald-600 text-white"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Organization Accreditations
        </button>
      </div>

      {message ? (
        <p className="mb-3 text-sm text-emerald-700">{message}</p>
      ) : null}
      {error && !showAccModal ? (
        <p className="mb-3 text-sm text-red-700">{error}</p>
      ) : null}

      {activeTab === "details" ? (
        <fieldset disabled={!canManage} className="min-w-0 border-0 p-0">
        <Panel className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
              {org.logo_url ? (
                <img
                  src={org.logo_url}
                  alt={`${org.name} logo`}
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <span className="text-sm font-black text-emerald-700">
                  {org.name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")
                    .toUpperCase()}
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                Organization Logo
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                PNG or JPG, shown in the sidebar and top bar.
              </p>
              <label
                className={`mt-2 inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ${
                  canManage
                    ? "cursor-pointer"
                    : "cursor-not-allowed opacity-50"
                }`}
              >
                {uploadingLogo ? "Uploading…" : "Upload logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  disabled={!canManage || uploadingLogo}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadLogo(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
            Organization Name
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              value={org.name}
              onChange={(e) => setOrg({ ...org, name: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-700">
              Contact Person Name
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={org.contact_person_name ?? ""}
                onChange={(e) =>
                  setOrg({ ...org, contact_person_name: e.target.value })
                }
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Contact Email
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={org.contact_email ?? ""}
                onChange={(e) =>
                  setOrg({ ...org, contact_email: e.target.value })
                }
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Mobile Number
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={org.contact_phone ?? ""}
                onChange={(e) =>
                  setOrg({ ...org, contact_phone: e.target.value })
                }
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-700">
              GST Number
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={org.gst_number ?? ""}
                onChange={(e) => setOrg({ ...org, gst_number: e.target.value })}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Type of Industry
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={org.industry ?? ""}
                onChange={(e) => setOrg({ ...org, industry: e.target.value })}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Number of Employees
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={org.employee_count ?? ""}
                onChange={(e) =>
                  setOrg({ ...org, employee_count: e.target.value })
                }
              />
            </label>
          </div>
          <label className="sm:col-span-2 text-xs font-semibold text-slate-700">
            Address
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              value={org.address ?? ""}
              onChange={(e) => setOrg({ ...org, address: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-slate-700">
              City
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={org.city ?? ""}
                onChange={(e) => setOrg({ ...org, city: e.target.value })}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              PIN Code
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={org.pin_code ?? ""}
                onChange={(e) => setOrg({ ...org, pin_code: e.target.value })}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              State
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={org.state ?? ""}
                onChange={(e) => setOrg({ ...org, state: e.target.value })}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Country
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={org.country ?? ""}
                onChange={(e) => setOrg({ ...org, country: e.target.value })}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void saveDetails()}
            disabled={!canManage}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white sm:col-span-2 sm:w-fit disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save changes
          </button>
        </Panel>
        </fieldset>
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Organization Accreditations
              </h2>
            </div>
            <button
              type="button"
              onClick={openAddAccreditation}
              disabled={!canManage}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Accreditation
            </button>
          </div>

          {accreditations.length === 0 ? (
            <EmptyState message="No accreditations added yet." />
          ) : (
            <Panel className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-center text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-12 border border-slate-200 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={
                            accreditations.length > 0 &&
                            selectedAccIds.length === accreditations.length
                          }
                          onChange={toggleSelectAllAcc}
                          disabled={!canManage}
                          aria-label="Select all accreditations"
                          className="h-4 w-4 disabled:cursor-not-allowed"
                        />
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-left">
                        Accreditation
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5">
                        Certificate Number
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5">
                        Validity
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5">
                        Scope
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {accreditations.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="border border-slate-200 px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={selectedAccIds.includes(row.id)}
                            onChange={() => toggleAccSelect(row.id)}
                            disabled={!canManage}
                            aria-label={`Select ${row.accreditation_name}`}
                            className="h-4 w-4 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-left font-medium text-slate-900">
                          {row.accreditation_name}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-slate-700">
                          {row.certificate_number || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-slate-700">
                          {row.validity_date
                            ? new Date(row.validity_date).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="max-w-xs truncate border border-slate-200 px-3 py-2.5 text-slate-700">
                          {row.scope || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditAccreditation(row)}
                              disabled={!canManage}
                              title={
                                canManage
                                  ? "Edit"
                                  : "Only Organization Admin can edit"
                              }
                              aria-label="Edit accreditation"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-base leading-none hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteAccreditation(row)}
                              disabled={!canManage}
                              title={
                                canManage
                                  ? "Delete"
                                  : "Only Organization Admin can delete"
                              }
                              aria-label="Delete accreditation"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-base leading-none hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-rose-50"
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

          {showAccModal ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
              role="dialog"
              aria-modal="true"
              onClick={() => {
                if (!accSubmitting) {
                  resetAccForm();
                  setShowAccModal(false);
                }
              }}
            >
              <div
                className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {editingAccId ? "Edit Accreditation" : "Add Accreditation"}
                  </h2>
                  <button
                    type="button"
                    disabled={accSubmitting}
                    onClick={() => {
                      resetAccForm();
                      setShowAccModal(false);
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
                <div className="grid gap-3">
                  <label className="text-xs font-semibold text-slate-700">
                    Name of Accreditation
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                      value={accForm.accreditation_name}
                      onChange={(e) =>
                        setAccForm((f) => ({
                          ...f,
                          accreditation_name: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select accreditation</option>
                      {ACCREDITATION_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-700">
                    Certificate Number
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                      value={accForm.certificate_number}
                      onChange={(e) =>
                        setAccForm((f) => ({
                          ...f,
                          certificate_number: e.target.value,
                        }))
                      }
                      placeholder="e.g. TC-1234"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">
                    Validity
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                      value={accForm.validity_date}
                      onChange={(e) =>
                        setAccForm((f) => ({
                          ...f,
                          validity_date: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">
                    Scope
                    <textarea
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                      rows={3}
                      value={accForm.scope}
                      onChange={(e) =>
                        setAccForm((f) => ({ ...f, scope: e.target.value }))
                      }
                      placeholder="Scope of accreditation"
                    />
                  </label>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={accSubmitting}
                    onClick={() => void saveAccreditation()}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {accSubmitting ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={accSubmitting}
                    onClick={() => {
                      resetAccForm();
                      setShowAccModal(false);
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
      )}
    </div>
  );
}


export function OrgTrainingPlanPage() {
  const { profile } = useAuth();
  const readOnly = useWorkspaceReadOnly();
  const [requests, setRequests] = useState<TrainingRequest[]>([]);
  const [programmes, setProgrammes] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [reqForm, setReqForm] = useState({
    programme_id: "",
    preferred_date: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [viewingRequest, setViewingRequest] = useState<TrainingRequest | null>(
    null,
  );
  const [requestEmployees, setRequestEmployees] = useState<Profile[]>([]);
  const [loadingRequestEmployees, setLoadingRequestEmployees] = useState(false);

  async function loadPlanData() {
    if (!profile?.org_id) return;
    const [reqs, progs, emps] = await Promise.all([
      supabase
        .from("training_requests")
        .select("*")
        .eq("org_id", profile.org_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("training_programmes")
        .select("id, title")
        .eq("status", "published")
        .order("title"),
      supabase
        .from("profiles")
        .select("*")
        .eq("org_id", profile.org_id)
        .in("role", ["org_admin", "org_employee"])
        .eq("is_active", true)
        .order("full_name"),
    ]);
    setRequests((reqs.data ?? []) as TrainingRequest[]);
    setProgrammes((progs.data ?? []) as Array<{ id: string; title: string }>);
    const memberList = ((emps.data ?? []) as Profile[]).slice().sort((a, b) => {
      if (a.role !== b.role) {
        if (a.role === "org_admin") return -1;
        if (b.role === "org_admin") return 1;
      }
      return (a.full_name || a.email || "").localeCompare(
        b.full_name || b.email || "",
      );
    });
    setEmployees(memberList);
    setSelectedRequestIds((prev) =>
      prev.filter((id) => (reqs.data ?? []).some((r) => r.id === id)),
    );
  }

  useEffect(() => {
    if (!profile?.org_id) return;
    void loadPlanData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id]);

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

  async function openRequestEmployees(request: TrainingRequest) {
    setViewingRequest(request);
    setRequestEmployees([]);
    const ids = request.employee_ids ?? [];
    if (ids.length === 0) return;
    setLoadingRequestEmployees(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .in("id", ids);
      setRequestEmployees((data ?? []) as Profile[]);
    } finally {
      setLoadingRequestEmployees(false);
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
    setSelectedEmployeeIds([]);
    setShowEmployeePicker(false);
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
    setSelectedEmployeeIds(request.employee_ids ?? []);
    setShowEmployeePicker(true);
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

  function toggleEmployee(id: string) {
    setSelectedEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (selectedEmployeeIds.length === employees.length) {
      setSelectedEmployeeIds([]);
    } else {
      setSelectedEmployeeIds(employees.map((e) => e.id));
    }
  }

  async function submitRequest() {
    setMessage(null);
    setError(null);
    if (readOnly || !profile?.org_id) return;

    if (!reqForm.programme_id) {
      setError("Please select a Training Programme.");
      return;
    }
    if (!reqForm.preferred_date) {
      setError("Please select a Training Date.");
      return;
    }
    if (selectedEmployeeIds.length === 0) {
      setError("Please select at least one employee.");
      return;
    }

    const programme = programmes.find((p) => p.id === reqForm.programme_id);
    const selectedNames = employees
      .filter((e) => selectedEmployeeIds.includes(e.id))
      .map((e) => e.full_name || e.email || e.employee_code)
      .join(", ");

    setSubmitting(true);
    try {
      if (editingRequestId) {
        const { error: err } = await supabase
          .from("training_requests")
          .update({
            programme_id: reqForm.programme_id,
            title: `Request: ${programme?.title ?? "Training"}`,
            message: `Employees requested: ${selectedNames}`,
            preferred_date: reqForm.preferred_date,
            employee_ids: selectedEmployeeIds,
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
          message: `Employees requested: ${selectedNames}`,
          preferred_date: reqForm.preferred_date,
          requested_by: profile.id,
          employee_ids: selectedEmployeeIds,
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
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
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
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editingRequestId ? "Edit Training Request" : "Request Training"}
                </h2>
              </div>
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

            <div className="grid gap-3">
              <div className="grid grid-cols-[3fr_1fr] gap-3">
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

              <div>
                <button
                  type="button"
                  onClick={() => setShowEmployeePicker((open) => !open)}
                  className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  {showEmployeePicker ? "Hide Members" : "Add Participants"}
                  {selectedEmployeeIds.length > 0
                    ? ` (${selectedEmployeeIds.length} selected)`
                    : ""}
                </button>

                {showEmployeePicker ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {employees.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No members found. Add employees first.
                      </p>
                    ) : (
                      <>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Organization members (Admin + Employees)
                          </p>
                          <button
                            type="button"
                            onClick={toggleSelectAll}
                            className="text-xs font-semibold text-emerald-700"
                          >
                            {selectedEmployeeIds.length === employees.length
                              ? "Clear all"
                              : "Select all"}
                          </button>
                        </div>
                        <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="w-10 px-3 py-2 font-semibold">
                                  <span className="sr-only">Select</span>
                                </th>
                                <th className="px-3 py-2 font-semibold">
                                  Employee ID
                                </th>
                                <th className="px-3 py-2 font-semibold">
                                  Name
                                </th>
                                <th className="px-3 py-2 font-semibold">
                                  Role
                                </th>
                                <th className="px-3 py-2 font-semibold">
                                  Department
                                </th>
                                <th className="px-3 py-2 font-semibold">
                                  Designation
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {employees.map((emp) => {
                                const checked = selectedEmployeeIds.includes(
                                  emp.id,
                                );
                                return (
                                  <tr
                                    key={emp.id}
                                    className="border-t border-slate-100 hover:bg-emerald-50/40"
                                  >
                                    <td className="px-3 py-2">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleEmployee(emp.id)}
                                        className="h-4 w-4"
                                        aria-label={`Select ${emp.full_name || emp.employee_code || "member"}`}
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">
                                      {emp.employee_code ?? "—"}
                                    </td>
                                    <td className="px-3 py-2 font-medium text-slate-900">
                                      {emp.full_name || "—"}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">
                                      {emp.role === "org_admin"
                                        ? "Admin"
                                        : "Employee"}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">
                                      {emp.department ?? "—"}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">
                                      {emp.designation ?? "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitRequest()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
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
        <Panel className="mb-6 !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-center text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-12 border border-slate-200 px-3 py-2.5">
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
                  <th className="border border-slate-200 px-3 py-2.5">
                    Preferred Date
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5">
                    Employees
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5">
                    Status
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5">
                    Submitted
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="border border-slate-200 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedRequestIds.includes(r.id)}
                        onChange={() => toggleRequestSelect(r.id)}
                        aria-label={`Select ${programmeTitle(r.programme_id)}`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-left font-medium text-slate-900">
                      {programmeTitle(r.programme_id)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-slate-700">
                      {r.preferred_date
                        ? new Date(r.preferred_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => void openRequestEmployees(r)}
                        className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Employees ({r.employee_ids?.length ?? 0})
                      </button>
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5">
                      {statusBadge(r.status)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-slate-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5">
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

      {viewingRequest ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setViewingRequest(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Requested Employees
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {programmeTitle(viewingRequest.programme_id)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRequest(null)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-2xl leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-60"
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>
            {loadingRequestEmployees ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Loading employees…
              </p>
            ) : requestEmployees.length === 0 ? (
              <EmptyState message="No employees linked to this request." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-center text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">Employee ID</th>
                      <th className="px-3 py-2.5">Name</th>
                      <th className="px-3 py-2.5">Department</th>
                      <th className="px-3 py-2.5">Designation</th>
                      <th className="px-3 py-2.5">Mobile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestEmployees.map((emp) => (
                      <tr key={emp.id} className="border-t border-slate-100">
                        <td className="px-3 py-2.5 text-slate-700">
                          {emp.employee_code ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {emp.full_name || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {emp.department ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {emp.designation ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {emp.mobile ?? "—"}
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

export function OrgAssignedTrainingsPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<
    Array<{
      id: string;
      title: string;
      starts_at: string | null;
      meeting_platform: string | null;
      meeting_link: string | null;
      meeting_password: string | null;
      location: string | null;
      status: string;
    }>
  >([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!profile?.org_id) return;
    void (async () => {
      const [{ data: sessions }, { data: requests }] = await Promise.all([
        supabase
          .from("training_sessions")
          .select("*")
          .eq("org_id", profile.org_id)
          .order("starts_at", { ascending: true }),
        supabase
          .from("training_requests")
          .select("*")
          .eq("org_id", profile.org_id)
          .in("status", ["approved", "hold", "scheduled", "completed"])
          .order("updated_at", { ascending: false }),
      ]);

      const sessionList = (sessions ?? []) as TrainingSession[];
      const requestList = (requests ?? []) as TrainingRequest[];
      const programmeIds = [
        ...new Set(
          requestList
            .map((r) => r.programme_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const { data: programmes } = programmeIds.length
        ? await supabase
            .from("training_programmes")
            .select("id, title")
            .in("id", programmeIds)
        : { data: [] as Array<{ id: string; title: string }> };
      const programmeMap = new Map(
        ((programmes ?? []) as Array<{ id: string; title: string }>).map(
          (p) => [p.id, p.title],
        ),
      );

      const linkedSessionIds = new Set(
        requestList
          .map((r) => r.session_id)
          .filter((id): id is string => Boolean(id)),
      );
      const next: Array<{
        id: string;
        title: string;
        starts_at: string | null;
        meeting_platform: string | null;
        meeting_link: string | null;
        meeting_password: string | null;
        location: string | null;
        status: string;
      }> = [];

      for (const r of requestList) {
        const linked = r.session_id
          ? sessionList.find((s) => s.id === r.session_id)
          : null;
        next.push({
          id: `req-${r.id}`,
          title:
            (r.programme_id && programmeMap.get(r.programme_id)) ||
            r.title.replace(/^(Request|Assigned):\s*/i, "") ||
            "Training",
          starts_at: linked?.starts_at ?? r.training_date,
          meeting_platform: linked?.meeting_platform ?? null,
          meeting_link: linked?.meeting_link ?? null,
          meeting_password: linked?.meeting_password ?? null,
          location: linked?.location ?? null,
          status: r.status,
        });
      }

      for (const s of sessionList) {
        if (linkedSessionIds.has(s.id)) continue;
        next.push({
          id: `ses-${s.id}`,
          title: s.title,
          starts_at: s.starts_at,
          meeting_platform: s.meeting_platform,
          meeting_link: s.meeting_link,
          meeting_password: s.meeting_password ?? null,
          location: s.location,
          status: s.status,
        });
      }

      setRows(next);
      setSelectedIds((prev) => prev.filter((id) => next.some((r) => r.id === id)));
    })();
  }, [profile?.org_id]);

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

  function platformLabel(value: string | null, location: string | null) {
    if (value === "in_app") return "Online Meeting";
    const label = meetingPlatformLabel(value ?? undefined);
    return label !== "—" ? label : location || "—";
  }

  function externalJoinHref(raw: string | null | undefined): string | null {
    const href = externalMeetingHref(raw);
    if (!href || !/^https?:\/\//i.test(href)) return null;
    return href;
  }

  return (
    <div>
      <PageHeader title="Assigned Trainings" />
      {rows.length === 0 ? (
        <EmptyState message="No sessions assigned to your organization yet." />
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
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        aria-label={`Select ${s.title}`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-left font-medium text-slate-900">
                      {s.title}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {s.starts_at
                        ? new Date(s.starts_at).toLocaleString("en-IN")
                        : "TBD"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {platformLabel(s.meeting_platform, s.location)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center capitalize text-slate-700">
                      {s.status}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      {(() => {
                        const href = externalJoinHref(s.meeting_link);
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
                            {s.meeting_password ? (
                              <span className="text-[11px] text-slate-500">
                                Password:{" "}
                                <span className="font-semibold text-slate-700">
                                  {s.meeting_password}
                                </span>
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
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

export function OrgProgrammeRequestPage() {
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
    if (!profile?.org_id) return;
    const { data } = await supabase
      .from("training_programmes")
      .select("*")
      .eq("submitted_by_org_id", profile.org_id)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as TrainingProgramme[];
    setSubmittedProgrammes(list);
    setSelectedIds((prev) =>
      prev.filter((id) => list.some((p) => p.id === id)),
    );
  }

  useEffect(() => {
    if (!profile?.org_id) return;
    void loadSubmitted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id]);

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
    if (readOnly || !profile?.org_id) return;
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
          submitted_by_org_id: profile.org_id,
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
              className="rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
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
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
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
                  const canEdit = !readOnly;
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
                                : "View only — editing disabled"
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
                                : "View only — deleting disabled"
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
