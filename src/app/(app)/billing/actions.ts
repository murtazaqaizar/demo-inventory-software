"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { TX_OPTIONS } from "@/lib/tx";
import { requireUserApi, requireOwnerApi } from "@/lib/guards";
import { rupeesToPaisa, formatPKR } from "@/lib/money";
import { dateFromInput } from "@/lib/dates";
import { getColorStockMap } from "@/lib/stock";
import { stockKey } from "@/lib/variants";
import { belowCostNames, billTotal, buildLines, itemRows, itemSchema, type BuiltLine } from "@/lib/bill-lines";
import { getCustomerBalance } from "@/lib/receivables";
import { audit } from "@/lib/audit";
import {
  editBlocker,
  reverseInvoiceMoney,
  voidInvoiceTx,
  writeInvoicePayments,
  writeLastPrices,
  writeSaleStock,
  type PaymentInput,
} from "@/lib/billing-effects";


// Form input carries rupees; everything below the line works in paisa.
function toPaymentInputs(
  payments: { method: "CASH" | "CHEQUE" | "ONLINE"; amountRs: number; chequeNumber?: string; chequeBank?: string; chequeDate?: string }[]
): PaymentInput[] {
  return payments.map((p) => ({
    method: p.method,
    amountPaisa: rupeesToPaisa(p.amountRs),
    chequeNumber: p.chequeNumber,
    chequeBank: p.chequeBank,
    chequeDate: p.chequeDate,
  }));
}

export type InvoiceResult =
  | { ok: true; invoiceId: string; number: number }
  | {
      ok: false;
      error?: string;
      belowCost?: string[];
      shortStock?: ShortStock[];
      creditWarning?: string;
    };

// Quantities on the stock check are thousandths of the product's unit.
export type ShortStock = {
  productId: string;
  colorId: string | null;
  name: string;
  unit: string;
  available: number;
  requested: number;
};

const paymentSchema = z.object({
  method: z.enum(["CASH", "CHEQUE", "ONLINE"]),
  amountRs: z.coerce.number().positive(),
  chequeNumber: z.string().optional(),
  chequeBank: z.string().optional(),
  chequeDate: z.string().optional(),
});

const invoiceSchema = z.object({
  customerId: z.string().min(1),
  // The day the sale happened, `YYYY-MM-DD` from the form. Blank = right now.
  // Goods often leave before the bill gets typed in, so this has to be settable.
  date: z.string().optional(),
  notes: z.string().optional(),
  // Set when this bill is made from an accepted quotation (createInvoice only).
  quotationId: z.string().optional(),
  // acknowledgements
  confirmBelowCost: z.boolean().default(false),
  confirmShortStock: z.boolean().default(false),
  confirmOverLimit: z.boolean().default(false),
  // Split payments (improvement 6). Anything not covered here becomes udhaar.
  payments: z.array(paymentSchema).default([]),
  items: z.array(itemSchema).min(1, "Add at least one line"),
});

// Last rate sold to this customer for this product (spec feature 14).
export async function getLastPrice(
  customerId: string,
  productId: string
): Promise<{ rateRs: number } | null> {
  await requireUserApi();
  const row = await prisma.customerProductPrice.findUnique({
    where: { customerId_productId: { customerId, productId } },
  });
  if (!row) return null;
  return { rateRs: row.lastRatePaisa / 100 };
}

// Stock lines asking for more than is on the shelf, per color variant. `returning`
// = quantity the old version of an edited bill is about to put back (stockKey).
async function findShortStock(lines: BuiltLine[], returning = new Map<string, number>()): Promise<ShortStock[]> {
  const needed = new Map<string, { productId: string; colorId: string | null; name: string; unit: string; total: number }>();
  const productIds = new Set<string>();
  for (const l of lines) {
    if (!l.productId) continue;
    productIds.add(l.productId);
    const k = stockKey(l.productId, l.colorId);
    const prev = needed.get(k);
    needed.set(k, { productId: l.productId, colorId: l.colorId, name: l.name, unit: l.unit, total: (prev?.total ?? 0) + l.qtyMilli });
  }
  const stock = await getColorStockMap([...productIds]);
  const short: ShortStock[] = [];
  for (const [key, l] of needed) {
    const available = (stock.get(key) ?? 0) + (returning.get(key) ?? 0);
    if (l.total > available)
      short.push({ productId: l.productId, colorId: l.colorId, name: l.name, unit: l.unit, available, requested: l.total });
  }
  return short;
}

