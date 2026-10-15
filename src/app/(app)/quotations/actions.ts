"use server";

// Quotations: a price offer, not a sale. Saving, editing or rejecting one
// never touches stock, money or the customer's balance. Accepting one goes
// through the normal bill screen (createInvoice with quotationId), so stock,
// payments and credit are handled by exactly the same code as any other bill.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { TX_OPTIONS } from "@/lib/tx";
import { requireUserApi } from "@/lib/guards";
import { formatPKR, rupeesToPaisa } from "@/lib/money";
import { dateFromInput } from "@/lib/dates";
import { audit } from "@/lib/audit";
import { belowCostNames, billTotal, buildLines, itemRows, itemSchema } from "@/lib/bill-lines";

export type QuotationResult =
  | { ok: true; quotationId: string; number: number }
  | { ok: false; error?: string; belowCost?: string[] };

// Payment terms on the quotation — the same shape as a bill's payments, but
// only written down: no money moves until the quotation becomes a bill.
const paymentSchema = z.object({
  method: z.enum(["CASH", "CHEQUE", "ONLINE"]),
  amountRs: z.coerce.number().positive(),
  chequeNumber: z.string().optional(),
  chequeBank: z.string().optional(),
  chequeDate: z.string().optional(),
});

const quotationSchema = z.object({
  customerId: z.string().min(1),
  payments: z.array(paymentSchema).default([]),
  date: z.string().optional(),
  notes: z.string().optional(),
  confirmBelowCost: z.boolean().default(false),
  items: z.array(itemSchema).min(1, "Add at least one line"),
});

const editQuotationSchema = quotationSchema.extend({ quotationId: z.string().min(1) });

export async function saveQuotation(input: unknown): Promise<QuotationResult> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const editing = typeof input === "object" && input !== null && "quotationId" in input;
    const parsed = (editing ? editQuotationSchema : quotationSchema).safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const d = parsed.data as z.infer<typeof editQuotationSchema>;

    const built = await buildLines(d.items);
    if ("error" in built) return { ok: false, error: built.error };
    const { lines } = built;

    // Same below-cost check as a bill, worked out on the server so staff never see cost.
    if (!d.confirmBelowCost) {
      const below = belowCostNames(lines);
      if (below.length > 0) return { ok: false, belowCost: below };
    }

    const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
    if (!customer) return { ok: false, error: "Customer not found." };

    const total = billTotal(lines);
    const date = dateFromInput(d.date);
    const payments = d.payments.map((p) => ({
      method: p.method,
      amountPaisa: rupeesToPaisa(p.amountRs),
      chequeNumber: p.method === "CHEQUE" ? p.chequeNumber || null : null,
      chequeBank: p.method === "CHEQUE" ? p.chequeBank || null : null,
      chequeDate: p.method === "CHEQUE" ? p.chequeDate || null : null,
    }));
    if (payments.reduce((s, p) => s + p.amountPaisa, 0) > total) {
      return { ok: false, error: "Payment is more than the quotation total." };
    }

    if (editing) {
      const old = await prisma.quotation.findUnique({ where: { id: d.quotationId } });
      if (!old) return { ok: false, error: "Quotation not found." };
      if (old.status !== "OPEN") return { ok: false, error: `Quotation Q-${old.number} is ${old.status.toLowerCase()} and can't be changed.` };

      await prisma.$transaction(async (tx) => {
        await tx.quotationItem.deleteMany({ where: { quotationId: old.id } });
        await tx.quotationPayment.deleteMany({ where: { quotationId: old.id } });
        await tx.quotation.update({
          where: { id: old.id },
          data: {
            customerId: d.customerId,
            notes: d.notes || null,
            ...(date ? { date } : {}),
            items: { create: itemRows(lines) },
            payments: { create: payments },
          },
        });
      }, TX_OPTIONS);

      await audit(user, "QUOTE_EDIT", "Quotation", old.id, `Edited quotation Q-${old.number} (${customer.name}) — now ${formatPKR(total)}`);
      revalidatePath("/quotations");
      return { ok: true, quotationId: old.id, number: old.number };
    }

    const q = await prisma.quotation.create({
      data: {
        customerId: d.customerId,
        notes: d.notes || null,
        createdById: user.id,
        ...(date ? { date } : {}),
        items: { create: itemRows(lines) },
        payments: { create: payments },
      },
    });

    await audit(user, "QUOTE_CREATE", "Quotation", q.id, `Quotation Q-${q.number} for ${customer.name} — ${formatPKR(total)}`);
    revalidatePath("/quotations");
    return { ok: true, quotationId: q.id, number: q.number };
  }, (error) => ({ ok: false as const, error }));
}

// Turned down, or reopened after being turned down. An accepted quotation
// already has a bill, so it can't move back.
export async function setQuotationRejected(
  quotationId: string,
  rejected: boolean
): Promise<{ ok: boolean; error?: string }> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const q = await prisma.quotation.findUnique({ where: { id: quotationId }, include: { customer: true } });
    if (!q) return { ok: false, error: "Quotation not found." };
    const from = rejected ? "OPEN" : "REJECTED";
    if (q.status !== from) return { ok: false, error: `Quotation Q-${q.number} is ${q.status.toLowerCase()}.` };

    await prisma.quotation.update({
      where: { id: q.id },
      data: rejected ? { status: "REJECTED", closedAt: new Date() } : { status: "OPEN", closedAt: null },
    });
    await audit(
      user,
      rejected ? "QUOTE_REJECT" : "QUOTE_REOPEN",
      "Quotation",
      q.id,
      `${rejected ? "Rejected" : "Reopened"} quotation Q-${q.number} (${q.customer.name})`
    );
    revalidatePath("/quotations");
    return { ok: true };
  }, (error) => ({ ok: false, error }));
}
