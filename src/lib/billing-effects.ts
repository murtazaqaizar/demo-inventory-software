// What a bill writes beyond its own row: stock movements, last-price memory,
// cheques, money movements and payment rows. Creating, editing and voiding a
// bill all touch the same things, so they live here once.
//
// Every helper writes a FIXED number of statements — never one per line or per
// payment. Each statement is a network round-trip to hosted Postgres, and a
// per-row loop is what pushed the purchase transaction past Prisma's 5s
// interactive-transaction limit (P2028, see guide/DEBUG_LOG.md). A ten-line
// bill must cost the same as a two-line one.

import type { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

// A stock line has a productId. A CUSTOM line (goods bought from outside for this
// customer) has productId null and a description; it never touches stock or the
// last-price memory, and its unitCostPaisa is whatever cost the user typed (0 = none).
export type SaleLine = {
  productId: string | null;
  description: string | null;
  unit: string; // the unit's short label ("m"), snapshotted for printing
  qtyMilli: number; // thousandths of the unit
  colorId: string | null; // color variant sold, when the product has colors
  ratePaisa: number; // per one unit
  unitCostPaisa: number; // per one unit
  isSample: boolean;
};

type StockLine = SaleLine & { productId: string };
const stockLines = (lines: SaleLine[]) => lines.filter((l): l is StockLine => l.productId !== null);

export type PaymentInput = {
  method: PaymentMethod;
  amountPaisa: number;
  chequeNumber?: string;
  chequeBank?: string;
  chequeDate?: string;
};

export type ExistingPayment = {
  id: string;
  method: PaymentMethod;
  amountPaisa: number;
  chequeId: string | null;
};

// Both money accounts in one query. This used to be looked up inside the
// payment loop, so a three-payment bill read the same row three times.
export async function getMoneyAccountIds(tx: Tx): Promise<Map<string, string>> {
  const accounts = await tx.moneyAccount.findMany({ where: { kind: { in: ["CASH", "BANK"] } } });
  const map = new Map<string, string>();
  for (const a of accounts) if (!map.has(a.kind)) map.set(a.kind, a.id);
  return map;
}

const accountKindFor = (method: PaymentMethod) => (method === "CASH" ? "CASH" : "BANK");

// Stock going out for a bill: sales and free samples both leave the shelf, and
// both carry their cost so profit stays honest (features 4 and 18).
// A movement carries no date of its own: stock is the running sum of every
// delta, and the cost side of a sale is read from the invoice line, dated by the
// bill. So a backdated bill needs nothing here — `createdAt` stays honest about
// when the row was written.
export async function writeSaleStock(tx: Tx, invoiceId: string, lines: SaleLine[]) {
  const stocked = stockLines(lines);
  if (stocked.length === 0) return;
  await tx.stockMovement.createMany({
    data: stocked.map((l) => ({
      productId: l.productId,
      type: l.isSample ? ("SAMPLE_OUT" as const) : ("SALE_OUT" as const),
      qtyMilli: -l.qtyMilli,
      colorId: l.colorId,
      unitCostPaisa: l.unitCostPaisa,
      reason: l.isSample ? "Free sample / bonus" : "Sale",
      invoiceId,
    })),
  });
}

// Last-price memory (feature 14). An upsert per line becomes a delete of the
// rows we're about to replace plus one insert. Samples are excluded — a free
// line must not become the customer's remembered price — and so is the walk-in
// cash customer, who has no price history.
export async function writeLastPrices(tx: Tx, customerId: string, lines: SaleLine[]) {
  const priced = stockLines(lines).filter((l) => !l.isSample);
  if (priced.length === 0) return;

  // A product can appear on more than one line; the last one entered wins.
  const byProduct = new Map<string, StockLine>();
  for (const l of priced) byProduct.set(l.productId, l);
  const productIds = [...byProduct.keys()];

  await tx.customerProductPrice.deleteMany({
    where: { customerId, productId: { in: productIds } },
  });
  await tx.customerProductPrice.createMany({
    data: [...byProduct.values()].map((l) => ({
      customerId,
      productId: l.productId,
      lastRatePaisa: l.ratePaisa,
    })),
  });
}

// Money taken at billing time. Cheques land in the register as PENDING and only
// hit the bank when they clear; cash and online move an account straight away.
//
// `ctx.date` is the bill's date: money received on a backdated bill belongs in
// the cash book on that day, not on the day the bill was typed in. The cheque's
// own `chequeDate` stays separate — that is the date written on the cheque.
export async function writeInvoicePayments(
  tx: Tx,
  ctx: { invoiceId: string; invoiceNumber: number; customerName: string; note: string; date?: Date },
  payments: PaymentInput[]
) {
  if (payments.length === 0) return;

  const cheques = payments.filter((p) => p.method === "CHEQUE");
  const direct = payments.filter((p) => p.method !== "CHEQUE");

  // Cheques first, in one insert, so their ids can be attached to the payments.
  // createManyAndReturn preserves input order.
  const createdCheques = cheques.length
    ? await tx.cheque.createManyAndReturn({
        data: cheques.map((p) => ({
          number: p.chequeNumber || "(no number)",
          bank: p.chequeBank || "(bank)",
          amountPaisa: p.amountPaisa,
          chequeDate: p.chequeDate ? new Date(p.chequeDate) : ctx.date ?? new Date(),
          direction: "RECEIVED" as const,
          status: "PENDING" as const,
          partyName: ctx.customerName,
        })),
        select: { id: true },
      })
    : [];

  if (direct.length > 0) {
    const accounts = await getMoneyAccountIds(tx);
    const movements = direct
      .map((p) => ({ accountId: accounts.get(accountKindFor(p.method)), amountPaisa: p.amountPaisa }))
      .filter((m): m is { accountId: string; amountPaisa: number } => Boolean(m.accountId))
      .map((m) => ({
        accountId: m.accountId,
        type: "SALE_RECEIPT" as const,
        amountPaisa: m.amountPaisa,
        note: ctx.note,
        ...(ctx.date ? { date: ctx.date } : {}),
      }));
    if (movements.length > 0) await tx.moneyMovement.createMany({ data: movements });
  }

  let chequeIdx = 0;
  await tx.invoicePayment.createMany({
    data: payments.map((p) => ({
      invoiceId: ctx.invoiceId,
      method: p.method,
      amountPaisa: p.amountPaisa,
      chequeId: p.method === "CHEQUE" ? (createdCheques[chequeIdx++]?.id ?? null) : null,
    })),
  });
}

// Undo money a bill already took, for an edit or a void.
//
// `chequeAction` is the difference between the two: editing a bill removes the
// cheque it created outright (it was never real), while voiding marks it
// BOUNCED so the register still shows the cheque existed and failed.
//
// `opts.date` should be the date the money being undone was originally taken —
// the bill's own date. Reversing a backdated bill's cash today would leave that
// day's cash book short and today's long, even though nothing really moved.
export async function reverseInvoiceMoney(
  tx: Tx,
  payments: ExistingPayment[],
  opts: { note: string; chequeAction: "delete" | "bounce"; date?: Date }
) {
  if (payments.length === 0) return;

  const chequeIds = payments
    .filter((p) => p.method === "CHEQUE" && p.chequeId)
    .map((p) => p.chequeId as string);

  if (chequeIds.length > 0) {
    if (opts.chequeAction === "delete") {
      // Drop the link first — the payment rows may outlive this call.
      await tx.invoicePayment.updateMany({
        where: { id: { in: payments.filter((p) => p.chequeId).map((p) => p.id) } },
        data: { chequeId: null },
      });
      await tx.cheque.deleteMany({ where: { id: { in: chequeIds } } });
    } else {
      await tx.cheque.updateMany({
        where: { id: { in: chequeIds } },
        data: { status: "BOUNCED", clearedAt: null },
      });
    }
  }

  // One reversing row per original payment, so the cash book still reconciles
  // line by line against what was taken.
  const direct = payments.filter((p) => p.method !== "CHEQUE");
  if (direct.length === 0) return;

  const accounts = await getMoneyAccountIds(tx);
  const movements = direct
    .map((p) => ({ accountId: accounts.get(accountKindFor(p.method)), amountPaisa: p.amountPaisa }))
    .filter((m): m is { accountId: string; amountPaisa: number } => Boolean(m.accountId))
    .map((m) => ({
      accountId: m.accountId,
      type: "VOID_REVERSAL" as const,
      amountPaisa: -m.amountPaisa,
      note: opts.note,
      ...(opts.date ? { date: opts.date } : {}),
    }));
  if (movements.length > 0) await tx.moneyMovement.createMany({ data: movements });
}

// Stock coming back in when a bill is voided — reversing rows rather than
// deletions, so the history stays traceable.
export async function writeVoidRestock(
  tx: Tx,
  invoiceId: string,
  invoiceNumber: number,
  items: { productId: string | null; colorId: string | null; qtyMilli: number; unitCostPaisa: number }[]
) {
  // Custom lines were never in stock, so nothing comes back for them.
  const stocked = items.filter((it): it is typeof it & { productId: string } => it.productId !== null);
  if (stocked.length === 0) return;
  await tx.stockMovement.createMany({
    data: stocked.map((it) => ({
      productId: it.productId,
      type: "ADJUST" as const,
      qtyMilli: it.qtyMilli, // positive = back into stock
      colorId: it.colorId,
      unitCostPaisa: it.unitCostPaisa,
      reason: `Bill #${invoiceNumber} voided`,
      invoiceId,
    })),
  });
}