export async function createInvoice(input: unknown): Promise<InvoiceResult> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const parsed = invoiceSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const d = parsed.data;

    const built = await buildLines(d.items);
    if ("error" in built) return { ok: false, error: built.error };
    const { lines } = built;

    // --- Improvement 1: don't let stock go negative silently ------------------
    if (!d.confirmShortStock) {
      const shortStock = await findShortStock(lines);
      if (shortStock.length > 0) return { ok: false, shortStock };
    }

    // --- Below-cost warning (feature 15), checked server-side so staff never see cost
    if (!d.confirmBelowCost) {
      const below = belowCostNames(lines);
      if (below.length > 0) return { ok: false, belowCost: below };
    }

    const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
    if (!customer) return { ok: false, error: "Customer not found." };

    const quotation = d.quotationId
      ? await prisma.quotation.findUnique({ where: { id: d.quotationId }, select: { id: true, number: true, status: true } })
      : null;
    if (d.quotationId && !quotation) return { ok: false, error: "Quotation not found." };
    if (quotation && quotation.status !== "OPEN") {
      return { ok: false, error: `Quotation Q-${quotation.number} is already ${quotation.status.toLowerCase()}.` };
    }

    const total = billTotal(lines);
    const receivedPaisa = d.payments.reduce((s, p) => s + rupeesToPaisa(p.amountRs), 0);
    if (receivedPaisa > total) {
      return { ok: false, error: "Payments are more than the bill total." };
    }
    const udhaarPaisa = total - receivedPaisa;

    // --- Improvement 7: credit limit warning ---------------------------------
    if (!d.confirmOverLimit && udhaarPaisa > 0 && customer.creditLimitPaisa > 0 && !customer.isCashCustomer) {
      const current = await getCustomerBalance(customer.id);
      const projected = current + udhaarPaisa;
      if (projected > customer.creditLimitPaisa) {
        return {
          ok: false,
          creditWarning: `${customer.name} would owe ${formatPKR(projected)}, over their ${formatPKR(
            customer.creditLimitPaisa
          )} credit limit.`,
        };
      }
    }

    const primaryMethod =
      udhaarPaisa > 0 && receivedPaisa === 0
        ? "UDHAAR"
        : d.payments[0]?.method ?? (udhaarPaisa > 0 ? "UDHAAR" : "CASH");

    // The bill's date also dates the cash it takes, so a backdated bill lands
    // whole on that day instead of being split across two.
    const billDate = dateFromInput(d.date);

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          customerId: d.customerId,
          method: primaryMethod,
          notes: d.notes || null,
          createdById: user.id,
          ...(billDate ? { date: billDate } : {}),
          items: { create: itemRows(lines) },
        },
      });

      await writeSaleStock(tx, invoice.id, lines);
      if (!customer.isCashCustomer) await writeLastPrices(tx, d.customerId, lines);

      // Record each payment taken at billing time (split supported).
      await writeInvoicePayments(
        tx,
        {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          customerName: customer.name,
          note: `Invoice #${invoice.number}`,
          date: billDate,
        },
        toPaymentInputs(d.payments)
      );

      // Close the quotation in the same transaction, so a bill can never exist
      // without its quotation being marked accepted (or the other way round).
      if (quotation) {
        const closed = await tx.quotation.updateMany({
          where: { id: quotation.id, status: "OPEN" },
          data: { status: "ACCEPTED", invoiceId: invoice.id, closedAt: new Date() },
        });
        if (closed.count !== 1) throw new Error(`Quotation Q-${quotation.number} was already closed.`);
      }

      return { id: invoice.id, number: invoice.number };
    }, TX_OPTIONS);

    await audit(
      { id: user.id, username: user.username },
      "INVOICE_CREATE",
      "Invoice",
      result.id,
      `Bill #${result.number} for ${customer.name} — ${formatPKR(total)}${
        udhaarPaisa > 0 ? ` (${formatPKR(udhaarPaisa)} on udhaar)` : ""
      }${quotation ? ` — from quotation Q-${quotation.number}` : ""}`
    );

    revalidatePath("/billing");
    if (quotation) revalidatePath("/quotations");
    revalidatePath("/products");
    revalidatePath("/customers");
    revalidatePath("/");
    return { ok: true, invoiceId: result.id, number: result.number };
}, (error) => ({ ok: false as const, error }));
}

// --- Edit a bill (client request) -----------------------------------------
// Rewrites an ACTIVE bill in place, keeping its number: reverses the old stock
// and money, then applies the new lines and payments.
const editInvoiceSchema = invoiceSchema.extend({ invoiceId: z.string().min(1) });

