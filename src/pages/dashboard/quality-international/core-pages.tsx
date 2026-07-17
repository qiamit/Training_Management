import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
} from "@/components/dashboard-shell";
import { useAuth } from "@/features/auth/AuthProvider";
import { externalMeetingHref } from "@/lib/meetings/links";
import { ensureTrainingPaymentInvoice } from "@/lib/invoices/training-payment-invoice";
import { supabase } from "@/lib/supabase/client";
import type {
  CompanyAiProvider,
  CompanyAiSkill,
  CompanySettings,
  Invoice,
  Organization,
  Profile,
  TrainingParticipantPayment,
  TrainingParticipantPaymentStatus,
  TrainingProgramme,
  TrainingRequest,
  TrainingSession,
} from "@/lib/supabase/types";

type AssignCandidate = Profile & {
  org_name: string | null;
  source_label: string;
};

function inr(cents: number) {
  return `₹${(cents / 100).toLocaleString("en-IN")}`;
}

export function QiOverviewPage() {
  const [stats, setStats] = useState({
    orgs: 0,
    individuals: 0,
    programmes: 0,
    sessions: 0,
    enrollments: 0,
    pending: 0,
    requests: 0,
    revenuePaid: 0,
  });
  const [upcoming, setUpcoming] = useState<TrainingSession[]>([]);
  const [requests, setRequests] = useState<TrainingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "error">(
    "connecting",
  );
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function loadOverview() {
    const [
      orgs,
      individuals,
      programmes,
      sessions,
      enrollments,
      pending,
      reqCount,
      paidInvoices,
      upcomingRes,
      reqRows,
    ] = await Promise.all([
      supabase
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("type", "tenant"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "individual"),
      supabase
        .from("training_programmes")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
      supabase
        .from("training_sessions")
        .select("id", { count: "exact", head: true })
        .in("status", ["scheduled", "in_progress"]),
      supabase.from("enrollments").select("id", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending"),
      supabase
        .from("training_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase.from("invoices").select("amount_cents").eq("status", "paid"),
      supabase
        .from("training_sessions")
        .select("*")
        .in("status", ["scheduled", "in_progress"])
        .order("starts_at", { ascending: true })
        .limit(5),
      supabase
        .from("training_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const paid = ((paidInvoices.data ?? []) as Invoice[]).reduce(
      (sum, row) => sum + (row.amount_cents ?? 0),
      0,
    );

    setStats({
      orgs: orgs.count ?? 0,
      individuals: individuals.count ?? 0,
      programmes: programmes.count ?? 0,
      sessions: sessions.count ?? 0,
      enrollments: enrollments.count ?? 0,
      pending: pending.count ?? 0,
      requests: reqCount.count ?? 0,
      revenuePaid: paid,
    });
    setUpcoming((upcomingRes.data ?? []) as TrainingSession[]);
    setRequests((reqRows.data ?? []) as TrainingRequest[]);
    setLastUpdated(new Date());
    setLoading(false);
  }

  useEffect(() => {
    void loadOverview();

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void loadOverview();
      }, 400);
    };

    const channel = supabase
      .channel("qi-overview-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "organizations" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "training_programmes" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "training_sessions" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "enrollments" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "training_requests" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        scheduleRefresh,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLiveStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setLiveStatus("error");
        } else {
          setLiveStatus("connecting");
        }
      });

    const pollId = window.setInterval(() => {
      void loadOverview();
    }, 30000);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="QI Control Center"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ring-1 ${
                liveStatus === "live"
                  ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                  : liveStatus === "error"
                    ? "bg-amber-50 text-amber-800 ring-amber-200"
                    : "bg-slate-50 text-slate-600 ring-slate-200"
              }`}
              title={
                lastUpdated
                  ? `Last updated ${lastUpdated.toLocaleTimeString()}`
                  : undefined
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  liveStatus === "live"
                    ? "animate-pulse bg-emerald-500"
                    : liveStatus === "error"
                      ? "bg-amber-500"
                      : "bg-slate-400"
                }`}
                aria-hidden="true"
              />
              {liveStatus === "live"
                ? "Live"
                : liveStatus === "error"
                  ? "Polling"
                  : "Connecting"}
              {lastUpdated ? (
                <span className="font-medium text-slate-500">
                  · {lastUpdated.toLocaleTimeString()}
                </span>
              ) : null}
            </span>
            <Link
              to="/dashboard/quality-international/assign-programmes"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
            >
              Assign programmes
            </Link>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Organizations" value={loading ? "…" : stats.orgs} />
        <StatCard
          label="Individuals"
          value={loading ? "…" : stats.individuals}
        />
        <StatCard
          label="Published programmes"
          value={loading ? "…" : stats.programmes}
        />
        <StatCard
          label="Active sessions"
          value={loading ? "…" : stats.sessions}
        />
        <StatCard
          label="Enrollments"
          value={loading ? "…" : stats.enrollments}
        />
        <StatCard
          label="Pending approvals"
          value={loading ? "…" : stats.pending}
        />
        <StatCard
          label="Open requests"
          value={loading ? "…" : stats.requests}
        />
        <StatCard
          label="Paid revenue"
          value={loading ? "…" : inr(stats.revenuePaid)}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="text-sm font-semibold text-slate-900">
            Upcoming sessions
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState message="No upcoming sessions. Assign a programme and send invitations to schedule delivery." />
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {upcoming.map((s) => (
                <li
                  key={s.id}
                  className="flex justify-between gap-2 border-b border-slate-100 pb-2"
                >
                  <span className="font-medium">{s.title}</span>
                  <span className="text-xs text-slate-500">
                    {s.starts_at
                      ? new Date(s.starts_at).toLocaleString()
                      : "TBD"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Pending training requests
            </h2>
            <Link
              to="/dashboard/quality-international/training-requests"
              className="text-xs font-semibold text-indigo-600"
            >
              View all
            </Link>
          </div>
          {requests.length === 0 ? (
            <EmptyState message="No pending requests from organizations." />
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {requests.map((r) => (
                <li key={r.id} className="border-b border-slate-100 pb-2">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-xs text-slate-500">{r.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

const emptyOrgForm = {
  organizationName: "",
  industry: "",
  employeeCount: "",
  city: "",
  state: "",
  country: "",
  address: "",
  pinCode: "",
  gstNumber: "",
  contactPersonName: "",
  contactEmail: "",
  contactPhone: "",
  adminFullName: "",
  adminEmail: "",
  adminPassword: "",
  confirmPassword: "",
  adminDesignation: "",
};

export function QiOrganizationsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<
    Array<
      Organization & {
        member_count?: number;
        pending_request_count?: number;
        contact_display_name?: string | null;
      }
    >
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgForm, setOrgForm] = useState(emptyOrgForm);
  const [viewOrg, setViewOrg] = useState<Organization | null>(null);
  const [orgRequests, setOrgRequests] = useState<
    Array<TrainingRequest & { programme_title?: string }>
  >([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [employeesOrg, setEmployeesOrg] = useState<Organization | null>(null);
  const [orgEmployees, setOrgEmployees] = useState<Profile[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [search, setSearch] = useState("");

  function openOrgWorkspace(org: Organization) {
    navigate(
      `/dashboard/quality-international/org-workspace/${org.id}/programme-request`,
    );
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((org) => {
      const haystack = [
        org.name,
        org.industry,
        org.employee_count,
        org.city,
        org.state,
        org.country,
        org.address,
        org.pin_code,
        org.contact_email,
        org.contact_phone,
        org.contact_person_name,
        org.contact_display_name,
        org.gst_number,
        org.status,
        org.notes,
        String(org.member_count ?? ""),
        String(org.pending_request_count ?? ""),
        ...(org.iso_accreditations ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search]);

  async function load() {
    const [
      { data: orgs },
      { data: members },
      { data: pendingReqs },
      { data: admins },
    ] = await Promise.all([
      supabase
        .from("organizations")
        .select("*")
        .eq("type", "tenant")
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("org_id")
        .in("role", ["org_admin", "org_employee"]),
      supabase
        .from("training_requests")
        .select("org_id")
        .eq("status", "pending")
        .not("org_id", "is", null),
      supabase
        .from("profiles")
        .select("org_id, full_name")
        .eq("role", "org_admin"),
    ]);

    const countByOrg = new Map<string, number>();
    for (const m of members ?? []) {
      if (!m.org_id) continue;
      countByOrg.set(m.org_id, (countByOrg.get(m.org_id) ?? 0) + 1);
    }

    const pendingByOrg = new Map<string, number>();
    for (const r of pendingReqs ?? []) {
      if (!r.org_id) continue;
      pendingByOrg.set(r.org_id, (pendingByOrg.get(r.org_id) ?? 0) + 1);
    }

    const adminNameByOrg = new Map<string, string>();
    for (const a of admins ?? []) {
      if (!a.org_id || !a.full_name) continue;
      if (!adminNameByOrg.has(a.org_id)) {
        adminNameByOrg.set(a.org_id, a.full_name);
      }
    }

    setRows(
      ((orgs ?? []) as Organization[]).map((o) => ({
        ...o,
        member_count: countByOrg.get(o.id) ?? 0,
        pending_request_count: pendingByOrg.get(o.id) ?? 0,
        contact_display_name:
          o.contact_person_name?.trim() ||
          adminNameByOrg.get(o.id) ||
          null,
      })),
    );
    setSelectedIds((prev) =>
      prev.filter((id) => (orgs ?? []).some((o) => o.id === id)),
    );
  }

  useEffect(() => {
    void load();

    const channel = supabase
      .channel("qi-org-request-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "training_requests" },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  async function openOrgRequests(org: Organization) {
    openOrgWorkspace(org);
  }

  async function openOrgEmployees(org: Organization) {
    setEmployeesOrg(org);
    setLoadingEmployees(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("profiles")
      .select("*")
      .eq("org_id", org.id)
      .in("role", ["org_admin", "org_employee"])
      .order("full_name");
    if (err) {
      setError(err.message);
      setOrgEmployees([]);
    } else {
      setOrgEmployees((data ?? []) as Profile[]);
    }
    setLoadingEmployees(false);
  }

  async function updateRequestStatus(id: string, status: string) {
    const { error: err } = await supabase
      .from("training_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    await load();
  }

  async function setStatus(id: string, status: string) {
    await supabase.from("organizations").update({ status }).eq("id", id);
    await load();
  }

  function updateOrgForm(field: keyof typeof emptyOrgForm, value: string) {
    setOrgForm((prev) => ({ ...prev, [field]: value }));
  }

  async function createOrganization() {
    setError(null);
    setMessage(null);

    if (!orgForm.organizationName.trim()) {
      setError("Organization name is required.");
      return;
    }
    if (!orgForm.adminFullName.trim()) {
      setError("Admin full name is required.");
      return;
    }
    if (!orgForm.adminEmail.trim() || !orgForm.adminPassword) {
      setError("Admin User ID (email) and password are required.");
      return;
    }
    if (orgForm.adminPassword !== orgForm.confirmPassword) {
      setError("Password and Confirm Password do not match.");
      return;
    }
    if (orgForm.adminPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSavingOrg(true);
    const { data, error: fnError } = await supabase.functions.invoke<{
      ok?: boolean;
      error?: string;
      adminEmail?: string;
    }>("create-organization", {
      body: {
        organizationName: orgForm.organizationName,
        industry: orgForm.industry,
        employeeCount: orgForm.employeeCount,
        city: orgForm.city,
        state: orgForm.state,
        country: orgForm.country,
        address: orgForm.address,
        pinCode: orgForm.pinCode,
        gstNumber: orgForm.gstNumber,
        contactPersonName: orgForm.contactPersonName,
        contactEmail: orgForm.contactEmail,
        contactPhone: orgForm.contactPhone,
        adminFullName: orgForm.adminFullName,
        adminEmail: orgForm.adminEmail,
        adminPassword: orgForm.adminPassword,
        adminDesignation: orgForm.adminDesignation,
      },
    });
    setSavingOrg(false);

    if (data?.error || !data?.ok) {
      setError(data?.error ?? fnError?.message ?? "Failed to create organization.");
      return;
    }
    if (fnError) {
      setError(fnError.message);
      return;
    }

    setMessage(
      `Organization created. Admin can sign in to Organization portal with ${orgForm.adminEmail.trim()}.`,
    );
    setOrgForm(emptyOrgForm);
    setShowAddModal(false);
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
      filteredRows.every((o) => selectedIds.includes(o.id))
    ) {
      setSelectedIds((prev) =>
        prev.filter((id) => !filteredRows.some((o) => o.id === id)),
      );
    } else {
      setSelectedIds((prev) => [
        ...new Set([...prev, ...filteredRows.map((o) => o.id)]),
      ]);
    }
  }

  return (
    <div>
      <PageHeader
        title="Organizations"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all fields…"
              aria-label="Search organizations"
              className="w-full min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:w-72"
            />
            <button
              type="button"
              onClick={() => {
                setError(null);
                setShowAddModal(true);
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Add Organization
            </button>
          </div>
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
          aria-labelledby="add-org-title"
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="add-org-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Add Organization
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create organization and portal login credentials for the org
                  admin.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  if (!savingOrg) setShowAddModal(false);
                }}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            {error ? (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                Organization Name *
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.organizationName}
                  onChange={(e) =>
                    updateOrgForm("organizationName", e.target.value)
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Industry
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.industry}
                  onChange={(e) => updateOrgForm("industry", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Employee Count
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.employeeCount}
                  onChange={(e) =>
                    updateOrgForm("employeeCount", e.target.value)
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                GST Number
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.gstNumber}
                  onChange={(e) => updateOrgForm("gstNumber", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Contact Phone
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.contactPhone}
                  onChange={(e) =>
                    updateOrgForm("contactPhone", e.target.value)
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                Address
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.address}
                  onChange={(e) => updateOrgForm("address", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                City
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.city}
                  onChange={(e) => updateOrgForm("city", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                State
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.state}
                  onChange={(e) => updateOrgForm("state", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                PIN Code
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.pinCode}
                  onChange={(e) => updateOrgForm("pinCode", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Country
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.country}
                  onChange={(e) => updateOrgForm("country", e.target.value)}
                />
              </label>

              <div className="sm:col-span-2 mt-2 border-t border-slate-200 pt-3">
                <h3 className="text-sm font-semibold text-slate-800">
                  Organization Portal Login
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Org admin will use these credentials to sign in to the
                  Organization portal.
                </p>
              </div>
              <label className="block text-xs font-semibold text-slate-600">
                Admin Full Name *
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.adminFullName}
                  onChange={(e) =>
                    updateOrgForm("adminFullName", e.target.value)
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Designation
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.adminDesignation}
                  onChange={(e) =>
                    updateOrgForm("adminDesignation", e.target.value)
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                User ID (Email) *
                <input
                  type="email"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.adminEmail}
                  onChange={(e) => updateOrgForm("adminEmail", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Contact Email
                <input
                  type="email"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.contactEmail}
                  onChange={(e) =>
                    updateOrgForm("contactEmail", e.target.value)
                  }
                  placeholder="Defaults to User ID"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Password *
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.adminPassword}
                  onChange={(e) =>
                    updateOrgForm("adminPassword", e.target.value)
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Confirm Password *
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.confirmPassword}
                  onChange={(e) =>
                    updateOrgForm("confirmPassword", e.target.value)
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                Contact Person Name
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={orgForm.contactPersonName}
                  onChange={(e) =>
                    updateOrgForm("contactPersonName", e.target.value)
                  }
                  placeholder="Defaults to Admin Full Name"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={savingOrg}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingOrg}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                onClick={() => void createOrganization()}
              >
                {savingOrg ? "Creating…" : "Create Organization"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {employeesOrg ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-employees-title"
        >
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2
                  id="view-employees-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Organization Employees
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {employeesOrg.name} · {orgEmployees.length} member
                  {orgEmployees.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  setEmployeesOrg(null);
                  setOrgEmployees([]);
                }}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            {loadingEmployees ? (
              <p className="text-sm text-slate-500">Loading employees…</p>
            ) : orgEmployees.length === 0 ? (
              <EmptyState message="No employees found for this organization." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="border border-slate-200 px-3 py-2.5 text-left">
                        Employee ID
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-left">
                        Name
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Role
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Designation
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Email
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Mobile
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgEmployees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50/80">
                        <td className="border border-slate-200 px-3 py-2.5 !text-left text-slate-700">
                          {emp.employee_code || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium text-slate-900">
                          {emp.full_name || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center capitalize text-slate-700">
                          {emp.role === "org_admin" ? "Admin" : "Employee"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                          {emp.designation || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                          {emp.email || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                          {emp.mobile || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                          {emp.is_active ? "Active" : "Inactive"}
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

      {viewOrg ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-requests-title"
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2
                  id="view-requests-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Training Requests
                </h2>
                <p className="mt-1 text-sm text-slate-500">{viewOrg.name}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/dashboard/quality-international/org-workspace/${viewOrg.id}/programme-request`}
                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  Open full dashboard
                </Link>
                <button
                  type="button"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                  onClick={() => {
                    setViewOrg(null);
                    setOrgRequests([]);
                  }}
                 title="Close" aria-label="Close">
                  ×
                </button>
              </div>
            </div>

            {loadingRequests ? (
              <p className="text-sm text-slate-500">Loading requests…</p>
            ) : orgRequests.length === 0 ? (
              <EmptyState message="No training requests from this organization." />
            ) : (
              <div className="grid gap-3">
                {orgRequests.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">
                            {r.title}
                          </p>
                          {r.status === "pending" ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                              New
                            </span>
                          ) : null}
                        </div>
                        {r.message ? (
                          <p className="mt-1 text-sm text-slate-600">
                            {r.message}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-500">
                          {r.programme_title ?? "Custom"} · {r.status}
                          {r.preferred_date
                            ? ` · preferred ${r.preferred_date}`
                            : ""}{" "}
                          · {new Date(r.created_at).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {["pending", "approved", "scheduled", "rejected"].map(
                          (st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => void updateRequestStatus(r.id, st)}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${
                                r.status === st
                                  ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {st}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState message="No tenant organizations yet." />
      ) : filteredRows.length === 0 ? (
        <EmptyState message="No organizations match your search." />
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
                        filteredRows.length > 0 &&
                        filteredRows.every((o) => selectedIds.includes(o.id))
                      }
                      onChange={toggleSelectAll}
                      aria-label="Select all organizations"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Name
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Industry
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Employee
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Contact
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
                {filteredRows.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50/80">
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(org.id)}
                        onChange={() => toggleSelect(org.id)}
                        aria-label={`Select ${org.name}`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium text-slate-900">
                      {org.name}
                      <div className="text-xs font-normal text-slate-500">
                        {[
                          org.address,
                          org.city,
                          org.pin_code,
                          org.state,
                          org.country,
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </div>
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {org.industry ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      <button
                        type="button"
                        className="text-sm font-semibold text-indigo-600 underline-offset-2 hover:underline"
                        onClick={() => void openOrgEmployees(org)}
                        aria-label={`View employees of ${org.name}`}
                      >
                        {org.member_count ?? 0} View
                      </button>
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-xs text-slate-700">
                      <div className="font-semibold text-slate-900">
                        {org.contact_display_name ||
                          org.contact_person_name ||
                          "—"}
                      </div>
                      <div>{org.contact_email ?? "—"}</div>
                      <div>{org.contact_phone || "—"}</div>
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <select
                        className={`rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize ${
                          org.status === "active"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-slate-300 bg-slate-50 text-slate-700"
                        }`}
                        value={org.status === "inactive" ? "inactive" : "active"}
                        aria-label={`Status for ${org.name}`}
                        onChange={(e) =>
                          void setStatus(org.id, e.target.value)
                        }
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <button
                        type="button"
                        className="relative inline-flex items-center rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => openOrgWorkspace(org)}
                      >
                        View Request
                        {(org.pending_request_count ?? 0) > 0 ? (
                          <span
                            className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white"
                            aria-label={`${org.pending_request_count} pending requests`}
                          >
                            {org.pending_request_count! > 99
                              ? "99+"
                              : org.pending_request_count}
                          </span>
                        ) : null}
                      </button>
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

type ApprovedRequestRow = TrainingRequest & {
  org_name: string;
  programme_title: string;
  requester_name: string;
  trainer_name?: string;
  meeting_link?: string | null;
  meeting_platform?: string | null;
};

function ScheduleDateInput({
  value,
  ariaLabel,
  onCommit,
}: {
  value: string | null;
  ariaLabel: string;
  onCommit: (next: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(value ?? "");
    }
  }, [value]);

  return (
    <input
      type="date"
      value={draft}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focusedRef.current = false;
        const next = draft.trim() || null;
        const prev = value?.trim() || null;
        if (next !== prev) {
          onCommit(next);
        } else {
          setDraft(value ?? "");
        }
      }}
      aria-label={ariaLabel}
      className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700"
    />
  );
}

function inviteWhenLabel(trainingDate: string, trainingTime: string) {
  if (!trainingDate) return "TBD";
  const startsAt = new Date(`${trainingDate}T${trainingTime || "00:00"}:00`);
  if (Number.isNaN(startsAt.getTime())) return "TBD";
  return startsAt.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function buildInviteEmailHtml(args: {
  name: string;
  title: string;
  when: string;
  platformLabel: string;
  trainer: string;
  link: string;
  password?: string;
}) {
  const password = args.password?.trim() || "";
  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 12px">Training Invitation</h2>
      <p>Hello ${args.name},</p>
      <p>You are invited to the following training:</p>
      <ul>
        <li><strong>Programme:</strong> ${args.title}</li>
        <li><strong>Date &amp; time:</strong> ${args.when}</li>
        <li><strong>Platform:</strong> ${args.platformLabel}</li>
        <li><strong>Trainer:</strong> ${args.trainer}</li>
        ${
          password
            ? `<li><strong>Meeting password:</strong> ${password}</li>`
            : ""
        }
      </ul>
      ${
        args.link
          ? `<p><a href="${args.link}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600">Join Meeting</a></p><p style="font-size:12px;color:#64748b">Or open: ${args.link}</p>`
          : "<p style=\"color:#64748b\">Meeting link will appear once added.</p>"
      }
      <p style="margin-top:18px;font-size:13px;color:#64748b">
        This training is also available in your portal under <strong>Assigned Trainings</strong>.
      </p>
    </div>
  `;
}

export function QiAssignProgrammesPage() {
  const { profile: qiProfile, isTrainerView } = useAuth();
  const isSuperAdmin = qiProfile?.role === "super_admin";
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [programmes, setProgrammes] = useState<TrainingProgramme[]>([]);
  const [trainers, setTrainers] = useState<Profile[]>([]);
  const [assignCandidates, setAssignCandidates] = useState<AssignCandidate[]>(
    [],
  );
  const [approvedRequests, setApprovedRequests] = useState<
    ApprovedRequestRow[]
  >([]);
  const [assign, setAssign] = useState({
    programmeId: "",
    trainerId: "",
    trainingDate: "",
    status: "hold" as "hold" | "scheduled",
    participantIds: [] as string[],
  });
  const [programmeSearch, setProgrammeSearch] = useState("");
  const [programmePickerOpen, setProgrammePickerOpen] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showParticipantPicker, setShowParticipantPicker] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const [pickerDraftIds, setPickerDraftIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [viewingParticipants, setViewingParticipants] =
    useState<ApprovedRequestRow | null>(null);
  const [participantProfiles, setParticipantProfiles] = useState<Profile[]>(
    [],
  );
  const [participantPayments, setParticipantPayments] = useState<
    Record<string, TrainingParticipantPayment>
  >({});
  const [chargeDrafts, setChargeDrafts] = useState<Record<string, string>>({});
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<
    string[]
  >([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [paymentLinkDraft, setPaymentLinkDraft] = useState<{
    sourceUserId: string;
    orgId: string | null;
    orgName: string;
    participantIds: string[];
    participantNames: string[];
    perPersonCents: number;
    totalCents: number;
    bank: CompanySettings | null;
    orgAdmins: Profile[];
    isIndividual: boolean;
  } | null>(null);
  const [paymentLinkBusy, setPaymentLinkBusy] = useState(false);
  const [inviteRow, setInviteRow] = useState<ApprovedRequestRow | null>(null);
  const [inviteParticipants, setInviteParticipants] = useState<Profile[]>([]);
  const [inviteSelectedIds, setInviteSelectedIds] = useState<string[]>([]);
  const [inviteLoadingPeople, setInviteLoadingPeople] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    platform: "zoom",
    meetingLink: "",
    meetingPassword: "",
    trainingDate: "",
    trainingTime: "10:00",
  });
  const [showInviteDraft, setShowInviteDraft] = useState(false);
  const [inviteDraftAi, setInviteDraftAi] = useState({
    tone: "professional",
    messageType: "invitation",
    language: "english",
    length: "medium",
    extraInstructions: "",
  });
  const [inviteDraftCustom, setInviteDraftCustom] = useState<{
    subject: string;
    htmlBody: string;
  } | null>(null);
  const [inviteDraftAiBusy, setInviteDraftAiBusy] = useState(false);
  const [inviteDraftAiError, setInviteDraftAiError] = useState<string | null>(
    null,
  );
  const [tableSearch, setTableSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "hold" | "scheduled" | "completed" | "approved"
  >("all");
  const [trainerFilter, setTrainerFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState("");

  const meetingPlatforms = [
    { value: "zoom", label: "Zoom Meeting" },
    { value: "google_meet", label: "Google Meet" },
    { value: "webex", label: "Webex" },
    { value: "teams", label: "Microsoft Teams" },
    { value: "other", label: "Other" },
  ];

  async function load() {
    let requestsQuery = supabase
      .from("training_requests")
      .select("*")
      .in("status", ["approved", "hold", "scheduled", "completed"])
      .order("updated_at", { ascending: false });

    // Trainer login: only trainings assigned to this trainer
    if (isTrainerView && qiProfile?.id) {
      requestsQuery = requestsQuery.eq("trainer_id", qiProfile.id);
    }

    const [
      { data: orgRows },
      { data: progRows },
      { data: reqRows },
      { data: trainerRows },
      { data: peopleRows },
    ] = await Promise.all([
      supabase
        .from("organizations")
        .select("*")
        .eq("type", "tenant")
        .order("name"),
      supabase
        .from("training_programmes")
        .select("*")
        .eq("status", "published")
        .order("title"),
      requestsQuery,
      supabase
        .from("profiles")
        .select("*")
        .in("role", ["trainer", "super_admin", "employee"])
        .eq("is_active", true)
        .eq("approval_status", "approved")
        .order("full_name"),
      supabase
        .from("profiles")
        .select("*")
        .in("role", ["individual", "org_admin", "org_employee"])
        .eq("is_active", true)
        .eq("approval_status", "approved")
        .order("full_name"),
    ]);

    const orgList = (orgRows ?? []) as Organization[];
    const progList = (progRows ?? []) as TrainingProgramme[];
    const trainerList = (trainerRows ?? []) as Profile[];
    let requests = (reqRows ?? []) as TrainingRequest[];
    if (isTrainerView && qiProfile?.id) {
      requests = requests.filter((r) => r.trainer_id === qiProfile.id);
    }
    const orgNameById = new Map(orgList.map((o) => [o.id, o.name]));
    const progTitleById = new Map(progList.map((p) => [p.id, p.title]));
    const trainerNameById = new Map(
      trainerList.map((t) => [
        t.id,
        t.full_name?.trim() || t.email || "Trainer",
      ]),
    );

    const people = (peopleRows ?? []) as Profile[];
    setAssignCandidates(
      people.map((p) => {
        const isIndividual = p.role === "individual";
        return {
          ...p,
          org_name: p.org_id ? orgNameById.get(p.org_id) ?? null : null,
          source_label: isIndividual
            ? "Individual"
            : orgNameById.get(p.org_id ?? "") || "Organization",
        };
      }),
    );

    const missingOrgIds = [
      ...new Set(
        requests
          .map((r) => r.org_id)
          .filter((id): id is string => Boolean(id) && !orgNameById.has(id)),
      ),
    ];
    const missingProgIds = [
      ...new Set(
        requests
          .map((r) => r.programme_id)
          .filter(
            (id): id is string => Boolean(id) && !progTitleById.has(id),
          ),
      ),
    ];
    const requesterIds = [
      ...new Set(
        requests
          .map((r) => r.requested_by)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const missingTrainerIds = [
      ...new Set(
        requests
          .map((r) => r.trainer_id)
          .filter(
            (id): id is string => Boolean(id) && !trainerNameById.has(id),
          ),
      ),
    ];

    if (missingOrgIds.length > 0) {
      const { data: extraOrgs } = await supabase
        .from("organizations")
        .select("id, name")
        .in("id", missingOrgIds);
      for (const o of extraOrgs ?? []) {
        orgNameById.set(o.id, o.name);
      }
    }
    if (missingProgIds.length > 0) {
      const { data: extraProgs } = await supabase
        .from("training_programmes")
        .select("id, title")
        .in("id", missingProgIds);
      for (const p of extraProgs ?? []) {
        progTitleById.set(p.id, p.title);
      }
    }
    if (missingTrainerIds.length > 0) {
      const { data: extraTrainers } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", missingTrainerIds);
      for (const t of extraTrainers ?? []) {
        trainerNameById.set(
          t.id,
          t.full_name?.trim() || t.email || "Trainer",
        );
      }
    }

    const requesterNameById = new Map<string, string>();
    if (requesterIds.length > 0) {
      const { data: people } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", requesterIds);
      for (const p of people ?? []) {
        requesterNameById.set(
          p.id,
          p.full_name?.trim() || p.email || "Requester",
        );
      }
    }

    const sessionIds = [
      ...new Set(
        requests
          .map((r) => r.session_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const sessionMeetingById = new Map<
      string,
      { meeting_link: string | null; meeting_platform: string | null }
    >();
    if (sessionIds.length > 0) {
      const { data: sessionRows } = await supabase
        .from("training_sessions")
        .select("id, meeting_link, meeting_platform")
        .in("id", sessionIds);
      for (const s of sessionRows ?? []) {
        sessionMeetingById.set(s.id, {
          meeting_link: s.meeting_link,
          meeting_platform: s.meeting_platform,
        });
      }
    }

    setOrgs(orgList);
    setProgrammes(progList);
    setTrainers(trainerList);
    setApprovedRequests(
      requests
        .map((r) => {
          const sessionMeeting = r.session_id
            ? sessionMeetingById.get(r.session_id)
            : null;
          return {
            ...r,
            org_name:
              (r.org_id && orgNameById.get(r.org_id)) ||
              (r.requested_by
                ? requesterNameById.get(r.requested_by) || "Individual"
                : "—"),
            programme_title: r.programme_id
              ? progTitleById.get(r.programme_id) ||
                r.title.replace(/^Request:\s*/i, "")
              : r.title.replace(/^Request:\s*/i, "") || "Custom request",
            requester_name: r.requested_by
              ? requesterNameById.get(r.requested_by) || "—"
              : "—",
            trainer_name: r.trainer_id
              ? trainerNameById.get(r.trainer_id)
              : undefined,
            meeting_link: sessionMeeting?.meeting_link ?? null,
            meeting_platform: sessionMeeting?.meeting_platform ?? null,
          };
        })
        .sort(
          (a, b) =>
            (b.employee_ids?.length ?? 0) - (a.employee_ids?.length ?? 0),
        ),
    );
    setSelectedIds((prev) =>
      prev.filter((id) => requests.some((r) => r.id === id)),
    );
  }

  useEffect(() => {
    void load();

    const channel = supabase
      .channel("qi-assign-approved-requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "training_requests" },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isTrainerView, qiProfile?.id]);

  function openAssignModal(prefill?: { programmeId?: string }) {
    setError(null);
    const programmeId = prefill?.programmeId ?? "";
    setAssign({
      programmeId,
      trainerId: "",
      trainingDate: "",
      status: "hold",
      participantIds: [],
    });
    setProgrammeSearch(
      programmes.find((p) => p.id === programmeId)?.title ?? "",
    );
    setProgrammePickerOpen(false);
    setShowParticipantPicker(false);
    setParticipantSearch("");
    setPickerDraftIds([]);
    setShowAssignModal(true);
  }

  function closeAssignModal() {
    if (saving) return;
    setShowAssignModal(false);
    setShowParticipantPicker(false);
    setAssign({
      programmeId: "",
      trainerId: "",
      trainingDate: "",
      status: "hold",
      participantIds: [],
    });
    setProgrammeSearch("");
    setParticipantSearch("");
    setPickerDraftIds([]);
  }

  function openParticipantPicker() {
    setPickerDraftIds(assign.participantIds);
    setParticipantSearch("");
    setShowParticipantPicker(true);
  }

  function confirmParticipantPicker() {
    setAssign((a) => ({ ...a, participantIds: pickerDraftIds }));
    setShowParticipantPicker(false);
  }

  function togglePickerParticipant(id: string) {
    setPickerDraftIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function togglePickerSelectAll(visibleIds: string[]) {
    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => pickerDraftIds.includes(id));
    if (allSelected) {
      setPickerDraftIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setPickerDraftIds((prev) => [
        ...new Set([...prev, ...visibleIds]),
      ]);
    }
  }

  async function assignProgramme() {
    setError(null);
    setMessage(null);
    if (!assign.programmeId) {
      setError("Select a programme.");
      return;
    }
    if (assign.participantIds.length === 0) {
      setError("Select at least one participant.");
      return;
    }
    if (assign.status === "scheduled") {
      if (!assign.trainerId) {
        setError("Select a trainer before setting status to Scheduled.");
        return;
      }
      if (!assign.trainingDate) {
        setError("Select training date before setting status to Scheduled.");
        return;
      }
    }

    const programme = programmes.find((p) => p.id === assign.programmeId);
    const selectedPeople = assignCandidates.filter((p) =>
      assign.participantIds.includes(p.id),
    );
    const orgIds = [
      ...new Set(
        selectedPeople
          .map((p) => p.org_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const orgId = orgIds.length === 1 ? orgIds[0] : null;
    const names = selectedPeople
      .map((p) => p.full_name?.trim() || p.email || "Participant")
      .slice(0, 8)
      .join(", ");

    setSaving(true);
    const { error: err } = await supabase.from("training_requests").insert({
      org_id: orgId,
      programme_id: assign.programmeId,
      title: `Assigned: ${programme?.title ?? "Training"}`,
      message: `Assigned by Quality International. Participants: ${names}${
        selectedPeople.length > 8 ? ` (+${selectedPeople.length - 8} more)` : ""
      }`,
      preferred_date: assign.trainingDate || null,
      status: assign.status,
      requested_by: qiProfile?.id ?? null,
      employee_ids: assign.participantIds,
      trainer_id: assign.trainerId || null,
      training_date: assign.trainingDate || null,
    });
    if (err) {
      setSaving(false);
      setError(err.message);
      return;
    }

    const notifyRows = assign.participantIds.map((userId) => {
      const person = selectedPeople.find((p) => p.id === userId);
      const link =
        person?.role === "org_admin"
          ? "/dashboard/organization/assigned-trainings"
          : "/dashboard/individual/assigned-trainings";
      return {
        user_id: userId,
        title: `Training assigned: ${programme?.title ?? "Programme"}`,
        body: `You have been assigned "${programme?.title ?? "a training programme"}". Open Assigned Trainings for details.`,
        link,
        kind: "training_assignment",
        metadata: { programme_id: assign.programmeId },
      };
    });
    if (notifyRows.length > 0) {
      await supabase.from("app_notifications").insert(notifyRows);
    }

    setSaving(false);
    setMessage("Programme assigned successfully.");
    closeAssignModal();
    await load();
  }

  async function updateRequestSchedule(
    row: ApprovedRequestRow,
    patch: {
      status?: "hold" | "scheduled" | "completed";
      trainer_id?: string | null;
      training_date?: string | null;
    },
  ) {
    setError(null);
    setMessage(null);
    const nextStatus =
      patch.status ??
      (row.status === "scheduled" ||
      row.status === "completed" ||
      row.status === "hold"
        ? (row.status as "hold" | "scheduled" | "completed")
        : "hold");
    const nextTrainerId =
      patch.trainer_id !== undefined ? patch.trainer_id : row.trainer_id;
    const nextDate =
      patch.training_date !== undefined
        ? patch.training_date
        : row.training_date;

    if (nextStatus === "scheduled" || nextStatus === "completed") {
      if (!nextTrainerId) {
        setError(
          `Select a trainer before setting status to ${
            nextStatus === "completed" ? "Completed" : "Scheduled"
          }.`,
        );
        return;
      }
      if (!nextDate) {
        setError(
          `Select training date before setting status to ${
            nextStatus === "completed" ? "Completed" : "Scheduled"
          }.`,
        );
        return;
      }
    }

    setRowBusyId(row.id);
    const { error: err } = await supabase
      .from("training_requests")
      .update({
        status: nextStatus,
        trainer_id: nextTrainerId,
        training_date: nextDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (err) {
      setRowBusyId(null);
      setError(err.message);
      return;
    }

    if (nextStatus === "completed" && row.session_id) {
      const { error: sessionErr } = await supabase
        .from("training_sessions")
        .update({
          status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.session_id);
      if (sessionErr) {
        setRowBusyId(null);
        setError(sessionErr.message);
        return;
      }
    }

    setRowBusyId(null);
    setMessage(
      nextStatus === "completed"
        ? "Training marked as Completed."
        : nextStatus === "scheduled"
          ? "Training marked as Scheduled."
          : "Training marked as Hold.",
    );
    await load();
  }

  async function openInviteModal(row: ApprovedRequestRow) {
    setError(null);
    setMessage(null);
    if (!row.programme_id) {
      setError("Programme is missing on this request.");
      return;
    }
    if (!row.trainer_id) {
      setError("Select a trainer before sending invitations.");
      return;
    }
    const ids = row.employee_ids ?? [];
    if (ids.length === 0) {
      setError("No trainees found on this request.");
      return;
    }
    setInviteRow(row);
    setInviteForm({
      platform: "zoom",
      meetingLink: "",
      meetingPassword: "",
      trainingDate: row.training_date ?? "",
      trainingTime: "10:00",
    });
    setInviteSelectedIds(ids);
    setInviteParticipants([]);
    setInviteLoadingPeople(true);
    try {
      const [{ data }, sessionResult] = await Promise.all([
        supabase.from("profiles").select("*").in("id", ids),
        row.session_id
          ? supabase
              .from("training_sessions")
              .select(
                "meeting_platform, meeting_link, meeting_password, starts_at",
              )
              .eq("id", row.session_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setInviteParticipants((data ?? []) as Profile[]);
      const session = sessionResult.data as {
        meeting_platform: string | null;
        meeting_link: string | null;
        meeting_password: string | null;
        starts_at: string | null;
      } | null;
      if (session) {
        const starts = session.starts_at ? new Date(session.starts_at) : null;
        setInviteForm((f) => ({
          ...f,
          platform:
            session.meeting_platform && session.meeting_platform !== "in_app"
              ? session.meeting_platform
              : f.platform,
          meetingLink: session.meeting_link || "",
          meetingPassword: session.meeting_password || "",
          trainingDate: starts
            ? starts.toISOString().slice(0, 10)
            : f.trainingDate,
          trainingTime: starts
            ? `${String(starts.getHours()).padStart(2, "0")}:${String(
                starts.getMinutes(),
              ).padStart(2, "0")}`
            : f.trainingTime,
        }));
      }
    } finally {
      setInviteLoadingPeople(false);
    }
  }

  function closeInviteModal() {
    if (rowBusyId) return;
    setInviteRow(null);
    setInviteParticipants([]);
    setInviteSelectedIds([]);
    setShowInviteDraft(false);
    setInviteDraftCustom(null);
    setInviteDraftAiError(null);
    setInviteDraftAi({
      tone: "professional",
      messageType: "invitation",
      language: "english",
      length: "medium",
      extraInstructions: "",
    });
  }

  function inviteDraftPreview() {
    if (!inviteRow) return null;
    const platformLabel =
      meetingPlatforms.find((p) => p.value === inviteForm.platform)?.label ||
      "Online Meeting";
    const trainerName =
      trainers.find((t) => t.id === inviteRow.trainer_id)?.full_name?.trim() ||
      trainers.find((t) => t.id === inviteRow.trainer_id)?.email ||
      "Trainer";
    const sample =
      inviteParticipants.find((p) => inviteSelectedIds.includes(p.id)) ||
      inviteParticipants[0];
    const traineeName = sample?.full_name?.trim() || "Trainee";
    if (inviteDraftCustom) {
      return {
        subject: inviteDraftCustom.subject,
        html: inviteDraftCustom.htmlBody.replaceAll("{{name}}", traineeName),
        htmlTemplate: inviteDraftCustom.htmlBody,
      };
    }
    return {
      subject: `Training Invitation: ${inviteRow.programme_title}`,
      html: buildInviteEmailHtml({
        name: traineeName,
        title: inviteRow.programme_title,
        when: inviteWhenLabel(
          inviteForm.trainingDate,
          inviteForm.trainingTime,
        ),
        platformLabel,
        trainer: trainerName,
        link: inviteForm.meetingLink.trim(),
        password: inviteForm.meetingPassword.trim(),
      }),
      htmlTemplate: null as string | null,
    };
  }

  async function generateInviteDraftWithAi() {
    if (!inviteRow) return;
    setInviteDraftAiError(null);
    setInviteDraftAiBusy(true);
    try {
      const platformLabel =
        meetingPlatforms.find((p) => p.value === inviteForm.platform)?.label ||
        "Online Meeting";
      const trainerName =
        trainers.find((t) => t.id === inviteRow.trainer_id)?.full_name?.trim() ||
        trainers.find((t) => t.id === inviteRow.trainer_id)?.email ||
        "Trainer";
      const sample =
        inviteParticipants.find((p) => inviteSelectedIds.includes(p.id)) ||
        inviteParticipants[0];
      const { data, error: fnError } = await supabase.functions.invoke<{
        ok?: boolean;
        subject?: string;
        htmlBody?: string;
        error?: string;
      }>("draft-training-invitation-email", {
        body: {
          traineeName: sample?.full_name?.trim() || "Trainee",
          programmeTitle: inviteRow.programme_title,
          whenLabel: inviteWhenLabel(
            inviteForm.trainingDate,
            inviteForm.trainingTime,
          ),
          platformLabel,
          trainerName,
          meetingLink: inviteForm.meetingLink.trim(),
          meetingPassword: inviteForm.meetingPassword.trim(),
          tone: inviteDraftAi.tone,
          messageType: inviteDraftAi.messageType,
          language: inviteDraftAi.language,
          length: inviteDraftAi.length,
          extraInstructions: inviteDraftAi.extraInstructions,
        },
      });
      if (fnError) {
        setInviteDraftAiError(
          data?.error || fnError.message || "AI draft request failed.",
        );
        return;
      }
      if (data?.error || !data?.subject || !data?.htmlBody) {
        setInviteDraftAiError(data?.error || "AI draft failed.");
        return;
      }
      setInviteDraftCustom({
        subject: data.subject,
        htmlBody: data.htmlBody,
      });
    } finally {
      setInviteDraftAiBusy(false);
    }
  }

  function toggleInviteParticipant(id: string) {
    setInviteSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleInviteSelectAll() {
    if (
      inviteParticipants.length > 0 &&
      inviteSelectedIds.length === inviteParticipants.length
    ) {
      setInviteSelectedIds([]);
    } else {
      setInviteSelectedIds(inviteParticipants.map((p) => p.id));
    }
  }

  async function sendInvitation() {
    if (!inviteRow) return;
    setError(null);
    setMessage(null);
    if (!inviteRow.programme_id) {
      setError("Programme is missing on this request.");
      return;
    }
    if (!inviteRow.trainer_id) {
      setError("Select a trainer before sending invitations.");
      return;
    }
    if (!inviteForm.trainingDate) {
      setError("Select training date.");
      return;
    }
    if (!inviteForm.trainingTime) {
      setError("Select training time.");
      return;
    }
    if (!inviteForm.meetingLink.trim()) {
      setError("Meeting link is required.");
      return;
    }
    if (inviteSelectedIds.length === 0) {
      setError("Select at least one participant.");
      return;
    }

    const startsAt = new Date(
      `${inviteForm.trainingDate}T${inviteForm.trainingTime}:00`,
    );
    if (Number.isNaN(startsAt.getTime())) {
      setError("Invalid training date/time.");
      return;
    }
    const startsAtIso = startsAt.toISOString();
    const platformLabel =
      meetingPlatforms.find((p) => p.value === inviteForm.platform)?.label ||
      "Online Meeting";
    const trainerName =
      trainers.find((t) => t.id === inviteRow.trainer_id)?.full_name?.trim() ||
      trainers.find((t) => t.id === inviteRow.trainer_id)?.email ||
      "Trainer";

    setRowBusyId(inviteRow.id);
    try {
      let sessionId = inviteRow.session_id;
      const sessionPayload = {
        programme_id: inviteRow.programme_id,
        title: inviteRow.programme_title,
        starts_at: startsAtIso,
        org_id: inviteRow.org_id,
        trainer_id: inviteRow.trainer_id,
        status: "scheduled" as const,
        capacity: inviteSelectedIds.length,
        mode: "online",
        location: platformLabel,
        meeting_platform: inviteForm.platform,
        meeting_link: inviteForm.meetingLink.trim(),
        meeting_password: inviteForm.meetingPassword.trim() || null,
        notes: `Invitation via ${platformLabel}`,
        updated_at: new Date().toISOString(),
      };

      if (sessionId) {
        const { error: sessionUpdateError } = await supabase
          .from("training_sessions")
          .update(sessionPayload)
          .eq("id", sessionId);
        if (sessionUpdateError) {
          setError(sessionUpdateError.message);
          return;
        }
      } else {
        const { data: session, error: sessionError } = await supabase
          .from("training_sessions")
          .insert(sessionPayload)
          .select("id")
          .single();
        if (sessionError || !session) {
          setError(
            sessionError?.message ?? "Failed to create training session.",
          );
          return;
        }
        sessionId = session.id;
      }

      const meetingLink = inviteForm.meetingLink.trim();

      const enrollmentRows = inviteSelectedIds.map((userId) => ({
        session_id: sessionId!,
        user_id: userId,
        status: "enrolled" as const,
      }));
      const { error: enrollError } = await supabase
        .from("enrollments")
        .upsert(enrollmentRows, { onConflict: "session_id,user_id" });
      if (enrollError) {
        setError(enrollError.message);
        return;
      }

      const { error: requestError } = await supabase
        .from("training_requests")
        .update({
          status: "scheduled",
          training_date: inviteForm.trainingDate,
          session_id: sessionId,
          invitation_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", inviteRow.id);
      if (requestError) {
        setError(requestError.message);
        return;
      }

      const { data: emailResult, error: emailFnError } =
        await supabase.functions.invoke<{
          ok?: boolean;
          emailsSent?: number;
          whatsappSent?: number;
          appNotificationsCreated?: number;
          emailConfigured?: boolean;
          whatsappConfigured?: boolean;
          whatsappLinks?: string[];
          error?: string;
        }>("send-training-invitation", {
          body: {
            sessionId,
            trainingRequestId: inviteRow.id,
            participantIds: inviteSelectedIds,
            programmeTitle: inviteRow.programme_title,
            meetingPlatform: inviteForm.platform,
            meetingLink,
            meetingPassword: inviteForm.meetingPassword.trim() || undefined,
            startsAt: startsAtIso,
            trainerName,
            emailSubject: inviteDraftCustom?.subject,
            emailHtmlTemplate: inviteDraftCustom?.htmlBody,
          },
        });

      if (emailFnError) {
        setMessage(
          `Invitation saved for ${inviteSelectedIds.length} trainee(s) in Assigned Trainings. Delivery error: ${emailFnError.message}`,
        );
      } else if (emailResult?.error) {
        setMessage(
          `Invitation saved for ${inviteSelectedIds.length} trainee(s). Delivery: ${emailResult.error}`,
        );
      } else {
        const emailPart = emailResult?.emailConfigured
          ? `Email: ${emailResult.emailsSent ?? 0}`
          : "Email: configure RESEND_API_KEY";
        const appPart = `App: ${emailResult?.appNotificationsCreated ?? inviteSelectedIds.length}`;
        const waPart = emailResult?.whatsappConfigured
          ? `WhatsApp: ${emailResult.whatsappSent ?? 0}`
          : `WhatsApp drafts: ${emailResult?.whatsappLinks?.length ?? 0}`;
        setMessage(
          `Invitation sent to ${inviteSelectedIds.length} trainee(s). ${emailPart}; ${waPart}; ${appPart}.`,
        );

        if (
          !emailResult?.whatsappConfigured &&
          emailResult?.whatsappLinks?.length
        ) {
          for (const wa of emailResult.whatsappLinks.slice(0, 8)) {
            window.open(wa, "_blank", "noopener,noreferrer");
          }
        }
      }

      setShowInviteDraft(false);
      setInviteRow(null);
      setInviteParticipants([]);
      setInviteSelectedIds([]);
      await load();
    } finally {
      setRowBusyId(null);
    }
  }

  async function openParticipants(row: ApprovedRequestRow) {
    setViewingParticipants(row);
    setParticipantProfiles([]);
    setParticipantPayments({});
    setChargeDrafts({});
    setSelectedParticipantIds([]);
    const ids = row.employee_ids ?? [];
    if (ids.length === 0) return;
    setLoadingParticipants(true);
    try {
      const [{ data: people }, { data: payments }] = await Promise.all([
        supabase.from("profiles").select("*").in("id", ids),
        supabase
          .from("training_participant_payments")
          .select("*")
          .eq("training_request_id", row.id)
          .in("user_id", ids),
      ]);

      const profiles = (people ?? []) as Profile[];
      setParticipantProfiles(profiles);

      const paymentMap: Record<string, TrainingParticipantPayment> = {};
      const drafts: Record<string, string> = {};
      for (const pay of (payments ?? []) as TrainingParticipantPayment[]) {
        paymentMap[pay.user_id] = pay;
        drafts[pay.user_id] = String(pay.amount_cents / 100);
      }
      for (const p of profiles) {
        if (drafts[p.id] == null) drafts[p.id] = "0";
      }
      setParticipantPayments(paymentMap);
      setChargeDrafts(drafts);
    } finally {
      setLoadingParticipants(false);
    }
  }

  function parseChargeRupees(raw: string): number {
    const n = Number(String(raw).replace(/,/g, "").trim());
    if (Number.isNaN(n) || n < 0) return 0;
    return Math.round(n * 100);
  }

  /** Same-organization employees on this training (individuals with no org stay alone). */
  function sameOrgParticipantIds(userId: string): string[] {
    const source = participantProfiles.find((p) => p.id === userId);
    if (!source?.org_id) return [userId];
    return participantProfiles
      .filter((p) => p.org_id === source.org_id)
      .map((p) => p.id);
  }

  function applyChargesToSameOrg(sourceUserId: string, value: string) {
    const ids = sameOrgParticipantIds(sourceUserId);
    setChargeDrafts((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = value;
      return next;
    });
  }

  async function upsertParticipantPayment(
    userId: string,
    amountCents: number,
    existing: TrainingParticipantPayment | undefined,
    status?: TrainingParticipantPaymentStatus,
  ) {
    if (!viewingParticipants) return null;
    const now = new Date().toISOString();
    if (existing) {
      const patch: Partial<TrainingParticipantPayment> = {
        amount_cents: amountCents,
        updated_at: now,
      };
      if (status) patch.payment_status = status;
      const { data, error: updErr } = await supabase
        .from("training_participant_payments")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (updErr) throw new Error(updErr.message);
      return data as TrainingParticipantPayment;
    }
    const { data, error: insErr } = await supabase
      .from("training_participant_payments")
      .insert({
        training_request_id: viewingParticipants.id,
        user_id: userId,
        amount_cents: amountCents,
        currency: "INR",
        payment_status: status ?? "pending",
      })
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);
    return data as TrainingParticipantPayment;
  }

  async function ensureParticipantPayment(
    userId: string,
    amountCents: number,
    status?: TrainingParticipantPaymentStatus,
  ) {
    return upsertParticipantPayment(
      userId,
      amountCents,
      participantPayments[userId],
      status,
    );
  }

  async function saveTrainingCharges(userId: string) {
    if (!viewingParticipants) return;
    setError(null);
    setPaymentBusyId(userId);
    try {
      const rawValue = chargeDrafts[userId] ?? "0";
      const amountCents = parseChargeRupees(rawValue);
      const displayValue = String(amountCents / 100);
      const targetIds = sameOrgParticipantIds(userId);

      // Auto-fill same amount for all employees of this organization
      applyChargesToSameOrg(userId, displayValue);

      const paymentsSnapshot = { ...participantPayments };
      const paymentUpdates: Record<string, TrainingParticipantPayment> = {};
      for (const id of targetIds) {
        const saved = await upsertParticipantPayment(
          id,
          amountCents,
          paymentsSnapshot[id],
        );
        if (!saved) continue;
        paymentsSnapshot[id] = saved;
        paymentUpdates[id] = saved;
      }

      setParticipantPayments((prev) => ({ ...prev, ...paymentUpdates }));
      setChargeDrafts((prev) => {
        const next = { ...prev };
        for (const id of targetIds) next[id] = displayValue;
        return next;
      });
      setMessage(
        targetIds.length > 1
          ? `Training charges ₹${displayValue} applied to ${targetIds.length} employees of the same organization.`
          : "Training charges saved.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save charges.");
    } finally {
      setPaymentBusyId(null);
    }
  }

  async function updatePaymentStatus(
    userId: string,
    status: TrainingParticipantPaymentStatus,
  ) {
    if (!viewingParticipants) return;
    setError(null);
    setPaymentBusyId(userId);
    try {
      const person = participantProfiles.find((p) => p.id === userId);
      const targetIds =
        status === "paid" || status === "link_sent" || status === "waived"
          ? sameOrgParticipantIds(userId)
          : [userId];
      const amountCents = parseChargeRupees(chargeDrafts[userId] ?? "0");
      const paymentsSnapshot = { ...participantPayments };
      const paymentUpdates: Record<string, TrainingParticipantPayment> = {};

      for (const id of targetIds) {
        const cents = parseChargeRupees(
          chargeDrafts[id] ?? String(amountCents / 100),
        );
        const saved = await ensureParticipantPayment(
          id,
          cents > 0 ? cents : amountCents,
          status,
        );
        if (!saved) continue;
        paymentsSnapshot[id] = saved;
        paymentUpdates[id] = saved;
      }
      setParticipantPayments((prev) => ({ ...prev, ...paymentUpdates }));

      let invoiceNote: string | null = null;
      if (status === "paid") {
        const totalCents = targetIds.reduce((sum, id) => {
          const pay = paymentsSnapshot[id];
          return sum + (pay?.amount_cents ?? 0);
        }, 0);
        const invoice = await ensureTrainingPaymentInvoice({
          trainingRequestId: viewingParticipants.id,
          trainingCode: viewingParticipants.training_code,
          programmeTitle: viewingParticipants.programme_title,
          orgId: person?.org_id ?? viewingParticipants.org_id,
          userId: person?.org_id ? null : userId,
          amountCents: totalCents,
        });
        if (invoice) {
          invoiceNote = ` Invoice ${invoice.invoice_number} generated.`;
        }
      }

      setMessage(
        targetIds.length > 1
          ? `Payment status updated to "${status}" for ${targetIds.length} employee(s).${invoiceNote ?? ""}`
          : `Payment status updated.${invoiceNote ?? ""}`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update payment status.",
      );
    } finally {
      setPaymentBusyId(null);
    }
  }

  async function openPaymentLinkWindow(userId: string) {
    if (!viewingParticipants) return;
    setError(null);
    setMessage(null);
    const person = participantProfiles.find((p) => p.id === userId);
    if (!person) return;

    const amountCents = parseChargeRupees(chargeDrafts[userId] ?? "0");
    if (amountCents <= 0) {
      setError("Enter training charges before sending payment link.");
      return;
    }

    // Individuals pay themselves; organization staff are billed via Org Admin
    const isIndividual =
      person.role === "individual" || !person.org_id;

    const mateIds = isIndividual
      ? [userId]
      : sameOrgParticipantIds(userId);
    if (!isIndividual) {
      applyChargesToSameOrg(userId, String(amountCents / 100));
    }

    const mates = participantProfiles.filter((p) => mateIds.includes(p.id));
    const effectiveTotal = amountCents * mates.length;

    let bank: CompanySettings | null = null;
    const { data: platformOrg } = await supabase
      .from("organizations")
      .select("id")
      .eq("type", "platform")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (platformOrg?.id) {
      const { data: settings } = await supabase
        .from("company_settings")
        .select("*")
        .eq("org_id", platformOrg.id)
        .maybeSingle();
      bank = (settings as CompanySettings | null) ?? null;
    }

    let recipients: Profile[] = [];
    let orgName = "Individual";
    if (isIndividual) {
      recipients = [person];
      orgName = person.full_name?.trim() || person.email || "Individual";
    } else {
      orgName =
        orgs.find((o) => o.id === person.org_id)?.name || "Organization";
      const { data: adminRows } = await supabase
        .from("profiles")
        .select("*")
        .eq("org_id", person.org_id!)
        .eq("role", "org_admin")
        .eq("is_active", true)
        .eq("approval_status", "approved");
      recipients = (adminRows ?? []) as Profile[];
      if (recipients.length === 0) {
        recipients = mates.filter((p) => p.role === "org_admin");
      }
      if (recipients.length === 0) {
        setError(
          "No Organization Admin found for this organization. Add an org admin first.",
        );
        return;
      }
    }

    setPaymentLinkDraft({
      sourceUserId: userId,
      orgId: isIndividual ? null : person.org_id,
      orgName,
      participantIds: mateIds,
      participantNames: mates.map(
        (p) => p.full_name?.trim() || p.email || "Participant",
      ),
      perPersonCents: amountCents,
      totalCents: effectiveTotal,
      bank,
      orgAdmins: recipients,
      isIndividual,
    });
  }

  async function confirmSendPaymentLink() {
    if (!viewingParticipants || !paymentLinkDraft) return;
    setError(null);
    setMessage(null);
    setPaymentLinkBusy(true);
    setPaymentBusyId(paymentLinkDraft.sourceUserId);
    try {
      if (paymentLinkDraft.orgAdmins.length === 0) {
        throw new Error(
          paymentLinkDraft.isIndividual
            ? "Could not find the individual recipient."
            : "No Organization Admin found for this organization. Add an org admin first.",
        );
      }

      const site =
        (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(
          /\/$/,
          "",
        ) || window.location.origin;
      const payPath = paymentLinkDraft.isIndividual
        ? "/dashboard/individual/assigned-trainings"
        : "/dashboard/organization/training-payment";
      const paymentLink = `${site}${payPath}?training=${viewingParticipants.id}&pay=1`;
      const now = new Date().toISOString();
      const amountCents = paymentLinkDraft.perPersonCents;
      const paymentsSnapshot = { ...participantPayments };
      const paymentUpdates: Record<string, TrainingParticipantPayment> = {};

      for (const id of paymentLinkDraft.participantIds) {
        const existing = paymentsSnapshot[id];
        if (existing) {
          const { data, error: updErr } = await supabase
            .from("training_participant_payments")
            .update({
              amount_cents: amountCents,
              payment_status: "link_sent",
              payment_link: paymentLink,
              payment_link_sent_at: now,
              updated_at: now,
            })
            .eq("id", existing.id)
            .select("*")
            .single();
          if (updErr) throw new Error(updErr.message);
          paymentsSnapshot[id] = data as TrainingParticipantPayment;
          paymentUpdates[id] = data as TrainingParticipantPayment;
        } else {
          const { data, error: insErr } = await supabase
            .from("training_participant_payments")
            .insert({
              training_request_id: viewingParticipants.id,
              user_id: id,
              amount_cents: amountCents,
              currency: "INR",
              payment_status: "link_sent",
              payment_link: paymentLink,
              payment_link_sent_at: now,
            })
            .select("*")
            .single();
          if (insErr) throw new Error(insErr.message);
          paymentsSnapshot[id] = data as TrainingParticipantPayment;
          paymentUpdates[id] = data as TrainingParticipantPayment;
        }
      }

      const bank = paymentLinkDraft.bank;
      const bankLines = [
        bank?.bank_name ? `Bank: ${bank.bank_name}` : null,
        bank?.bank_account_name ? `Account name: ${bank.bank_account_name}` : null,
        bank?.bank_account_number
          ? `Account no: ${bank.bank_account_number}`
          : null,
        bank?.bank_ifsc ? `IFSC: ${bank.bank_ifsc}` : null,
        bank?.bank_upi_id ? `UPI: ${bank.bank_upi_id}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const recipientLabel = paymentLinkDraft.isIndividual
        ? "learner"
        : "Admin";
      const notifyRows = paymentLinkDraft.orgAdmins.map((admin) => ({
        user_id: admin.id,
        kind: "payment_link",
        title: `Payment request: ${viewingParticipants.programme_title}`,
        body: [
          `Dear ${admin.full_name?.trim() || recipientLabel},`,
          "",
          `Please arrange payment of ${inr(paymentLinkDraft.totalCents)} for training "${viewingParticipants.programme_title}"${
            viewingParticipants.training_code
              ? ` (${viewingParticipants.training_code})`
              : ""
          }.`,
          paymentLinkDraft.isIndividual
            ? null
            : `Participants: ${paymentLinkDraft.participantIds.length}`,
          `Per person: ${inr(paymentLinkDraft.perPersonCents)}`,
          `Total amount: ${inr(paymentLinkDraft.totalCents)}`,
          bankLines ? `\nBank details:\n${bankLines}` : "",
          "",
          paymentLinkDraft.isIndividual
            ? "Open Individual portal → Assigned Trainings to confirm payment."
            : "Open Organization portal → Training Payment to confirm payment.",
        ]
          .filter(Boolean)
          .join("\n"),
        link: payPath,
        metadata: {
          training_request_id: viewingParticipants.id,
          amount_cents: paymentLinkDraft.totalCents,
          per_person_cents: paymentLinkDraft.perPersonCents,
          participant_ids: paymentLinkDraft.participantIds,
          payment_link: paymentLink,
          org_id: paymentLinkDraft.orgId,
          is_individual: paymentLinkDraft.isIndividual,
        },
      }));

      const { error: notifyErr } = await supabase
        .from("app_notifications")
        .insert(notifyRows);
      if (notifyErr) throw new Error(notifyErr.message);

      setParticipantPayments((prev) => ({ ...prev, ...paymentUpdates }));
      setChargeDrafts((prev) => {
        const next = { ...prev };
        const display = String(amountCents / 100);
        for (const id of paymentLinkDraft.participantIds) next[id] = display;
        return next;
      });
      setMessage(
        paymentLinkDraft.isIndividual
          ? `Payment link sent to individual (${paymentLinkDraft.orgAdmins
              .map((a) => a.full_name || a.email)
              .join(", ")}).`
          : `Payment link sent to Org Admin (${paymentLinkDraft.orgAdmins
              .map((a) => a.full_name || a.email)
              .join(", ")}). Status updated for ${paymentLinkDraft.participantIds.length} employee(s).`,
      );
      setPaymentLinkDraft(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not send payment link.",
      );
    } finally {
      setPaymentLinkBusy(false);
      setPaymentBusyId(null);
    }
  }

  function paymentUpiQrUrl(draft: NonNullable<typeof paymentLinkDraft>) {
    const upi = draft.bank?.bank_upi_id?.trim();
    if (!upi) return null;
    const pn = encodeURIComponent(
      draft.bank?.bank_account_name?.trim() ||
        draft.bank?.letterhead_company_name?.trim() ||
        "Quality International Compliance & Training Private Limited",
    );
    const am = (draft.totalCents / 100).toFixed(2);
    const tn = encodeURIComponent(
      viewingParticipants?.programme_title?.slice(0, 80) || "Training payment",
    );
    const data = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data)}`;
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const filtersActive =
    tableSearch.trim() !== "" ||
    statusFilter !== "all" ||
    trainerFilter !== "" ||
    orgFilter !== "";

  const filteredApprovedRequests = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return approvedRequests.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (trainerFilter && row.trainer_id !== trainerFilter) return false;
      if (orgFilter) {
        if (orgFilter === "__individual__") {
          if (row.org_id) return false;
        } else if (row.org_id !== orgFilter) {
          return false;
        }
      }
      if (!q) return true;
      const trainingCode =
        row.training_code ||
        `TRN-${row.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      const dateLabel = row.training_date
        ? new Date(row.training_date).toLocaleString("en-IN")
        : "";
      const hay = [
        trainingCode,
        row.programme_title,
        row.org_name,
        row.trainer_name,
        row.requester_name,
        dateLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [approvedRequests, tableSearch, statusFilter, trainerFilter, orgFilter]);

  function clearFilters() {
    setTableSearch("");
    setStatusFilter("all");
    setTrainerFilter("");
    setOrgFilter("");
  }

  useEffect(() => {
    if (!filterOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!filterMenuRef.current?.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFilterOpen(false);
    }
    // Attach on the next tick so the opening click doesn't immediately close it.
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filterOpen]);

  async function deleteAssignedTraining(row: ApprovedRequestRow) {
    const ok = window.confirm(
      `Delete assigned training "${row.programme_title}"? This cannot be undone.`,
    );
    if (!ok) return;
    setError(null);
    setMessage(null);
    setRowBusyId(row.id);
    try {
      const { error: delError } = await supabase
        .from("training_requests")
        .delete()
        .eq("id", row.id);
      if (delError) {
        setError(delError.message);
        return;
      }
      setMessage("Assigned training deleted.");
      await load();
    } finally {
      setRowBusyId(null);
    }
  }

  function toggleSelectAll() {
    if (
      filteredApprovedRequests.length > 0 &&
      filteredApprovedRequests.every((r) => selectedIds.includes(r.id))
    ) {
      setSelectedIds((prev) =>
        prev.filter(
          (id) => !filteredApprovedRequests.some((r) => r.id === id),
        ),
      );
    } else {
      setSelectedIds((prev) => [
        ...new Set([...prev, ...filteredApprovedRequests.map((r) => r.id)]),
      ]);
    }
  }

  const selectedProgramme = programmes.find((p) => p.id === assign.programmeId);
  const selectedAssignParticipants = assignCandidates.filter((p) =>
    assign.participantIds.includes(p.id),
  );

  const filteredProgrammes = programmes.filter((p) =>
    p.title.toLowerCase().includes(programmeSearch.trim().toLowerCase()),
  );

  const filteredAssignCandidates = useMemo(() => {
    const q = participantSearch.trim().toLowerCase();
    if (!q) return assignCandidates;
    return assignCandidates.filter((p) => {
      const hay = [
        p.full_name,
        p.email,
        p.mobile,
        p.org_name,
        p.source_label,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [assignCandidates, participantSearch]);

  return (
    <div>
      <PageHeader
        title="Assign Programmes"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search training ID, programme, org, trainer…"
              aria-label="Search assigned trainings"
              className="w-full min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:w-72"
            />
            <div className="relative" ref={filterMenuRef}>
              <button
                type="button"
                onClick={() => setFilterOpen((open) => !open)}
                aria-expanded={filterOpen}
                aria-haspopup="menu"
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  filterOpen ||
                  statusFilter !== "all" ||
                  trainerFilter ||
                  orgFilter
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Filter
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-4 w-4 transition-transform ${
                    filterOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {filterOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-2 w-72 space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl"
                >
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: "all", label: "All" },
                          { id: "hold", label: "Hold" },
                          { id: "scheduled", label: "Scheduled" },
                          { id: "completed", label: "Completed" },
                          { id: "approved", label: "Approved" },
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
                  </div>

                  {isTrainerView ? null : (
                    <>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Trainer
                        <select
                          value={trainerFilter}
                          onChange={(e) => setTrainerFilter(e.target.value)}
                          aria-label="Filter by trainer"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium normal-case text-slate-700"
                        >
                          <option value="">All</option>
                          {trainers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.full_name?.trim() || t.email || "Trainer"}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Organization
                        <select
                          value={orgFilter}
                          onChange={(e) => setOrgFilter(e.target.value)}
                          aria-label="Filter by organization"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium normal-case text-slate-700"
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
                    </>
                  )}

                  {filtersActive ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      Clear filters
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {isTrainerView ? null : (
              <button
                type="button"
                onClick={() => openAssignModal()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Assign Programme
              </button>
            )}
          </div>
        }
      />
      {error && !showAssignModal ? (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      ) : null}
      {message ? <p className="mb-3 text-sm text-emerald-700">{message}</p> : null}

      {approvedRequests.length === 0 ? (
        <EmptyState
          message={
            isTrainerView
              ? "No trainings assigned to you yet."
              : "No assigned or completed trainings yet."
          }
        />
      ) : filteredApprovedRequests.length === 0 ? (
        <EmptyState message="No trainings match your search or filters." />
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
                        filteredApprovedRequests.length > 0 &&
                        filteredApprovedRequests.every((r) =>
                          selectedIds.includes(r.id),
                        )
                      }
                      onChange={toggleSelectAll}
                      aria-label="Select all approved requests"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Training ID
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Programme Name
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Participants
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Trainer
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Date of Training
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
                {filteredApprovedRequests.map((row) => {
                  const participantCount = row.employee_ids?.length ?? 0;
                  const scheduleStatus =
                    row.status === "scheduled"
                      ? "scheduled"
                      : row.status === "completed"
                        ? "completed"
                        : "hold";
                  const busy = rowBusyId === row.id;
                  return (
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
                      <td className="border border-slate-200 px-3 py-2.5 text-left">
                        <span className="font-mono text-xs font-semibold tracking-wide text-indigo-700">
                          {row.training_code ||
                            `TRN-${row.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`}
                        </span>
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-left font-medium text-slate-900">
                        {row.programme_title}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <div className="inline-flex items-center justify-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {participantCount}
                          </span>
                          <button
                            type="button"
                            disabled={participantCount === 0}
                            onClick={() => void openParticipants(row)}
                            className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            View
                          </button>
                        </div>
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        {isTrainerView ? (
                          <span className="text-xs font-semibold text-slate-700">
                            {row.trainer_name ||
                              qiProfile?.full_name?.trim() ||
                              qiProfile?.email ||
                              "You"}
                          </span>
                        ) : (
                          <select
                            disabled={busy}
                            value={row.trainer_id ?? ""}
                            onChange={(e) =>
                              void updateRequestSchedule(row, {
                                trainer_id: e.target.value || null,
                              })
                            }
                            aria-label={`Trainer for ${row.programme_title}`}
                            className="max-w-[160px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
                          >
                            <option value="">Select Trainer</option>
                            {trainers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.full_name?.trim() || t.email || "Trainer"}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <ScheduleDateInput
                          value={row.training_date}
                          ariaLabel={`Training date for ${row.programme_title}`}
                          onCommit={(next) =>
                            void updateRequestSchedule(row, {
                              training_date: next,
                            })
                          }
                        />
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <select
                          disabled={busy}
                          value={scheduleStatus}
                          onChange={(e) =>
                            void updateRequestSchedule(row, {
                              status: e.target.value as
                                | "hold"
                                | "scheduled"
                                | "completed",
                            })
                          }
                          aria-label={`Status for ${row.programme_title}`}
                          className={`rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize ${
                            scheduleStatus === "completed"
                              ? "border-sky-300 bg-sky-50 text-sky-800"
                              : scheduleStatus === "scheduled"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "border-amber-300 bg-amber-50 text-amber-800"
                          }`}
                        >
                          <option value="hold">Hold</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="completed">Completed</option>
                        </select>
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {isTrainerView ? (
                            (() => {
                              const href = externalMeetingHref(
                                row.meeting_link,
                              );
                              if (!href) {
                                return (
                                  <span className="text-xs text-slate-400">
                                    {row.session_id
                                      ? "No link"
                                      : "Not scheduled"}
                                  </span>
                                );
                              }
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                >
                                  Join Meeting
                                </a>
                              );
                            })()
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void openInviteModal(row)}
                              className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {row.invitation_sent_at
                                ? "Resend Invitation"
                                : "Send Invitation"}
                            </button>
                          )}
                          {isSuperAdmin ? (
                            <button
                              type="button"
                              disabled={busy}
                              title="Delete assigned training"
                              aria-label={`Delete ${row.programme_title}`}
                              onClick={() => void deleteAssignedTraining(row)}
                              className="rounded-md px-1.5 py-0.5 text-base leading-none hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              🗑️
                            </button>
                          ) : null}
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

      {viewingParticipants ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-white"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assign-participants-title"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <h2
                id="assign-participants-title"
                className="text-lg font-semibold text-slate-900"
              >
                Participants
              </h2>
              <p className="mt-1 truncate text-sm text-slate-500">
                {viewingParticipants.training_code ? (
                  <>
                    <span className="font-mono text-xs font-semibold text-indigo-700">
                      {viewingParticipants.training_code}
                    </span>
                    <span className="mx-1.5 text-slate-300">·</span>
                  </>
                ) : null}
                {viewingParticipants.programme_title} ·{" "}
                {viewingParticipants.employee_ids?.length ?? 0} participant
                {(viewingParticipants.employee_ids?.length ?? 0) === 1
                  ? ""
                  : "s"}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
              onClick={() => {
                setViewingParticipants(null);
                setParticipantProfiles([]);
                setParticipantPayments({});
                setChargeDrafts({});
                setSelectedParticipantIds([]);
              }}
             title="Close" aria-label="Close">
                  ×
                </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
            {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
            {message ? (
              <p className="mb-3 text-sm text-emerald-700">{message}</p>
            ) : null}

            {loadingParticipants ? (
              <p className="text-sm text-slate-500">Loading participants…</p>
            ) : participantProfiles.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No participants linked to this request.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[960px] border-collapse text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-12 border border-slate-200 px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={
                            participantProfiles.length > 0 &&
                            selectedParticipantIds.length ===
                              participantProfiles.length
                          }
                          onChange={() => {
                            if (
                              selectedParticipantIds.length ===
                              participantProfiles.length
                            ) {
                              setSelectedParticipantIds([]);
                            } else {
                              setSelectedParticipantIds(
                                participantProfiles.map((p) => p.id),
                              );
                            }
                          }}
                          aria-label="Select all participants"
                          className="h-4 w-4"
                        />
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-left">
                        Name
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Email
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Mobile
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Training Charges (₹)
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Send Payment Link
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Payment Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...participantProfiles]
                      .sort((a, b) => {
                        const aSent = Boolean(
                          participantPayments[a.id]?.payment_link_sent_at,
                        );
                        const bSent = Boolean(
                          participantPayments[b.id]?.payment_link_sent_at,
                        );
                        // Not sent → top; already sent → below
                        if (aSent === bSent) {
                          return (a.full_name || a.email || "").localeCompare(
                            b.full_name || b.email || "",
                          );
                        }
                        return aSent ? 1 : -1;
                      })
                      .map((p) => {
                      const pay = participantPayments[p.id];
                      const busy = paymentBusyId === p.id;
                      const status = pay?.payment_status ?? "pending";
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80">
                          <td className="border border-slate-200 px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={selectedParticipantIds.includes(p.id)}
                              onChange={() =>
                                setSelectedParticipantIds((prev) =>
                                  prev.includes(p.id)
                                    ? prev.filter((id) => id !== p.id)
                                    : [...prev, p.id],
                                )
                              }
                              aria-label={`Select ${p.full_name || p.email}`}
                              className="h-4 w-4"
                            />
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-left font-medium text-slate-900">
                            {p.full_name || "—"}
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                            {p.email || "—"}
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                            {p.mobile || "—"}
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                disabled={busy}
                                value={chargeDrafts[p.id] ?? "0"}
                                onChange={(e) =>
                                  applyChargesToSameOrg(p.id, e.target.value)
                                }
                                onBlur={() => void saveTrainingCharges(p.id)}
                                className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-center text-sm"
                                aria-label={`Training charges for ${p.full_name || p.email}`}
                              />
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void saveTrainingCharges(p.id)}
                                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Save
                              </button>
                            </div>
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center">
                            <button
                              type="button"
                              disabled={busy || paymentLinkBusy}
                              onClick={() => void openPaymentLinkWindow(p.id)}
                              className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                            >
                              {busy
                                ? "…"
                                : pay?.payment_link_sent_at
                                  ? "Resend Link"
                                  : "Send Link"}
                            </button>
                            {pay?.payment_link_sent_at ? (
                              <div className="mt-1 text-[10px] text-slate-500">
                                Sent{" "}
                                {new Date(
                                  pay.payment_link_sent_at,
                                ).toLocaleString("en-IN")}
                              </div>
                            ) : null}
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center">
                            <select
                              disabled={busy}
                              value={status}
                              onChange={(e) =>
                                void updatePaymentStatus(
                                  p.id,
                                  e.target.value as TrainingParticipantPaymentStatus,
                                )
                              }
                              aria-label={`Payment status for ${p.full_name || p.email}`}
                              className={`rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize ${
                                status === "paid"
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                  : status === "link_sent"
                                    ? "border-sky-300 bg-sky-50 text-sky-800"
                                    : status === "waived"
                                      ? "border-slate-300 bg-slate-50 text-slate-700"
                                      : "border-amber-300 bg-amber-50 text-amber-800"
                              }`}
                            >
                              <option value="pending">Pending</option>
                              <option value="link_sent">Link Sent</option>
                              <option value="paid">Paid</option>
                              <option value="waived">Waived</option>
                            </select>
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
      ) : null}

      {paymentLinkDraft ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-link-title"
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="payment-link-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Send Payment Link
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {viewingParticipants?.programme_title}
                  {viewingParticipants?.training_code
                    ? ` · ${viewingParticipants.training_code}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={paymentLinkBusy}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => setPaymentLinkDraft(null)}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Summary
                </p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">
                      {paymentLinkDraft.isIndividual
                        ? "Learner"
                        : "Organization"}
                    </dt>
                    <dd className="font-medium text-slate-900">
                      {paymentLinkDraft.orgName}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Total persons</dt>
                    <dd className="font-semibold text-slate-900">
                      {paymentLinkDraft.participantIds.length}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Per person</dt>
                    <dd className="font-medium text-slate-900">
                      {inr(paymentLinkDraft.perPersonCents)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-slate-200 pt-2">
                    <dt className="font-semibold text-slate-700">Total amount</dt>
                    <dd className="text-base font-bold text-indigo-700">
                      {inr(paymentLinkDraft.totalCents)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-slate-500">
                  {paymentLinkDraft.isIndividual
                    ? "Link will be sent to Individual:"
                    : `Link will be sent to Org Admin${
                        paymentLinkDraft.orgAdmins.length > 1 ? "s" : ""
                      }:`}{" "}
                  <span className="font-medium text-slate-700">
                    {paymentLinkDraft.orgAdmins
                      .map((a) => a.full_name || a.email)
                      .join(", ") || "—"}
                  </span>
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Payment QR
                </p>
                {paymentUpiQrUrl(paymentLinkDraft) ? (
                  <img
                    src={paymentUpiQrUrl(paymentLinkDraft) ?? undefined}
                    alt="UPI payment QR code"
                    className="mx-auto mt-3 h-44 w-44 rounded-lg border border-slate-200 bg-white p-2"
                  />
                ) : (
                  <p className="mt-6 text-sm text-slate-500">
                    Add UPI ID in Company Setting → Bank to show QR code.
                  </p>
                )}
                {paymentLinkDraft.bank?.bank_upi_id ? (
                  <p className="mt-2 text-xs font-medium text-slate-600">
                    UPI: {paymentLinkDraft.bank.bank_upi_id}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bank details
              </p>
              {paymentLinkDraft.bank &&
              (paymentLinkDraft.bank.bank_name ||
                paymentLinkDraft.bank.bank_account_number ||
                paymentLinkDraft.bank.bank_upi_id) ? (
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-slate-500">Bank</dt>
                    <dd className="font-medium text-slate-900">
                      {paymentLinkDraft.bank.bank_name || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Account name</dt>
                    <dd className="font-medium text-slate-900">
                      {paymentLinkDraft.bank.bank_account_name || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Account number</dt>
                    <dd className="font-medium text-slate-900">
                      {paymentLinkDraft.bank.bank_account_number || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">IFSC</dt>
                    <dd className="font-medium text-slate-900">
                      {paymentLinkDraft.bank.bank_ifsc || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Branch</dt>
                    <dd className="font-medium text-slate-900">
                      {paymentLinkDraft.bank.bank_branch || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">UPI ID</dt>
                    <dd className="font-medium text-slate-900">
                      {paymentLinkDraft.bank.bank_upi_id || "—"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-amber-700">
                  Bank details not configured. Set them in Company Setting →
                  Bank.
                </p>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Participants ({paymentLinkDraft.participantIds.length})
              </p>
              <ul className="mt-2 max-h-28 list-inside list-disc overflow-y-auto text-sm text-slate-700">
                {paymentLinkDraft.participantIds.map((id, index) => (
                  <li key={id}>
                    {paymentLinkDraft.participantNames[index] || id}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={paymentLinkBusy}
                onClick={() => setPaymentLinkDraft(null)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-2xl leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={paymentLinkBusy}
                onClick={() => void confirmSendPaymentLink()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {paymentLinkBusy
                  ? "Sending…"
                  : paymentLinkDraft.isIndividual
                    ? "Send to Individual"
                    : "Send to Org Admin"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {inviteRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-invitation-title"
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="send-invitation-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Send Invitation
                </h2>
              </div>
              <button title="Close" aria-label="Close"
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                disabled={Boolean(rowBusyId)}
                onClick={closeInviteModal}
              >
                  ×
                </button>
            </div>

            {error ? (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">
                Meeting platform *
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={inviteForm.platform}
                  onChange={(e) =>
                    setInviteForm((f) => ({
                      ...f,
                      platform: e.target.value,
                    }))
                  }
                >
                  {meetingPlatforms.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Meeting link *
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="https://..."
                  value={inviteForm.meetingLink}
                  onChange={(e) =>
                    setInviteForm((f) => ({
                      ...f,
                      meetingLink: e.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold text-slate-600">
                Meeting password
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="Optional — Zoom / Teams passcode"
                  value={inviteForm.meetingPassword}
                  onChange={(e) =>
                    setInviteForm((f) => ({
                      ...f,
                      meetingPassword: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Training date *
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={inviteForm.trainingDate}
                  onChange={(e) =>
                    setInviteForm((f) => ({
                      ...f,
                      trainingDate: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Training time *
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={inviteForm.trainingTime}
                  onChange={(e) =>
                    setInviteForm((f) => ({
                      ...f,
                      trainingTime: e.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Participants ({inviteSelectedIds.length}/
                  {inviteParticipants.length})
                </p>
                <button
                  type="button"
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                  onClick={toggleInviteSelectAll}
                >
                  {inviteParticipants.length > 0 &&
                  inviteSelectedIds.length === inviteParticipants.length
                    ? "Clear all"
                    : "Select all"}
                </button>
              </div>
              {inviteLoadingPeople ? (
                <p className="text-sm text-slate-500">Loading participants…</p>
              ) : (
                <div className="max-h-56 overflow-auto rounded-xl border border-slate-200">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="w-10 border border-slate-200 px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={
                              inviteParticipants.length > 0 &&
                              inviteSelectedIds.length ===
                                inviteParticipants.length
                            }
                            onChange={toggleInviteSelectAll}
                            aria-label="Select all participants"
                          />
                        </th>
                        <th className="border border-slate-200 px-2 py-2 text-left">
                          Name
                        </th>
                        <th className="border border-slate-200 px-2 py-2 text-center">
                          Email ID
                        </th>
                        <th className="border border-slate-200 px-2 py-2 text-center">
                          Mobile Number
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {inviteParticipants.map((p) => (
                        <tr key={p.id}>
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={inviteSelectedIds.includes(p.id)}
                              onChange={() => toggleInviteParticipant(p.id)}
                              aria-label={`Select ${p.full_name || p.email}`}
                            />
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-left font-medium text-slate-900">
                            {p.full_name || "—"}
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center text-slate-700">
                            {p.email || "—"}
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center text-slate-700">
                            {p.mobile || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={Boolean(rowBusyId)}
                onClick={closeInviteModal}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(rowBusyId)}
                onClick={() => {
                  setInviteDraftAiError(null);
                  setShowInviteDraft(true);
                }}
                className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
              >
                Draft Email
              </button>
              <button
                type="button"
                disabled={Boolean(rowBusyId)}
                onClick={() => void sendInvitation()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {rowBusyId ? "Sending…" : "Send Invitation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {inviteRow && showInviteDraft
        ? (() => {
            const draft = inviteDraftPreview();
            if (!draft) return null;
            return (
              <div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="invite-draft-title"
              >
                <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2
                        id="invite-draft-title"
                        className="text-lg font-semibold text-slate-900"
                      >
                        Draft Email
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Subject: {draft.subject}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                      onClick={() => setShowInviteDraft(false)}
                     title="Close" aria-label="Close">
                  ×
                </button>
                  </div>

                  <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                        AI Email Draft
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {inviteDraftCustom ? (
                          <button
                            type="button"
                            disabled={inviteDraftAiBusy}
                            onClick={() => {
                              setInviteDraftCustom(null);
                              setInviteDraftAiError(null);
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Use default template
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={inviteDraftAiBusy}
                          onClick={() => void generateInviteDraftWithAi()}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                          {inviteDraftAiBusy
                            ? "Generating…"
                            : inviteDraftCustom
                              ? "Regenerate with AI"
                              : "Generate with AI"}
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold text-slate-600">
                        Tone
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                          value={inviteDraftAi.tone}
                          onChange={(e) =>
                            setInviteDraftAi((f) => ({
                              ...f,
                              tone: e.target.value,
                            }))
                          }
                        >
                          <option value="professional">Professional</option>
                          <option value="friendly">Friendly</option>
                          <option value="formal">Formal</option>
                          <option value="warm">Warm &amp; encouraging</option>
                          <option value="concise">Concise</option>
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-slate-600">
                        Message type
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                          value={inviteDraftAi.messageType}
                          onChange={(e) =>
                            setInviteDraftAi((f) => ({
                              ...f,
                              messageType: e.target.value,
                            }))
                          }
                        >
                          <option value="invitation">Invitation</option>
                          <option value="reminder">Reminder</option>
                          <option value="reschedule">Reschedule notice</option>
                          <option value="confirmation">Confirmation</option>
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-slate-600">
                        Language
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                          value={inviteDraftAi.language}
                          onChange={(e) =>
                            setInviteDraftAi((f) => ({
                              ...f,
                              language: e.target.value,
                            }))
                          }
                        >
                          <option value="english">English</option>
                          <option value="hindi">Hindi</option>
                          <option value="hinglish">Hinglish</option>
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-slate-600">
                        Length
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                          value={inviteDraftAi.length}
                          onChange={(e) =>
                            setInviteDraftAi((f) => ({
                              ...f,
                              length: e.target.value,
                            }))
                          }
                        >
                          <option value="short">Short</option>
                          <option value="medium">Medium</option>
                          <option value="detailed">Detailed</option>
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                        Extra instructions
                        <textarea
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                          rows={2}
                          placeholder="e.g. Mention bring IS 1608 reference, arrive 10 min early…"
                          value={inviteDraftAi.extraInstructions}
                          onChange={(e) =>
                            setInviteDraftAi((f) => ({
                              ...f,
                              extraInstructions: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    {inviteDraftAiError ? (
                      <p className="mt-2 text-sm text-red-600">
                        {inviteDraftAiError}
                      </p>
                    ) : null}
                  </div>

                  <div
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800"
                    dangerouslySetInnerHTML={{ __html: draft.html }}
                  />
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowInviteDraft(false)}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-2xl leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                     title="Close" aria-label="Close">
                  ×
                </button>
                  </div>
                </div>
              </div>
            );
          })()
        : null}

      {showAssignModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assign-programme-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="assign-programme-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Assign Programme
                </h2>
              </div>
              <button title="Close" aria-label="Close"
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                disabled={saving}
                onClick={closeAssignModal}
              >
                  ×
                </button>
            </div>

            {error ? (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="relative sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Programme Name *
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Search programme…"
                  value={
                    programmePickerOpen
                      ? programmeSearch
                      : (selectedProgramme?.title ?? programmeSearch)
                  }
                  onFocus={() => {
                    setProgrammePickerOpen(true);
                    setProgrammeSearch(selectedProgramme?.title ?? "");
                  }}
                  onChange={(e) => {
                    setProgrammeSearch(e.target.value);
                    setProgrammePickerOpen(true);
                    if (assign.programmeId) {
                      setAssign((a) => ({ ...a, programmeId: "" }));
                    }
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setProgrammePickerOpen(false), 150);
                  }}
                />
                {programmePickerOpen ? (
                  <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {filteredProgrammes.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-500">
                        No programme found
                      </p>
                    ) : (
                      filteredProgrammes.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-indigo-50"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setAssign((a) => ({ ...a, programmeId: p.id }));
                            setProgrammeSearch(p.title);
                            setProgrammePickerOpen(false);
                          }}
                        >
                          {p.title}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Participants *
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openParticipantPicker}
                    className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    Select Participants
                  </button>
                  <span className="text-sm text-slate-600">
                    {assign.participantIds.length} selected
                  </span>
                </div>
                {selectedAssignParticipants.length > 0 ? (
                  <div className="mt-2 max-h-28 overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="border border-slate-200 px-2 py-1.5 text-left">
                            Name
                          </th>
                          <th className="border border-slate-200 px-2 py-1.5 text-center">
                            Email ID
                          </th>
                          <th className="border border-slate-200 px-2 py-1.5 text-center">
                            Mobile Number
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAssignParticipants.map((p) => (
                          <tr key={p.id}>
                            <td className="border border-slate-200 px-2 py-1.5 text-left font-medium text-slate-900">
                              {p.full_name || "—"}
                            </td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-700">
                              {p.email || "—"}
                            </td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-700">
                              {p.mobile || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>

              <label className="text-xs font-semibold text-slate-600">
                Trainer
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={assign.trainerId}
                  onChange={(e) =>
                    setAssign((a) => ({ ...a, trainerId: e.target.value }))
                  }
                >
                  <option value="">Select Trainer</option>
                  {trainers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name?.trim() || t.email || "Trainer"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold text-slate-600">
                Date of Training
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={assign.trainingDate}
                  onChange={(e) =>
                    setAssign((a) => ({
                      ...a,
                      trainingDate: e.target.value,
                    }))
                  }
                />
              </label>

              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Status
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal capitalize"
                  value={assign.status}
                  onChange={(e) =>
                    setAssign((a) => ({
                      ...a,
                      status: e.target.value as "hold" | "scheduled",
                    }))
                  }
                >
                  <option value="hold">Hold</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={closeAssignModal}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void assignProgramme()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAssignModal && showParticipantPicker ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="select-participants-title"
        >
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="select-participants-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Select Participants
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Organizations &amp; Individuals · {pickerDraftIds.length}{" "}
                  selected
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => setShowParticipantPicker(false)}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Search name, email, mobile…"
                value={participantSearch}
                onChange={(e) => setParticipantSearch(e.target.value)}
              />
              <button
                type="button"
                className="text-xs font-semibold text-indigo-600 hover:underline"
                onClick={() =>
                  togglePickerSelectAll(
                    filteredAssignCandidates.map((p) => p.id),
                  )
                }
              >
                {filteredAssignCandidates.length > 0 &&
                filteredAssignCandidates.every((p) =>
                  pickerDraftIds.includes(p.id),
                )
                  ? "Clear visible"
                  : "Select visible"}
              </button>
            </div>

            {filteredAssignCandidates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No organizations or individuals found.
              </p>
            ) : (
              <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-10 border border-slate-200 px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={
                            filteredAssignCandidates.length > 0 &&
                            filteredAssignCandidates.every((p) =>
                              pickerDraftIds.includes(p.id),
                            )
                          }
                          onChange={() =>
                            togglePickerSelectAll(
                              filteredAssignCandidates.map((p) => p.id),
                            )
                          }
                          aria-label="Select all visible participants"
                        />
                      </th>
                      <th className="border border-slate-200 px-2 py-2 text-left">
                        Name
                      </th>
                      <th className="border border-slate-200 px-2 py-2 text-center">
                        Email ID
                      </th>
                      <th className="border border-slate-200 px-2 py-2 text-center">
                        Mobile Number
                      </th>
                      <th className="border border-slate-200 px-2 py-2 text-center">
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssignCandidates.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="border border-slate-200 px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={pickerDraftIds.includes(p.id)}
                            onChange={() => togglePickerParticipant(p.id)}
                            aria-label={`Select ${p.full_name || p.email}`}
                          />
                        </td>
                        <td className="border border-slate-200 px-2 py-2 text-left font-medium text-slate-900">
                          {p.full_name || "—"}
                        </td>
                        <td className="border border-slate-200 px-2 py-2 text-center text-slate-700">
                          {p.email || "—"}
                        </td>
                        <td className="border border-slate-200 px-2 py-2 text-center text-slate-700">
                          {p.mobile || "—"}
                        </td>
                        <td className="border border-slate-200 px-2 py-2 text-center text-slate-600">
                          {p.source_label}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowParticipantPicker(false)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-2xl leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmParticipantPicker}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Confirm ({pickerDraftIds.length})
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function QiIndividualsPage() {
  const navigate = useNavigate();
  const emptyForm = {
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    mobile: "",
    occupation: "",
    qualification: "",
    education: "",
    experience: "",
    skills: "",
    photoUrl: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    pinCode: "",
    country: "",
  };

  const [rows, setRows] = useState<
    Array<Profile & { pending_request_count?: number }>
  >([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [viewLearner, setViewLearner] = useState<Profile | null>(null);
  const [learnerRequests, setLearnerRequests] = useState<
    Array<TrainingRequest & { programme_title?: string }>
  >([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  async function load() {
    const [{ data: people }, { data: pendingReqs }] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "individual")
        .order("created_at", { ascending: false }),
      supabase
        .from("training_requests")
        .select("requested_by")
        .eq("status", "pending")
        .not("requested_by", "is", null),
    ]);

    const pendingByUser = new Map<string, number>();
    for (const r of pendingReqs ?? []) {
      if (!r.requested_by) continue;
      pendingByUser.set(
        r.requested_by,
        (pendingByUser.get(r.requested_by) ?? 0) + 1,
      );
    }

    const list = ((people ?? []) as Profile[]).map((p) => ({
      ...p,
      pending_request_count: pendingByUser.get(p.id) ?? 0,
    }));
    setRows(list);
    setSelectedIds((prev) =>
      prev.filter((id) => list.some((p) => p.id === id)),
    );
  }

  useEffect(() => {
    void load();

    const channel = supabase
      .channel("qi-individual-request-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "training_requests" },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

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

  function resetPhotoState() {
    setPhotoFile(null);
    setPhotoPreview(null);
  }

  function onPhotoSelected(file: File | null) {
    if (!file) {
      resetPhotoState();
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

  async function uploadIndividualPhoto(userId: string, file: File) {
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

  async function setActiveStatus(id: string, isActive: boolean) {
    setError(null);
    setMessage(null);
    const { error: err } = await supabase
      .from("profiles")
      .update({ is_active: isActive })
      .eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    await load();
  }

  async function openLearnerRequests(learner: Profile) {
    navigate(
      `/dashboard/quality-international/individual-workspace/${learner.id}/programme-request`,
    );
  }

  async function updateRequestStatus(id: string, status: string) {
    const { error: err } = await supabase
      .from("training_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    await load();
  }

  async function createIndividual() {
    setError(null);
    setMessage(null);
    if (!form.fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!form.email.trim() || !form.password) {
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
    }>("create-individual", {
      body: {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        mobile: form.mobile,
        occupation: form.occupation,
        qualification: form.qualification,
        education: form.education,
        experience: form.experience,
        skills: form.skills,
        photoUrl: form.photoUrl,
        dateOfBirth: form.dateOfBirth,
        address: form.address,
        city: form.city,
        state: form.state,
        pinCode: form.pinCode,
        country: form.country,
      },
    });

    if (data?.error || !data?.ok || !data.userId) {
      setSaving(false);
      setError(data?.error ?? fnError?.message ?? "Failed to create individual.");
      return;
    }
    if (fnError) {
      setSaving(false);
      setError(fnError.message);
      return;
    }

    if (photoFile) {
      try {
        const photoUrl = await uploadIndividualPhoto(data.userId, photoFile);
        const { error: photoErr } = await supabase
          .from("profiles")
          .update({ photo_url: photoUrl })
          .eq("id", data.userId);
        if (photoErr) {
          setSaving(false);
          setError(
            `Individual created, but photo upload failed: ${photoErr.message}`,
          );
          await load();
          return;
        }
      } catch (err) {
        setSaving(false);
        setError(
          `Individual created, but photo upload failed: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
        );
        await load();
        return;
      }
    }

    setSaving(false);
    setMessage(
      `Individual created. Learner can sign in to Individual portal with ${form.email.trim()}.`,
    );
    setForm(emptyForm);
    resetPhotoState();
    setShowAddModal(false);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Individuals"
        actions={
          <button
            type="button"
            onClick={() => {
              setError(null);
              setForm(emptyForm);
              resetPhotoState();
              setShowAddModal(true);
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Add Individual
          </button>
        }
      />
      {error && !showAddModal && !viewLearner ? (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      ) : null}
      {message ? <p className="mb-3 text-sm text-emerald-700">{message}</p> : null}

      {showAddModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-individual-title"
        >
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="add-individual-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Add Individual
                </h2>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  if (!saving) {
                    setShowAddModal(false);
                    resetPhotoState();
                  }
                }}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            {error ? (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-slate-600">
                  Individual Photo
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt="Individual preview"
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
                      JPG/PNG up to 5 MB. Shown on the individuals table.
                    </p>
                    {photoPreview ? (
                      <button
                        type="button"
                        className="mt-1 text-xs font-semibold text-rose-600 hover:underline"
                        onClick={() => {
                          resetPhotoState();
                          updateForm("photoUrl", "");
                        }}
                      >
                        Remove photo
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                Full Name *
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.fullName}
                  onChange={(e) => updateForm("fullName", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Occupation
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.occupation}
                  onChange={(e) => updateForm("occupation", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Qualification
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.qualification}
                  onChange={(e) => updateForm("qualification", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Education
                <textarea
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="e.g. B.Com, Delhi University"
                  value={form.education}
                  onChange={(e) => updateForm("education", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Experience
                <textarea
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="e.g. 3 years in quality assurance"
                  value={form.experience}
                  onChange={(e) => updateForm("experience", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                Skills
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="Comma-separated, e.g. MS Excel, Communication, Safety"
                  value={form.skills}
                  onChange={(e) => updateForm("skills", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Mobile Number
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.mobile}
                  onChange={(e) => updateForm("mobile", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Date of Birth
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.dateOfBirth}
                  onChange={(e) => updateForm("dateOfBirth", e.target.value)}
                  placeholder="DD-MM-YYYY"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                Address
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.address}
                  onChange={(e) => updateForm("address", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                City
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.city}
                  onChange={(e) => updateForm("city", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                State
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.state}
                  onChange={(e) => updateForm("state", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                PIN Code
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.pinCode}
                  onChange={(e) => updateForm("pinCode", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Country
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.country}
                  onChange={(e) => updateForm("country", e.target.value)}
                />
              </label>

              <div className="sm:col-span-2 mt-2 border-t border-slate-200 pt-3">
                <h3 className="text-sm font-semibold text-slate-800">
                  Individual Portal Login
                </h3>
              </div>
              <label className="block text-xs font-semibold text-slate-600">
                User ID (Email) *
                <input
                  type="email"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.email}
                  onChange={(e) => updateForm("email", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Password *
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.password}
                  onChange={(e) => updateForm("password", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                Confirm Password *
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={form.confirmPassword}
                  onChange={(e) =>
                    updateForm("confirmPassword", e.target.value)
                  }
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                onClick={() => {
                  if (saving) return;
                  setShowAddModal(false);
                  resetPhotoState();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                onClick={() => void createIndividual()}
              >
                {saving ? "Creating…" : "Create Individual"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {viewLearner ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-learner-requests-title"
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2
                  id="view-learner-requests-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Training Requests
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {viewLearner.full_name || viewLearner.email}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  setViewLearner(null);
                  setLearnerRequests([]);
                }}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            {loadingRequests ? (
              <p className="text-sm text-slate-500">Loading requests…</p>
            ) : learnerRequests.length === 0 ? (
              <EmptyState message="No training requests from this learner." />
            ) : (
              <div className="grid gap-3">
                {learnerRequests.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">
                            {r.title}
                          </p>
                          {r.status === "pending" ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                              New
                            </span>
                          ) : null}
                        </div>
                        {r.message ? (
                          <p className="mt-1 text-sm text-slate-600">
                            {r.message}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-500">
                          {r.programme_title ?? "Custom"} · {r.status}
                          {r.preferred_date
                            ? ` · preferred ${r.preferred_date}`
                            : ""}{" "}
                          · {new Date(r.created_at).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {["pending", "approved", "scheduled", "rejected"].map(
                          (st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => void updateRequestStatus(r.id, st)}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${
                                r.status === st
                                  ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {st}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState message="No individual learners yet." />
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
                      aria-label="Select all learners"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="w-16 border border-slate-200 px-3 py-2.5 text-center">
                    Photo
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Name
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
                    Contact
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
                {rows.map((p) => {
                  const skillList = formatSkills(p.skills);
                  return (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        aria-label={`Select ${p.full_name || p.email || "learner"}`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      {p.photo_url ? (
                        <img
                          src={p.photo_url}
                          alt={p.full_name || "Individual"}
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
                    <td className="border border-slate-200 px-3 py-2.5 !text-left font-medium text-slate-900">
                      {p.full_name || "—"}
                      <div className="mt-0.5 text-xs font-normal text-slate-500">
                        {p.occupation || "—"}
                        {p.qualification ? ` · ${p.qualification}` : ""}
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
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-xs text-slate-700">
                      <div>{p.email ?? "—"}</div>
                      <div>{p.mobile || "—"}</div>
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <select
                        className={`rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize ${
                          p.is_active
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-slate-300 bg-slate-50 text-slate-700"
                        }`}
                        value={p.is_active ? "active" : "inactive"}
                        aria-label={`Status for ${p.full_name || p.email}`}
                        onChange={(e) =>
                          void setActiveStatus(
                            p.id,
                            e.target.value === "active",
                          )
                        }
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <button
                        type="button"
                        className="relative inline-flex items-center rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => void openLearnerRequests(p)}
                      >
                        View Request
                        {(p.pending_request_count ?? 0) > 0 ? (
                          <span
                            className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white"
                            aria-label={`${p.pending_request_count} pending requests`}
                          >
                            {p.pending_request_count! > 99
                              ? "99+"
                              : p.pending_request_count}
                          </span>
                        ) : null}
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
    </div>
  );
}

export function QiCompanySettingsPage() {
  type SettingsTab =
    | "general"
    | "ai"
    | "ai-skills"
    | "letterhead"
    | "bank"
    | "theme";

  const emptySettings = (orgId: string): CompanySettings => ({
    org_id: orgId,
    ai_enabled: false,
    ai_provider: "openai",
    ai_model: "gpt-4o-mini",
    ai_api_key: "",
    ai_system_prompt: "",
    letterhead_company_name: "",
    letterhead_tagline: "",
    letterhead_header: "",
    letterhead_footer: "",
    letterhead_logo_url: "",
    letterhead_show_gst: true,
    bank_name: "",
    bank_account_name: "",
    bank_account_number: "",
    bank_ifsc: "",
    bank_branch: "",
    bank_upi_id: "",
    theme_primary_color: "#4f46e5",
    theme_accent_color: "#0f172a",
    theme_mode: "light",
    theme_sidebar_style: "dark",
    meeting_prefer_free_external: true,
    meeting_default_platform: "zoom",
    meeting_mute_on_entry: true,
    meeting_waiting_room: false,
    meeting_allow_screen_share: true,
    meeting_allow_chat: true,
    meeting_recording_enabled: false,
    meeting_ai_summary_enabled: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const [org, setOrg] = useState<Organization | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingLetterhead, setUploadingLetterhead] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiProviders, setAiProviders] = useState<CompanyAiProvider[]>([]);
  const [selectedAiProviderIds, setSelectedAiProviderIds] = useState<string[]>(
    [],
  );
  const [showAiProviderModal, setShowAiProviderModal] = useState(false);
  const [editingAiProviderId, setEditingAiProviderId] = useState<string | null>(
    null,
  );
  const [savingAiProvider, setSavingAiProvider] = useState(false);
  const [visibleAiProviderKeys, setVisibleAiProviderKeys] = useState<
    Record<string, boolean>
  >({});
  const emptyAiProviderForm = {
    displayName: "",
    provider: "openai",
    modelName: "gpt-4o-mini",
    apiKey: "",
  };
  const [aiProviderForm, setAiProviderForm] = useState(emptyAiProviderForm);

  const [aiSkills, setAiSkills] = useState<CompanyAiSkill[]>([]);
  const [selectedAiSkillIds, setSelectedAiSkillIds] = useState<string[]>([]);
  const [showAiSkillModal, setShowAiSkillModal] = useState(false);
  const [editingAiSkillId, setEditingAiSkillId] = useState<string | null>(null);
  const [savingAiSkill, setSavingAiSkill] = useState(false);
  const [visibleAiSkillPrompts, setVisibleAiSkillPrompts] = useState<
    Record<string, boolean>
  >({});
  const emptyAiSkillForm = {
    skillName: "",
    skillKey: "",
    description: "",
    skillPrompt: "",
  };
  const [aiSkillForm, setAiSkillForm] = useState(emptyAiSkillForm);

  const aiProviderOptions = [
    { value: "openai", label: "OpenAI" },
    { value: "gemini", label: "Google Gemini" },
    { value: "anthropic", label: "Anthropic" },
    { value: "azure_openai", label: "Azure OpenAI" },
    { value: "groq", label: "Groq" },
    { value: "mistral", label: "Mistral" },
    { value: "deepseek", label: "DeepSeek" },
    { value: "perplexity", label: "Perplexity" },
    { value: "cohere", label: "Cohere" },
    { value: "other", label: "Other" },
  ];

  const aiModelOptions: Record<string, string[]> = {
    openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"],
    gemini: [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
    ],
    anthropic: [
      "claude-sonnet-4-5",
      "claude-3-5-sonnet-latest",
      "claude-3-5-haiku-latest",
      "claude-3-opus-latest",
    ],
    azure_openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1"],
    groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    mistral: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"],
    deepseek: ["deepseek-chat", "deepseek-reasoner"],
    perplexity: ["sonar", "sonar-pro"],
    cohere: ["command-r-plus", "command-r"],
    other: [],
  };

  function normalizeAiProvider(value: string | null | undefined) {
    if (value === "google") return "gemini";
    return value || "openai";
  }

  function providerLabel(value: string) {
    return (
      aiProviderOptions.find((o) => o.value === value)?.label ||
      value ||
      "Provider"
    );
  }

  function modelChoicesFor(provider: string) {
    return aiModelOptions[normalizeAiProvider(provider)] ?? [];
  }

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "general", label: "General Setting" },
    { id: "ai", label: "AI Setting" },
    { id: "ai-skills", label: "AI Skill Setting" },
    { id: "letterhead", label: "Letter Head Setting" },
    { id: "bank", label: "Bank Details" },
    { id: "theme", label: "Theme Setting" },
  ];

  function slugifySkillKey(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  async function load() {
    setLoading(true);
    setError(null);
    const { data: orgData, error: loadError } = await supabase
      .from("organizations")
      .select("*")
      .eq("type", "platform")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (loadError || !orgData) {
      setError(loadError?.message ?? "Platform company profile not found.");
      setOrg(null);
      setSettings(null);
      setLoading(false);
      return;
    }

    const platformOrg = orgData as Organization;
    setOrg(platformOrg);

    const { data: settingsData, error: settingsError } = await supabase
      .from("company_settings")
      .select("*")
      .eq("org_id", platformOrg.id)
      .maybeSingle();

    if (settingsError) {
      setError(settingsError.message);
      setSettings(emptySettings(platformOrg.id));
    } else if (settingsData) {
      setSettings(settingsData as CompanySettings);
    } else {
      const seed = emptySettings(platformOrg.id);
      seed.letterhead_company_name = platformOrg.name;
      const { data: inserted, error: insertError } = await supabase
        .from("company_settings")
        .insert(seed)
        .select("*")
        .single();
      if (insertError) {
        setSettings(seed);
      } else {
        setSettings(inserted as CompanySettings);
      }
    }

    const { data: providerRows } = await supabase
      .from("company_ai_providers")
      .select("*")
      .eq("org_id", platformOrg.id)
      .order("created_at", { ascending: false });
    const list = (providerRows ?? []) as CompanyAiProvider[];
    setAiProviders(list);
    setSelectedAiProviderIds((prev) =>
      prev.filter((id) => list.some((p) => p.id === id)),
    );

    const { data: skillRows } = await supabase
      .from("company_ai_skills")
      .select("*")
      .eq("org_id", platformOrg.id)
      .order("created_at", { ascending: false });
    const skills = (skillRows ?? []) as CompanyAiSkill[];
    setAiSkills(skills);
    setSelectedAiSkillIds((prev) =>
      prev.filter((id) => skills.some((s) => s.id === id)),
    );

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function uploadLogo(file: File) {
    if (!org) return;
    setUploadingLogo(true);
    setMessage(null);
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${org.id}/logo.${ext}`;
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
    setMessage("Company logo updated.");
    window.dispatchEvent(new Event("qi-brand-updated"));
  }

  async function uploadLetterheadLogo(file: File) {
    if (!org || !settings) return;
    setUploadingLetterhead(true);
    setMessage(null);
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${org.id}/letterhead.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("org-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setUploadingLetterhead(false);
      setError(uploadError.message);
      return;
    }
    const { data: pub } = supabase.storage.from("org-assets").getPublicUrl(path);
    const logoUrl = `${pub.publicUrl}?t=${Date.now()}`;
    setSettings({ ...settings, letterhead_logo_url: logoUrl });
    setUploadingLetterhead(false);
    setMessage("Letterhead logo uploaded. Click Save to keep changes.");
  }

  async function saveGeneral() {
    if (!org) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    const { error: saveError } = await supabase
      .from("organizations")
      .update({
        name: org.name.trim(),
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
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setMessage("General settings saved.");
    window.dispatchEvent(new Event("qi-brand-updated"));
  }

  async function saveSettings(successMessage: string) {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    const payload = {
      ...settings,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await supabase
      .from("company_settings")
      .upsert(payload, { onConflict: "org_id" });
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setMessage(successMessage);
  }

  async function syncActiveProviderToSettings(row: CompanyAiProvider) {
    if (!settings) return;
    const next = {
      ...settings,
      ai_enabled: true,
      ai_provider: row.provider,
      ai_model: row.model_name,
      ai_api_key: row.api_key,
      updated_at: new Date().toISOString(),
    };
    setSettings(next);
    await supabase.from("company_settings").upsert(next, { onConflict: "org_id" });
  }

  async function disableAiInSettings() {
    if (!settings) return;
    const next = {
      ...settings,
      ai_enabled: false,
      updated_at: new Date().toISOString(),
    };
    setSettings(next);
    await supabase.from("company_settings").upsert(next, { onConflict: "org_id" });
  }

  function openAddAiProvider() {
    setError(null);
    setEditingAiProviderId(null);
    setAiProviderForm(emptyAiProviderForm);
    setShowAiProviderModal(true);
  }

  function openEditAiProvider(row: CompanyAiProvider) {
    setError(null);
    setEditingAiProviderId(row.id);
    setAiProviderForm({
      displayName: row.display_name,
      provider: normalizeAiProvider(row.provider),
      modelName: row.model_name,
      apiKey: row.api_key,
    });
    setShowAiProviderModal(true);
  }

  function toggleAiProviderSelect(id: string) {
    setSelectedAiProviderIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAiProviderSelectAll() {
    if (
      aiProviders.length > 0 &&
      selectedAiProviderIds.length === aiProviders.length
    ) {
      setSelectedAiProviderIds([]);
    } else {
      setSelectedAiProviderIds(aiProviders.map((p) => p.id));
    }
  }

  async function saveAiProvider() {
    if (!org) return;
    setError(null);
    setMessage(null);
    if (!aiProviderForm.displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    if (!aiProviderForm.modelName.trim()) {
      setError("Model name is required.");
      return;
    }
    if (!aiProviderForm.apiKey.trim()) {
      setError("API key is required.");
      return;
    }
    setSavingAiProvider(true);

    const payload = {
      display_name: aiProviderForm.displayName.trim(),
      provider: normalizeAiProvider(aiProviderForm.provider),
      model_name: aiProviderForm.modelName.trim(),
      api_key: aiProviderForm.apiKey.trim(),
      updated_at: new Date().toISOString(),
    };

    if (editingAiProviderId) {
      const { data, error: updateError } = await supabase
        .from("company_ai_providers")
        .update(payload)
        .eq("id", editingAiProviderId)
        .select("*")
        .single();
      setSavingAiProvider(false);
      if (updateError || !data) {
        setError(updateError?.message ?? "Failed to update AI provider.");
        return;
      }
      const row = data as CompanyAiProvider;
      setAiProviders((prev) =>
        prev.map((p) => (p.id === row.id ? row : p)),
      );
      if (row.is_active) {
        await syncActiveProviderToSettings(row);
      }
      setAiProviderForm(emptyAiProviderForm);
      setEditingAiProviderId(null);
      setShowAiProviderModal(false);
      setMessage("AI provider updated.");
      return;
    }

    const makeActive = aiProviders.length === 0;
    const { data, error: insertError } = await supabase
      .from("company_ai_providers")
      .insert({
        org_id: org.id,
        ...payload,
        is_active: makeActive,
      })
      .select("*")
      .single();
    setSavingAiProvider(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Failed to add AI provider.");
      return;
    }
    const row = data as CompanyAiProvider;
    setAiProviders((prev) => [row, ...prev]);
    if (makeActive) {
      await syncActiveProviderToSettings(row);
    }
    setAiProviderForm(emptyAiProviderForm);
    setShowAiProviderModal(false);
    setMessage("AI provider added.");
  }

  async function setActiveAiProvider(id: string) {
    if (!org) return;
    setError(null);
    setMessage(null);
    const target = aiProviders.find((p) => p.id === id);
    if (!target) return;

    await supabase
      .from("company_ai_providers")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("org_id", org.id)
      .eq("is_active", true);

    const { error: updateError } = await supabase
      .from("company_ai_providers")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setAiProviders((prev) =>
      prev.map((p) => ({ ...p, is_active: p.id === id })),
    );
    await syncActiveProviderToSettings({ ...target, is_active: true });
    setMessage(
      `${target.display_name} set as active. AI features are now enabled.`,
    );
  }

  async function setAiProviderStatus(id: string, isActive: boolean) {
    const target = aiProviders.find((p) => p.id === id);
    if (!target) return;
    if (isActive) {
      await setActiveAiProvider(id);
      return;
    }
    if (!target.is_active) return;

    setError(null);
    setMessage(null);
    const { error: updateError } = await supabase
      .from("company_ai_providers")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setAiProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_active: false } : p)),
    );
    await disableAiInSettings();
    setMessage(
      `${target.display_name} set as inactive. AI features are now disabled.`,
    );
  }

  async function deleteAiProvider(id: string) {
    const target = aiProviders.find((p) => p.id === id);
    if (!target) return;
    const ok = window.confirm(`Delete AI provider "${target.display_name}"?`);
    if (!ok) return;
    setError(null);
    setMessage(null);
    const { error: deleteError } = await supabase
      .from("company_ai_providers")
      .delete()
      .eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    const next = aiProviders.filter((p) => p.id !== id);
    setAiProviders(next);
    setSelectedAiProviderIds((prev) => prev.filter((x) => x !== id));
    if (target.is_active) {
      if (next[0]) {
        await setActiveAiProvider(next[0].id);
      } else {
        await disableAiInSettings();
        setMessage("AI provider deleted. AI features are now disabled.");
      }
    } else {
      setMessage("AI provider deleted.");
    }
  }

  function openAddAiSkill() {
    setError(null);
    setEditingAiSkillId(null);
    setAiSkillForm(emptyAiSkillForm);
    setShowAiSkillModal(true);
  }

  function openEditAiSkill(row: CompanyAiSkill) {
    setError(null);
    setEditingAiSkillId(row.id);
    setAiSkillForm({
      skillName: row.skill_name,
      skillKey: row.skill_key,
      description: row.description ?? "",
      skillPrompt: row.skill_prompt,
    });
    setShowAiSkillModal(true);
  }

  function toggleAiSkillSelect(id: string) {
    setSelectedAiSkillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAiSkillSelectAll() {
    if (aiSkills.length > 0 && selectedAiSkillIds.length === aiSkills.length) {
      setSelectedAiSkillIds([]);
    } else {
      setSelectedAiSkillIds(aiSkills.map((s) => s.id));
    }
  }

  async function saveAiSkill() {
    if (!org) return;
    setError(null);
    setMessage(null);
    const skillName = aiSkillForm.skillName.trim();
    const skillKey =
      slugifySkillKey(aiSkillForm.skillKey) || slugifySkillKey(skillName);
    const skillPrompt = aiSkillForm.skillPrompt.trim();
    if (!skillName) {
      setError("Skill name is required.");
      return;
    }
    if (!skillKey) {
      setError("Skill key is required.");
      return;
    }
    if (!skillPrompt) {
      setError("Skill prompt is required.");
      return;
    }

    setSavingAiSkill(true);
    const payload = {
      skill_name: skillName,
      skill_key: skillKey,
      description: aiSkillForm.description.trim(),
      skill_prompt: skillPrompt,
      updated_at: new Date().toISOString(),
    };

    if (editingAiSkillId) {
      const { data, error: updateError } = await supabase
        .from("company_ai_skills")
        .update(payload)
        .eq("id", editingAiSkillId)
        .select("*")
        .single();
      setSavingAiSkill(false);
      if (updateError || !data) {
        setError(updateError?.message ?? "Failed to update AI skill.");
        return;
      }
      const row = data as CompanyAiSkill;
      setAiSkills((prev) => prev.map((s) => (s.id === row.id ? row : s)));
      setAiSkillForm(emptyAiSkillForm);
      setEditingAiSkillId(null);
      setShowAiSkillModal(false);
      setMessage("AI skill updated.");
      return;
    }

    const { data, error: insertError } = await supabase
      .from("company_ai_skills")
      .insert({
        org_id: org.id,
        ...payload,
        is_active: true,
      })
      .select("*")
      .single();
    setSavingAiSkill(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Failed to add AI skill.");
      return;
    }
    const row = data as CompanyAiSkill;
    setAiSkills((prev) => [row, ...prev]);
    setAiSkillForm(emptyAiSkillForm);
    setShowAiSkillModal(false);
    setMessage("AI skill added.");
  }

  async function setAiSkillStatus(id: string, isActive: boolean) {
    const target = aiSkills.find((s) => s.id === id);
    if (!target || target.is_active === isActive) return;
    setError(null);
    setMessage(null);
    const { error: updateError } = await supabase
      .from("company_ai_skills")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setAiSkills((prev) =>
      prev.map((s) => (s.id === id ? { ...s, is_active: isActive } : s)),
    );
    setMessage(
      isActive
        ? `${target.skill_name} set as active.`
        : `${target.skill_name} set as inactive.`,
    );
  }

  async function deleteAiSkill(id: string) {
    const target = aiSkills.find((s) => s.id === id);
    if (!target) return;
    const ok = window.confirm(`Delete AI skill "${target.skill_name}"?`);
    if (!ok) return;
    setError(null);
    setMessage(null);
    const { error: deleteError } = await supabase
      .from("company_ai_skills")
      .delete()
      .eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setAiSkills((prev) => prev.filter((s) => s.id !== id));
    setSelectedAiSkillIds((prev) => prev.filter((x) => x !== id));
    setMessage("AI skill deleted.");
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading company settings…</p>;
  }

  if (!org || !settings) {
    return <EmptyState message="Platform company profile not found." />;
  }

  return (
    <div>
      <PageHeader title="Company Setting" />

      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setMessage(null);
              setError(null);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "bg-indigo-600 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {message ? (
        <p className="mb-3 text-sm text-emerald-700">{message}</p>
      ) : null}
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {activeTab === "general" ? (
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
                <span className="text-sm font-black text-indigo-700">
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
                Company Logo
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                PNG or JPG, shown in the QI portal sidebar and top bar.
              </p>
              <label className="mt-2 inline-flex cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                {uploadingLogo ? "Uploading…" : "Upload logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  disabled={uploadingLogo}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadLogo(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-4">
            <label className="text-xs font-semibold text-slate-700 sm:col-span-3">
              Company Name
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={org.name}
                onChange={(e) => setOrg({ ...org, name: e.target.value })}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700 sm:col-span-1">
              GST Number
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={org.gst_number ?? ""}
                onChange={(e) => setOrg({ ...org, gst_number: e.target.value })}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:col-span-2 lg:grid-cols-5">
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
            disabled={saving}
            onClick={() => void saveGeneral()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 sm:w-fit"
          >
            {saving ? "Saving…" : "Save General Setting"}
          </button>
        </Panel>
      ) : null}

      {activeTab === "ai" ? (
        <Panel className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2">
            <button
              type="button"
              onClick={openAddAiProvider}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Add AI Provider
            </button>
          </div>

          {aiProviders.length > 0 ? (
            <div className="sm:col-span-2 overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-12 border border-slate-200 px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={
                            aiProviders.length > 0 &&
                            selectedAiProviderIds.length === aiProviders.length
                          }
                          onChange={toggleAiProviderSelectAll}
                          aria-label="Select all AI providers"
                          className="h-4 w-4"
                        />
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-left">
                        Display name
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Provider
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Model
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        API Key
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
                    {aiProviders.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={selectedAiProviderIds.includes(row.id)}
                            onChange={() => toggleAiProviderSelect(row.id)}
                            aria-label={`Select ${row.display_name}`}
                            className="h-4 w-4"
                          />
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-left font-medium text-slate-900">
                          {row.display_name}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                          {providerLabel(row.provider)}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                          {row.model_name}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          {visibleAiProviderKeys[row.id] ? (
                            <div className="inline-flex max-w-full items-center justify-center gap-2">
                              <span className="truncate font-mono text-xs text-slate-700">
                                {row.api_key}
                              </span>
                              <button
                                type="button"
                                className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() =>
                                  setVisibleAiProviderKeys((prev) => ({
                                    ...prev,
                                    [row.id]: false,
                                  }))
                                }
                              >
                                Hide
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                              onClick={() =>
                                setVisibleAiProviderKeys((prev) => ({
                                  ...prev,
                                  [row.id]: true,
                                }))
                              }
                            >
                              View
                            </button>
                          )}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          <select
                            className={`rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize ${
                              row.is_active
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "border-slate-300 bg-slate-50 text-slate-700"
                            }`}
                            value={row.is_active ? "active" : "inactive"}
                            aria-label={`Status for ${row.display_name}`}
                            onChange={(e) =>
                              void setAiProviderStatus(
                                row.id,
                                e.target.value === "active",
                              )
                            }
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              title="Edit"
                              aria-label={`Edit ${row.display_name}`}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50"
                              onClick={() => openEditAiProvider(row)}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              aria-label={`Delete ${row.display_name}`}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-sm hover:bg-rose-50"
                              onClick={() => void deleteAiProvider(row.id)}
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
            </div>
          ) : (
            <p className="sm:col-span-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No saved AI providers yet. Click Add AI Provider to create one.
            </p>
          )}
        </Panel>
      ) : null}

      {showAiProviderModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-provider-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="ai-provider-modal-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  {editingAiProviderId
                    ? "Edit AI Provider"
                    : "Add AI Provider"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Save a provider profile to reuse across AI features.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                disabled={savingAiProvider}
                onClick={() => {
                  setShowAiProviderModal(false);
                  setEditingAiProviderId(null);
                }}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            {error ? (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            ) : null}

            <div className="grid gap-3">
              <label className="text-xs font-semibold text-slate-600">
                Display name *
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={aiProviderForm.displayName}
                  onChange={(e) =>
                    setAiProviderForm({
                      ...aiProviderForm,
                      displayName: e.target.value,
                    })
                  }
                  placeholder="e.g. Production Gemini"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                AI Provider *
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={aiProviderForm.provider}
                  onChange={(e) => {
                    const provider = e.target.value;
                    const models = modelChoicesFor(provider);
                    setAiProviderForm({
                      ...aiProviderForm,
                      provider,
                      modelName: models[0] ?? "",
                    });
                  }}
                >
                  {aiProviderOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Model Name *
                {modelChoicesFor(aiProviderForm.provider).length > 0 ? (
                  <>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                      value={
                        modelChoicesFor(aiProviderForm.provider).includes(
                          aiProviderForm.modelName,
                        )
                          ? aiProviderForm.modelName
                          : "__custom__"
                      }
                      onChange={(e) => {
                        if (e.target.value === "__custom__") {
                          setAiProviderForm({
                            ...aiProviderForm,
                            modelName: "",
                          });
                          return;
                        }
                        setAiProviderForm({
                          ...aiProviderForm,
                          modelName: e.target.value,
                        });
                      }}
                    >
                      {modelChoicesFor(aiProviderForm.provider).map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                      <option value="__custom__">Custom model…</option>
                    </select>
                    {!modelChoicesFor(aiProviderForm.provider).includes(
                      aiProviderForm.modelName,
                    ) ? (
                      <input
                        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                        value={aiProviderForm.modelName}
                        onChange={(e) =>
                          setAiProviderForm({
                            ...aiProviderForm,
                            modelName: e.target.value,
                          })
                        }
                        placeholder="Custom model name"
                      />
                    ) : null}
                  </>
                ) : (
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                    value={aiProviderForm.modelName}
                    onChange={(e) =>
                      setAiProviderForm({
                        ...aiProviderForm,
                        modelName: e.target.value,
                      })
                    }
                    placeholder="Enter model name"
                  />
                )}
              </label>
              <label className="text-xs font-semibold text-slate-600">
                API Key *
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={aiProviderForm.apiKey}
                  onChange={(e) =>
                    setAiProviderForm({
                      ...aiProviderForm,
                      apiKey: e.target.value,
                    })
                  }
                  placeholder="Paste API key"
                  autoComplete="off"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={savingAiProvider}
                onClick={() => {
                  setShowAiProviderModal(false);
                  setEditingAiProviderId(null);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingAiProvider}
                onClick={() => void saveAiProvider()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {savingAiProvider
                  ? "Saving…"
                  : editingAiProviderId
                    ? "Update Provider"
                    : "Save Provider"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "ai-skills" ? (
        <Panel className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2">
            <button
              type="button"
              onClick={openAddAiSkill}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Add AI Skill
            </button>
          </div>

          {aiSkills.length > 0 ? (
            <div className="sm:col-span-2 overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-12 border border-slate-200 px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={
                            aiSkills.length > 0 &&
                            selectedAiSkillIds.length === aiSkills.length
                          }
                          onChange={toggleAiSkillSelectAll}
                          aria-label="Select all AI skills"
                          className="h-4 w-4"
                        />
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-left">
                        Skill name
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Skill key
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Description
                      </th>
                      <th className="border border-slate-200 px-3 py-2.5 text-center">
                        Prompt
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
                    {aiSkills.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={selectedAiSkillIds.includes(row.id)}
                            onChange={() => toggleAiSkillSelect(row.id)}
                            aria-label={`Select ${row.skill_name}`}
                            className="h-4 w-4"
                          />
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-left font-medium text-slate-900">
                          {row.skill_name}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center font-mono text-xs text-slate-700">
                          {row.skill_key}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                          {row.description || "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          {visibleAiSkillPrompts[row.id] ? (
                            <div className="mx-auto max-w-xs text-left">
                              <p className="whitespace-pre-wrap text-xs text-slate-700">
                                {row.skill_prompt}
                              </p>
                              <button
                                type="button"
                                className="mt-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() =>
                                  setVisibleAiSkillPrompts((prev) => ({
                                    ...prev,
                                    [row.id]: false,
                                  }))
                                }
                              >
                                Hide
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                              onClick={() =>
                                setVisibleAiSkillPrompts((prev) => ({
                                  ...prev,
                                  [row.id]: true,
                                }))
                              }
                            >
                              View
                            </button>
                          )}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          <select
                            className={`rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize ${
                              row.is_active
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "border-slate-300 bg-slate-50 text-slate-700"
                            }`}
                            value={row.is_active ? "active" : "inactive"}
                            aria-label={`Status for ${row.skill_name}`}
                            onChange={(e) =>
                              void setAiSkillStatus(
                                row.id,
                                e.target.value === "active",
                              )
                            }
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              title="Edit"
                              aria-label={`Edit ${row.skill_name}`}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50"
                              onClick={() => openEditAiSkill(row)}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              aria-label={`Delete ${row.skill_name}`}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-sm hover:bg-rose-50"
                              onClick={() => void deleteAiSkill(row.id)}
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
            </div>
          ) : (
            <p className="sm:col-span-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No custom AI skills yet. Click Add AI Skill to create one.
            </p>
          )}
        </Panel>
      ) : null}

      {showAiSkillModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-skill-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="ai-skill-modal-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  {editingAiSkillId ? "Edit AI Skill" : "Add AI Skill"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Define a reusable custom skill prompt for AI features.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
                disabled={savingAiSkill}
                onClick={() => {
                  setShowAiSkillModal(false);
                  setEditingAiSkillId(null);
                }}
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            {error ? (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            ) : null}

            <div className="grid gap-3">
              <label className="text-xs font-semibold text-slate-600">
                Skill name *
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={aiSkillForm.skillName}
                  onChange={(e) => {
                    const skillName = e.target.value;
                    setAiSkillForm((prev) => ({
                      ...prev,
                      skillName,
                      skillKey:
                        prev.skillKey === "" ||
                        prev.skillKey === slugifySkillKey(prev.skillName)
                          ? slugifySkillKey(skillName)
                          : prev.skillKey,
                    }));
                  }}
                  placeholder="e.g. Safety Presentation Style"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Skill key *
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={aiSkillForm.skillKey}
                  onChange={(e) =>
                    setAiSkillForm({
                      ...aiSkillForm,
                      skillKey: slugifySkillKey(e.target.value),
                    })
                  }
                  placeholder="e.g. safety-presentation-style"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Description
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={aiSkillForm.description}
                  onChange={(e) =>
                    setAiSkillForm({
                      ...aiSkillForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="Short summary of what this skill does"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Skill prompt *
                <textarea
                  rows={6}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                  value={aiSkillForm.skillPrompt}
                  onChange={(e) =>
                    setAiSkillForm({
                      ...aiSkillForm,
                      skillPrompt: e.target.value,
                    })
                  }
                  placeholder="Write the custom instructions / workflow for this AI skill"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={savingAiSkill}
                onClick={() => {
                  setShowAiSkillModal(false);
                  setEditingAiSkillId(null);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingAiSkill}
                onClick={() => void saveAiSkill()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {savingAiSkill
                  ? "Saving…"
                  : editingAiSkillId
                    ? "Update Skill"
                    : "Save Skill"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "letterhead" ? (
        <Panel className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
              {settings.letterhead_logo_url ? (
                <img
                  src={settings.letterhead_logo_url}
                  alt="Letterhead logo"
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <span className="text-xs font-semibold text-slate-400">LH</span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                Letterhead Logo
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Used on certificates, invoices, and official letters.
              </p>
              <label className="mt-2 inline-flex cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                {uploadingLetterhead ? "Uploading…" : "Upload letterhead logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  disabled={uploadingLetterhead}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadLetterheadLogo(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
          <label className="text-xs font-semibold text-slate-700">
            Letterhead Company Name
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              value={settings.letterhead_company_name ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  letterhead_company_name: e.target.value,
                })
              }
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Tagline
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              value={settings.letterhead_tagline ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, letterhead_tagline: e.target.value })
              }
            />
          </label>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
            Header Text
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              rows={3}
              value={settings.letterhead_header ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, letterhead_header: e.target.value })
              }
              placeholder="Address / registration lines shown at top"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
            Footer Text
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              rows={3}
              value={settings.letterhead_footer ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, letterhead_footer: e.target.value })
              }
              placeholder="Confidentiality / contact footer"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={settings.letterhead_show_gst}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  letterhead_show_gst: e.target.checked,
                })
              }
            />
            Show GST number on letterhead
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveSettings("Letter head settings saved.")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 sm:w-fit"
          >
            {saving ? "Saving…" : "Save Letter Head Setting"}
          </button>
        </Panel>
      ) : null}

      {activeTab === "bank" ? (
        <Panel className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">
            Bank Name
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              value={settings.bank_name ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, bank_name: e.target.value })
              }
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Account Holder Name
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              value={settings.bank_account_name ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, bank_account_name: e.target.value })
              }
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Account Number
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              value={settings.bank_account_number ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  bank_account_number: e.target.value,
                })
              }
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            IFSC Code
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              value={settings.bank_ifsc ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, bank_ifsc: e.target.value })
              }
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Branch
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              value={settings.bank_branch ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, bank_branch: e.target.value })
              }
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            UPI ID
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              value={settings.bank_upi_id ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, bank_upi_id: e.target.value })
              }
              placeholder="e.g. company@upi"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveSettings("Bank details saved.")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 sm:w-fit"
          >
            {saving ? "Saving…" : "Save Bank Details"}
          </button>
        </Panel>
      ) : null}

      {activeTab === "theme" ? (
        <Panel className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">
            Primary Color
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1"
                value={settings.theme_primary_color || "#4f46e5"}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    theme_primary_color: e.target.value,
                  })
                }
              />
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={settings.theme_primary_color ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    theme_primary_color: e.target.value,
                  })
                }
              />
            </div>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Accent Color
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1"
                value={settings.theme_accent_color || "#0f172a"}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    theme_accent_color: e.target.value,
                  })
                }
              />
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                value={settings.theme_accent_color ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    theme_accent_color: e.target.value,
                  })
                }
              />
            </div>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Theme Mode
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              value={settings.theme_mode || "light"}
              onChange={(e) =>
                setSettings({ ...settings, theme_mode: e.target.value })
              }
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Sidebar Style
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              value={settings.theme_sidebar_style || "dark"}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  theme_sidebar_style: e.target.value,
                })
              }
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="brand">Brand colored</option>
            </select>
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveSettings("Theme settings saved.")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 sm:w-fit"
          >
            {saving ? "Saving…" : "Save Theme Setting"}
          </button>
        </Panel>
      ) : null}
    </div>
  );
}
