import { supabase } from "@/lib/supabase/client";
import type { Invoice } from "@/lib/supabase/types";

export type CreateTrainingInvoiceInput = {
  trainingRequestId: string;
  trainingCode?: string | null;
  programmeTitle?: string | null;
  orgId?: string | null;
  userId?: string | null;
  amountCents: number;
  currency?: string;
  notes?: string | null;
};

function buildInvoiceNumber(trainingCode?: string | null) {
  const stamp = new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const code = trainingCode?.trim().replace(/\s+/g, "") || "TRN";
  return `INV-${code}-${stamp}-${suffix}`;
}

/** Create (or return existing) invoice when training payment is marked paid. */
export async function ensureTrainingPaymentInvoice(
  input: CreateTrainingInvoiceInput,
): Promise<Invoice | null> {
  if (input.amountCents <= 0) return null;

  let existingQuery = supabase
    .from("invoices")
    .select("*")
    .eq("training_request_id", input.trainingRequestId);

  if (input.orgId) {
    existingQuery = existingQuery.eq("org_id", input.orgId);
  } else if (input.userId) {
    existingQuery = existingQuery.eq("user_id", input.userId).is("org_id", null);
  } else {
    return null;
  }

  const { data: existing } = await existingQuery.maybeSingle();
  if (existing) {
    const row = existing as Invoice;
    if (
      row.amount_cents !== input.amountCents ||
      row.status !== "paid"
    ) {
      const { data: updated, error: updErr } = await supabase
        .from("invoices")
        .update({
          amount_cents: input.amountCents,
          status: "paid",
          issued_at: row.issued_at || new Date().toISOString(),
          notes: input.notes ?? row.notes,
        })
        .eq("id", row.id)
        .select("*")
        .single();
      if (updErr) throw new Error(updErr.message);
      return updated as Invoice;
    }
    return row;
  }

  const title = input.programmeTitle?.trim() || "Training";
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      invoice_number: buildInvoiceNumber(input.trainingCode),
      amount_cents: input.amountCents,
      currency: input.currency || "INR",
      status: "paid",
      org_id: input.orgId ?? null,
      user_id: input.orgId ? null : input.userId ?? null,
      training_request_id: input.trainingRequestId,
      issued_at: new Date().toISOString(),
      notes:
        input.notes ??
        `Auto-generated for paid training: ${title}${
          input.trainingCode ? ` (${input.trainingCode})` : ""
        }`,
    })
    .select("*")
    .single();

  if (error) {
    // Race: unique index — fetch existing
    if (error.code === "23505") {
      const { data: raced } = await existingQuery.maybeSingle();
      return (raced as Invoice | null) ?? null;
    }
    throw new Error(error.message);
  }
  return data as Invoice;
}