export async function editInvoice(input: unknown): Promise<InvoiceResult> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const parsed = editInvoiceSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const d = parsed.data;

    const old = await prisma.invoice.findUnique({
      where: { id: d.invoiceId },
      include: { items: true, payments: true },
    });
    if (!old) return { ok: false, error: "Bill not found" };
    if (old.status === "VOIDED") return { ok: false, error: "A voided bill cannot be edited" };
    const blocked = await editBlocker(prisma, old.id);
    if (blocked) return { ok: false, error: blocked };

    const built = await buildLines(d.items);
    if ("error" in built) return { ok: false, error: built.error };
    const { lines } = built;

    // Stock check: the old bill's quantities are about to return, so credit them back.
    if (!d.confirmShortStock) {
      const returning = new Map<string, number>();
      for (const it of old.items) {
        if (!it.productId) continue;
        const k = stockKey(it.productId, it.colorId);
        returning.set(k, (returning.get(k) ?? 0) + it.qtyMilli);
      }
      const shortStock = await findShortStock(lines, returning);
      if (shortStock.length > 0) return { ok: false, shortStock };
    }

    if (!d.confirmBelowCost) {
      const below = belowCostNames(lines);
      if (below.length > 0) return { ok: false, belowCost: below };
    }

    const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
    if (!customer) return { ok: false, error: "Customer not found." };

    const newTotal = billTotal(lines);
    const receivedPaisa = d.payments.reduce((s, p) => s + rupeesToPaisa(p.amountRs), 0);
    if (receivedPaisa > newTotal) return { ok: false, error: "Payments are more than the bill total." };
    const udhaarPaisa = newTotal - receivedPaisa;

    // Credit limit: swap the old bill's outstanding for the new one.
    if (!d.confirmOverLimit && udhaarPaisa > 0 && customer.creditLimitPaisa > 0 && !customer.isCashCustomer) {
      const oldTotal = billTotal(old.items);
      const oldPaid = old.payments.reduce((s, p) => s + p.amountPaisa, 0);
      const current = await getCustomerBalance(customer.id);
      const projected = current - (oldTotal - oldPaid) + udhaarPaisa;
      if (projected > customer.creditLimitPaisa) {
        return {
          ok: false,
          creditWarning: `${customer.name} would owe ${formatPKR(projected)}, over their ${formatPKR(
            customer.creditLimitPaisa
          )} credit limit.`,
        };
      }
    }

    const primaryMethod =
      udhaarPaisa > 0 && receivedPaisa === 0 ? "UDHAAR" : d.payments[0]?.method ?? (udhaarPaisa > 0 ? "UDHAAR" : "CASH");

    // Editing may move the bill to a different day. `newDate` dates the new
    // rows; the reversal below is dated to the OLD bill's day so each day's cash
    // book nets to zero instead of the reversal landing in a different month.
    const newDate = dateFromInput(d.date) ?? old.date;

    await prisma.$transaction(async (tx) => {
      // 1) reverse old money — the cheque this bill created never really existed,
      //    so it is removed rather than bounced.
      await reverseInvoiceMoney(tx, old.payments, {
        note: `Bill #${old.number} edited`,
        chequeAction: "delete",
        date: old.date,
      });

      // 2) clear old lines/payments/stock
      await tx.stockMovement.deleteMany({ where: { invoiceId: old.id } });
      await tx.invoicePayment.deleteMany({ where: { invoiceId: old.id } });
      await tx.invoiceItem.deleteMany({ where: { invoiceId: old.id } });

      // 3) apply the new bill (same number)
      await tx.invoice.update({
        where: { id: old.id },
        data: {
          customerId: d.customerId,
          method: primaryMethod,
          notes: d.notes || null,
          date: newDate,
          items: { create: itemRows(lines) },
        },
      });

      await writeSaleStock(tx, old.id, lines);
      if (!customer.isCashCustomer) await writeLastPrices(tx, d.customerId, lines);

      await writeInvoicePayments(
        tx,
        {
          invoiceId: old.id,
          invoiceNumber: old.number,
          customerName: customer.name,
          note: `Invoice #${old.number} (edited)`,
          date: newDate,
        },
        toPaymentInputs(d.payments)
      );
    }, TX_OPTIONS);

    await audit(
      { id: user.id, username: user.username },
      "INVOICE_EDIT",
      "Invoice",
      old.id,
      `Edited bill #${old.number} (${customer.name}) — now ${formatPKR(newTotal)}`
    );

    revalidatePath("/billing");
    revalidatePath("/products");
    revalidatePath("/customers");
    return { ok: true, invoiceId: old.id, number: old.number };
}, (error) => ({ ok: false as const, error }));
}

// --- Improvement 2: void a bill -------------------------------------------
const voidSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().min(1, "Give a reason"),
});

export async function voidInvoice(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  return safeAction(async () => {
    const user = await requireOwnerApi(); // only the owner may cancel a bill
    const parsed = voidSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const { invoiceId, reason } = parsed.data;

    // Stock back, money reversed (dated to the bill's day), cheques handled, the
    // source quotation re-opened — or refused, writing nothing (see voidInvoiceTx).
    const result = await prisma.$transaction(
      (tx) => voidInvoiceTx(tx, invoiceId, { userId: user.id, reason }),
      TX_OPTIONS
    );
    if (!result.ok) return { ok: false, error: result.error };

    await audit(
      { id: user.id, username: user.username },
      "INVOICE_VOID",
      "Invoice",
      invoiceId,
      `Voided bill #${result.number} (${result.customerName}) — ${reason}`
    );

    revalidatePath("/billing");
    revalidatePath("/products");
    revalidatePath("/customers");
    revalidatePath("/quotations");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}
