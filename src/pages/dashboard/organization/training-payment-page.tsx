import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  EmptyState,
  PageHeader,
  Panel,
} from "@/components/dashboard-shell";
import {
  useIsWorkspacePreview,
  useWorkspaceReadOnly,
  useWorkspaceScopedProfile as useAuth,
} from "@/features/workspace/WorkspacePreview";
import { supabase } from "@/lib/supabase/client";
import type {
  Invoice,
  Profile,
  TrainingParticipantPayment,
  TrainingParticipantPaymentStatus,
  TrainingRequest,
} from "@/lib/supabase/types";

type BankDetails = {
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  bank_upi_id: string | null;
  company_name: string | null;
};

type PaymentParticipant = {
  userId: string;
  name: string;
  email: string;
  payment: TrainingParticipantPayment;
};

type TrainingPaymentRow = {
  requestId: string;
  trainingCode: string;
  title: string;
  trainingDate: string | null;
  status: string;
  participants: PaymentParticipant[];
  perPersonCents: number;
  totalCents: number;
  overallStatus: TrainingParticipantPaymentStatus | "mixed";
  linkSentAt: string | null;
  invoiceNumber: string | null;
  invoiceId: string | null;
};

function inr(cents: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function statusLabel(status: TrainingParticipantPaymentStatus | "mixed") {
  switch (status) {
    case "pending":
      return "Pending";
    case "link_sent":
      return "Link sent";
    case "paid":
      return "Paid";
    case "waived":
      return "Waived";
    case "mixed":
      return "Mixed";
    default:
      return status;
  }
}

function statusClass(status: TrainingParticipantPaymentStatus | "mixed") {
  switch (status) {
    case "paid":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "link_sent":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "waived":
      return "bg-slate-100 text-slate-600 border-slate-200";
    case "mixed":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

function overallPaymentStatus(
  payments: TrainingParticipantPayment[],
): TrainingParticipantPaymentStatus | "mixed" {
  if (payments.length === 0) return "pending";
  const statuses = new Set(payments.map((p) => p.payment_status));
  if (statuses.size === 1) {
    return payments[0].payment_status;
  }
  return "mixed";
}

export function OrgTrainingPaymentPage() {
  const { profile } = useAuth();
  const readOnly = useWorkspaceReadOnly();
  const isPreview = useIsWorkspacePreview();
  const canUpdate =
    profile?.role === "org_admin" && !readOnly && !isPreview;
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TrainingPaymentRow[]>([]);
  const [bank, setBank] = useState<BankDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"view" | "update">("view");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [updateStatus, setUpdateStatus] =
    useState<TrainingParticipantPaymentStatus>("paid");
  const [updateNotes, setUpdateNotes] = useState("");

  const load = useCallback(async () => {
    if (!profile?.org_id) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: requests, error: reqErr }, { data: bankRows, error: bankErr }] =
        await Promise.all([
          supabase
            .from("training_requests")
            .select("*")
            .eq("org_id", profile.org_id)
            .in("status", ["approved", "hold", "scheduled", "completed"])
            .order("updated_at", { ascending: false }),
          supabase.rpc("get_platform_bank_details"),
        ]);
      if (reqErr) throw new Error(reqErr.message);
      if (bankErr) throw new Error(bankErr.message);

      const bankList = (bankRows ?? []) as BankDetails[];
      setBank(bankList[0] ?? null);

      const requestList = (requests ?? []) as TrainingRequest[];
      if (requestList.length === 0) {
        setRows([]);
        return;
      }

      const requestIds = requestList.map((r) => r.id);
      const programmeIds = [
        ...new Set(
          requestList
            .map((r) => r.programme_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      const [{ data: payments }, { data: programmes }, { data: invoices }] =
        await Promise.all([
          supabase
            .from("training_participant_payments")
            .select("*")
            .in("training_request_id", requestIds),
          programmeIds.length
            ? supabase
                .from("training_programmes")
                .select("id, title")
                .in("id", programmeIds)
            : Promise.resolve({
                data: [] as Array<{ id: string; title: string }>,
              }),
          supabase
            .from("invoices")
            .select("id, invoice_number, training_request_id, amount_cents, status")
            .eq("org_id", profile.org_id)
            .in("training_request_id", requestIds),
        ]);

      const paymentList = (payments ?? []) as TrainingParticipantPayment[];
      const paymentsByRequest = new Map<string, TrainingParticipantPayment[]>();
      for (const pay of paymentList) {
        const list = paymentsByRequest.get(pay.training_request_id) ?? [];
        list.push(pay);
        paymentsByRequest.set(pay.training_request_id, list);
      }

      const invoiceByRequest = new Map<
        string,
        Pick<Invoice, "id" | "invoice_number">
      >();
      for (const inv of (invoices ?? []) as Array<
        Pick<Invoice, "id" | "invoice_number" | "training_request_id">
      >) {
        if (inv.training_request_id) {
          invoiceByRequest.set(inv.training_request_id, {
            id: inv.id,
            invoice_number: inv.invoice_number,
          });
        }
      }

      const userIds = [...new Set(paymentList.map((p) => p.user_id))];
      const { data: people } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", userIds)
        : { data: [] as Array<Pick<Profile, "id" | "full_name" | "email">> };
      const peopleMap = new Map(
        ((people ?? []) as Array<Pick<Profile, "id" | "full_name" | "email">>).map(
          (p) => [p.id, p],
        ),
      );
      const programmeMap = new Map(
        ((programmes ?? []) as Array<{ id: string; title: string }>).map((p) => [
          p.id,
          p.title,
        ]),
      );

      const next: TrainingPaymentRow[] = [];
      for (const r of requestList) {
        const pays = paymentsByRequest.get(r.id) ?? [];
        if (pays.length === 0) continue;
        const participants: PaymentParticipant[] = pays.map((pay) => {
          const person = peopleMap.get(pay.user_id);
          return {
            userId: pay.user_id,
            name: person?.full_name?.trim() || person?.email || "Participant",
            email: person?.email || "—",
            payment: pay,
          };
        });
        const amounts = pays.map((p) => p.amount_cents);
        const perPersonCents = amounts[0] ?? 0;
        const totalCents = amounts.reduce((sum, n) => sum + n, 0);
        const linkSentAt =
          pays
            .map((p) => p.payment_link_sent_at)
            .filter(Boolean)
            .sort()
            .at(-1) ?? null;

        const invoice = invoiceByRequest.get(r.id);
        next.push({
          requestId: r.id,
          trainingCode: r.training_code || "—",
          title:
            (r.programme_id && programmeMap.get(r.programme_id)) ||
            r.title.replace(/^(Request|Assigned):\s*/i, "") ||
            "Training",
          trainingDate: r.training_date,
          status: r.status,
          participants,
          perPersonCents,
          totalCents,
          overallStatus: overallPaymentStatus(pays),
          linkSentAt,
          invoiceNumber: invoice?.invoice_number ?? null,
          invoiceId: invoice?.id ?? null,
        });
      }

      setRows(next);
      setSelectedIds((prev) =>
        prev.filter((id) => next.some((r) => r.requestId === id)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payments.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [profile?.org_id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const trainingId = searchParams.get("training");
    const pay = searchParams.get("pay");
    if (!trainingId || !pay) return;
    if (rows.some((r) => r.requestId === trainingId)) {
      setActiveRequestId(trainingId);
      setModalMode(canUpdate ? "update" : "view");
      setUpdateStatus("paid");
      setUpdateNotes("");
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("training");
          next.delete("pay");
          return next;
        },
        { replace: true },
      );
    }
  }, [rows, searchParams, setSearchParams, canUpdate]);

  const activeRow = useMemo(
    () => rows.find((r) => r.requestId === activeRequestId) ?? null,
    [rows, activeRequestId],
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (rows.length > 0 && selectedIds.length === rows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((r) => r.requestId));
    }
  }

  const hasBank =
    Boolean(bank?.bank_name) ||
    Boolean(bank?.bank_account_number) ||
    Boolean(bank?.bank_upi_id);

  function paymentUpiQrUrl(row: TrainingPaymentRow) {
    const upi = bank?.bank_upi_id?.trim();
    if (!upi) return null;
    const pn = encodeURIComponent(
      bank?.bank_account_name?.trim() ||
        bank?.company_name?.trim() ||
        "Quality International",
    );
    const am = (row.totalCents / 100).toFixed(2);
    const tn = encodeURIComponent(
      `${row.title}`.slice(0, 80) || "Training payment",
    );
    const data = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data)}`;
  }

  async function applyPaymentUpdate(scope: "all" | string) {
    if (!activeRow || !canUpdate) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const targets =
        scope === "all"
          ? activeRow.participants
          : activeRow.participants.filter((p) => p.userId === scope);
      if (targets.length === 0) throw new Error("No participants selected.");

      const now = new Date().toISOString();
      const notes = updateNotes.trim() || null;
      for (const target of targets) {
        const { error: updErr } = await supabase
          .from("training_participant_payments")
          .update({
            payment_status: updateStatus,
            notes,
            updated_at: now,
          })
          .eq("id", target.payment.id);
        if (updErr) throw new Error(updErr.message);
      }

      setMessage(
        scope === "all"
          ? `Payment status updated to "${statusLabel(updateStatus)}" for ${targets.length} participant(s).`
          : `Payment status updated to "${statusLabel(updateStatus)}".`,
      );
      await load();
      setActiveRequestId(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update payment status.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openView(requestId: string) {
    setActiveRequestId(requestId);
    setModalMode("view");
    setError(null);
    setMessage(null);
  }

  function openUpdate(requestId: string) {
    setActiveRequestId(requestId);
    setModalMode("update");
    setUpdateStatus("paid");
    setUpdateNotes("");
    setError(null);
    setMessage(null);
  }

  return (
    <div>
      <PageHeader title="Training Payment" />

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-emerald-700">{message}</p> : null}

      {loading ? (
        <EmptyState message="Loading payment requests…" />
      ) : rows.length === 0 ? (
        <EmptyState message="No training payment requests for your organization yet." />
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
                      aria-label="Select all payment rows"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Training ID
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-left">
                    Training
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Date
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Persons
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-right">
                    Per person
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-right">
                    Total
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Payment status
                  </th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.requestId} className="hover:bg-slate-50/80">
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.requestId)}
                        onChange={() => toggleSelect(row.requestId)}
                        aria-label={`Select ${row.title}`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 font-mono text-xs text-slate-700">
                      {row.trainingCode}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 font-medium text-slate-900">
                      {row.title}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {row.trainingDate
                        ? new Date(row.trainingDate).toLocaleDateString("en-IN")
                        : "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-700">
                      {row.participants.length}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-right text-slate-800">
                      {inr(row.perPersonCents)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-right font-semibold text-slate-900">
                      {inr(row.totalCents)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <div className="inline-flex flex-col items-center gap-1">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(row.overallStatus)}`}
                        >
                          {statusLabel(row.overallStatus)}
                        </span>
                        {row.invoiceNumber ? (
                          <span
                            className="max-w-[160px] truncate font-mono text-[10px] font-semibold text-indigo-700"
                            title={row.invoiceNumber}
                          >
                            {row.invoiceNumber}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          canUpdate
                            ? openUpdate(row.requestId)
                            : openView(row.requestId)
                        }
                        className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        {canUpdate ? "View / Update Payment" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {activeRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="training-payment-title"
        >
          <div className="max-h-[90dvh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2
                  id="training-payment-title"
                  className="text-base font-semibold text-slate-900"
                >
                  {activeRow.title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {activeRow.trainingCode}
                  {activeRow.linkSentAt
                    ? ` · Link sent ${new Date(activeRow.linkSentAt).toLocaleString("en-IN")}`
                    : ""}
                  {activeRow.invoiceNumber
                    ? ` · Invoice ${activeRow.invoiceNumber}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveRequestId(null)}
                disabled={busy}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-2xl leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-60"
               title="Close" aria-label="Close">
                  ×
                </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        Name
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-center">
                        Email
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-center">
                        Amount
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-center">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRow.participants.map((p) => (
                      <tr key={p.userId}>
                        <td className="border-b border-slate-100 px-3 py-2">
                          {p.name}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-center text-slate-600">
                          {p.email}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-center">
                          {inr(p.payment.amount_cents)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-center">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(p.payment.payment_status)}`}
                          >
                            {statusLabel(p.payment.payment_status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold text-slate-900">
                      <td
                        className="border-t border-slate-200 px-3 py-2.5 text-left"
                        colSpan={2}
                      >
                        Total ({activeRow.participants.length} persons)
                      </td>
                      <td className="border-t border-slate-200 px-3 py-2.5 text-center text-indigo-700">
                        {inr(activeRow.totalCents)}
                      </td>
                      <td className="border-t border-slate-200 px-3 py-2.5 text-center text-slate-500">
                        —
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {hasBank ? (
                <div className="grid gap-4 sm:grid-cols-2 sm:items-stretch">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Bank Details for Payment
                    </h3>
                    <dl className="mt-3 grid gap-2 text-sm">
                      <div>
                        <dt className="text-xs text-slate-500">Account Name</dt>
                        <dd>
                          {bank?.bank_account_name || bank?.company_name || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Account Number</dt>
                        <dd>{bank?.bank_account_number || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">IFSC Code</dt>
                        <dd>{bank?.bank_ifsc || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">
                          Bank & Branch Details
                        </dt>
                        <dd>
                          {[bank?.bank_name, bank?.bank_branch]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col items-center text-center">
                      {paymentUpiQrUrl(activeRow) ? (
                        <img
                          src={paymentUpiQrUrl(activeRow) ?? undefined}
                          alt="UPI payment QR code"
                          className="h-44 w-44 rounded-lg border border-slate-200 bg-white p-2"
                        />
                      ) : (
                        <p className="max-w-[11rem] py-10 text-sm text-slate-500">
                          UPI ID missing — QR not available.
                        </p>
                      )}
                      {bank?.bank_upi_id ? (
                        <p className="mt-2 text-sm font-bold text-slate-800">
                          UPI: {bank.bank_upi_id}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-500">
                        Amount: {inr(activeRow.totalCents)}
                      </p>
                    </div>
                    <h3 className="shrink-0 self-center text-sm font-semibold tracking-wide text-slate-900 [writing-mode:vertical-rl]">
                      Payment QR
                    </h3>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Bank details are not configured yet.
                </p>
              )}

              {canUpdate && modalMode === "view" ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setModalMode("update")}
                    className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    Update Payment
                  </button>
                </div>
              ) : null}

              {canUpdate && modalMode === "update" ? (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Update Payment
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(140px,180px)_1fr]">
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        Status
                      </span>
                      <select
                        value={updateStatus}
                        onChange={(e) =>
                          setUpdateStatus(
                            e.target.value as TrainingParticipantPaymentStatus,
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                        disabled={busy}
                      >
                        <option value="link_sent">Link sent</option>
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                        <option value="waived">Waived</option>
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        Notes / UTR
                      </span>
                      <input
                        type="text"
                        value={updateNotes}
                        onChange={(e) => setUpdateNotes(e.target.value)}
                        placeholder="e.g. UTR / transaction reference"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                        disabled={busy}
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setActiveRequestId(null)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void applyPaymentUpdate("all")}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {busy ? "Saving…" : "Update for All Participants"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
