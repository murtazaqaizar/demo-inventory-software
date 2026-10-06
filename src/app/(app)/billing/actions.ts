"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { TX_OPTIONS } from "@/lib/tx";
import { requireUserApi, requireOwnerApi } from "@/lib/guards";
import { rupeesToPaisa, formatPKR } from "@/lib/money";
import { dateFromInput } from "@/lib/dates";
import { getStockMap } from "@/lib/stock";
import { PRODUCT_UNIT, unitsById } from "@/lib/products";
import { PIECE, lineAmount, qtyError, toMilli, unitOf } from "@/lib/qty";
import { getCustomerBalance } from "@/lib/receivables";
import { audit } from "@/lib/audit";
import {
  reverseInvoiceMoney,
  writeInvoicePayments,
  writeLastPrices,
  writeSaleStock,
  writeVoidRestock,
  type PaymentInput,
  type SaleLine,
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
export type ShortStock = { name: string; unit: string; available: number; requested: number };

// A line is either a stock line (productId set) or a CUSTOM line: free text for
// goods bought from outside for this customer (productId blank, description set).
// qty is in the line's unit and may have decimals when that unit allows them.
const itemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().trim().max(120).optional(),
  unitId: z.string().optional(), // custom lines only (a Unit id); stock lines use the product's
  qty: z.coerce.number().positive("Quantity must be more than zero"),
  rateRs: z.coerce.number().min(0).default(0),
  costRs: z.coerce.number().min(0).optional(), // custom lines only: what it cost you
  isSample: z.boolean().default(false),
});

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

type BuiltLine = SaleLine & { name: string };

// Resolve form lines into stored lines: unit from the product's category (or the
// custom line's own pick), quantity checked against that unit, cost captured.
async function buildLines(
  items: z.infer<typeof itemSchema>[]
): Promise<{ lines: BuiltLine[] } | { error: string }> {
  const ids = items.map((i) => i.productId).filter((id): id is string => Boolean(id));
  const [products, customUnits] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: ids } }, include: PRODUCT_UNIT }),
    unitsById(items.map((i) => i.unitId).filter((id): id is string => Boolean(id))),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines: BuiltLine[] = [];
  for (const it of items) {
    const qtyMilli = toMilli(it.qty);
    const ratePaisa = it.isSample ? 0 : rupeesToPaisa(it.rateRs);
    if (it.productId) {
      const product = byId.get(it.productId);
      if (!product) return { error: "Unknown product on a line." };
      const unit = unitOf(product);
      const e = qtyError(qtyMilli, unit);
      if (e) return { error: `${product.name}: ${e}` };
      lines.push({
        productId: product.id,
        description: null,
        unit: unit.short,
        qtyMilli,
        ratePaisa,
        unitCostPaisa: product.latestCostPaisa,
        isSample: it.isSample,
        name: product.name,
      });
    } else {
      if (!it.description) return { error: "A custom item needs a name." };
      const unit = (it.unitId && customUnits.get(it.unitId)) || PIECE;
      const e = qtyError(qtyMilli, unit);
      if (e) return { error: `${it.description}: ${e}` };
      lines.push({
        productId: null,
        description: it.description,
        unit: unit.short,
        qtyMilli,
        ratePaisa,
        unitCostPaisa: it.costRs ? rupeesToPaisa(it.costRs) : 0,
        isSample: it.isSample,
        name: it.description,
      });
    }
  }
  return { lines };
}

const billTotal = (lines: { qtyMilli: number; ratePaisa: number; isSample: boolean }[]) =>
  lines.reduce((s, l) => s + (l.isSample ? 0 : lineAmount(l.qtyMilli, l.ratePaisa)), 0);

// Rate below cost (feature 15). Custom lines count only when a cost was typed.
const belowCostNames = (lines: BuiltLine[]) =>
  lines.filter((l) => !l.isSample && l.unitCostPaisa > 0 && l.ratePaisa < l.unitCostPaisa).map((l) => l.name);

// Stock lines asking for more than is on the shelf. `returning` = quantity the old
// version of an edited bill is about to put back.
async function findShortStock(lines: BuiltLine[], returning = new Map<string, number>()): Promise<ShortStock[]> {
  const needed = new Map<string, { name: string; unit: string; total: number }>();
  for (const l of lines) {
    if (!l.productId) continue;
    const prev = needed.get(l.productId);
    needed.set(l.productId, { name: l.name, unit: l.unit, total: (prev?.total ?? 0) + l.qtyMilli });
  }
  const stock = await getStockMap([...needed.keys()]);
  const short: ShortStock[] = [];
  for (const [productId, l] of needed) {
    const available = (stock.get(productId) ?? 0) + (returning.get(productId) ?? 0);
    if (l.total > available) short.push({ name: l.name, unit: l.unit, available, requested: l.total });
  }
  return short;
}

const itemRows = (lines: BuiltLine[]) =>
  lines.map((l) => ({
    productId: l.productId,
    description: l.description,
    unit: l.unit,
    qtyMilli: l.qtyMilli,
    ratePaisa: l.ratePaisa,
    unitCostPaisa: l.unitCostPaisa,
    isSample: l.isSample,
  }));

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

      return { id: invoice.id, number: invoice.number };
    }, TX_OPTIONS);

    await audit(
      { id: user.id, username: user.username },
      "INVOICE_CREATE",
      "Invoice",
      result.id,
      `Bill #${result.number} for ${customer.name} — ${formatPKR(total)}${
        udhaarPaisa > 0 ? ` (${formatPKR(udhaarPaisa)} on udhaar)` : ""
      }`
    );

    revalidatePath("/billing");
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

    const built = await buildLines(d.items);
    if ("error" in built) return { ok: false, error: built.error };
    const { lines } = built;

    // Stock check: the old bill's quantities are about to return, so credit them back.
    if (!d.confirmShortStock) {
      const returning = new Map<string, number>();
      for (const it of old.items) {
        if (it.productId) returning.set(it.productId, (returning.get(it.productId) ?? 0) + it.qtyMilli);
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

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, payments: true, customer: true },
    });
    if (!invoice) return { ok: false, error: "Bill not found" };
    if (invoice.status === "VOIDED") return { ok: false, error: "Already voided" };

    await prisma.$transaction(async (tx) => {
      // Put the stock back with reversing movements (history stays traceable).
      await writeVoidRestock(tx, invoice.id, invoice.number, invoice.items);

      // Reverse money that was actually received. A cheque is marked BOUNCED
      // rather than deleted — the register should still show it existed.
      await reverseInvoiceMoney(tx, invoice.payments, {
        note: `Bill #${invoice.number} voided`,
        chequeAction: "bounce",
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: "VOIDED", voidedAt: new Date(), voidedById: user.id, voidReason: reason },
      });
    }, TX_OPTIONS);

    await audit(
      { id: user.id, username: user.username },
      "INVOICE_VOID",
      "Invoice",
      invoiceId,
      `Voided bill #${invoice.number} (${invoice.customer.name}) — ${reason}`
    );

    revalidatePath("/billing");
    revalidatePath("/products");
    revalidatePath("/customers");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}
