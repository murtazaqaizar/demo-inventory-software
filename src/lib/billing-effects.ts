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
      // (editInvoice refuses bills whose cheque already cleared or bounced — see
      // editBlocker — so every cheque here is still PENDING.)
      await tx.invoicePayment.updateMany({
        where: { id: { in: payments.filter((p) => p.chequeId).map((p) => p.id) } },
        data: { chequeId: null },
      });
      await tx.cheque.deleteMany({ where: { id: { in: chequeIds } } });
    } else {
      // A PENDING cheque is handed back and never presented: mark it BOUNCED so
      // the register shows it failed. A CLEARED cheque is different — the money
      // really reached us, so it stays CLEARED and is refunded below.
      await tx.cheque.updateMany({
        where: { id: { in: chequeIds }, status: "PENDING" },
        data: { status: "BOUNCED", clearedAt: null },
      });
      await refundClearedCheques(tx, chequeIds, opts.note);
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

// Money from a cleared cheque on a voided bill has to go back out of the account
// it was cashed or deposited into, today — that is when the refund happens.
//
// The cheque row has no account of its own; setChequeStatus writes the
// destination into the CHEQUE_CLEAR movement's note ("Cheque 123 (RECEIVED) →
// cash"), so that is where it is read back from. Falls back to the bank.
export async function refundClearedCheques(tx: Tx, chequeIds: string[], note: string) {
  const cleared = await tx.cheque.findMany({ where: { id: { in: chequeIds }, status: "CLEARED" } });
  if (cleared.length === 0) return;
  const [accounts, clears] = await Promise.all([
    getMoneyAccountIds(tx),
    tx.moneyMovement.findMany({
      where: {
        type: "CHEQUE_CLEAR",
        OR: cleared.map((c) => ({ amountPaisa: c.amountPaisa, note: { startsWith: `Cheque ${c.number} (RECEIVED)` } })),
      },
      select: { accountId: true, amountPaisa: true, note: true },
    }),
  ]);
  const data = cleared
    .map((c) => {
      const clear = clears.find((m) => m.amountPaisa === c.amountPaisa && m.note?.startsWith(`Cheque ${c.number} (RECEIVED)`));
      return { accountId: clear?.accountId ?? accounts.get("BANK"), amountPaisa: c.amountPaisa, number: c.number };
    })
    .filter((m): m is { accountId: string; amountPaisa: number; number: string } => Boolean(m.accountId))
    .map((m) => ({
      accountId: m.accountId,
      type: "VOID_REVERSAL" as const,
      amountPaisa: -m.amountPaisa,
      note: `${note} — refund of cleared cheque ${m.number}`,
    }));
  if (data.length > 0) await tx.moneyMovement.createMany({ data });
}

// Why a bill cannot be voided, or null when it can.
//
// A bill with a return against it: the return already put some goods back and
// credited (or refunded) the customer. Voiding would restock the WHOLE bill and
// drop the whole charge, so those goods and that credit would count twice.
export async function voidBlocker(tx: Tx, invoiceId: string): Promise<string | null> {
  const returns = await tx.creditNote.findMany({ where: { invoiceId }, select: { number: true }, orderBy: { number: "asc" } });
  if (returns.length === 0) return null;
  const list = returns.map((r) => `#${r.number}`).join(", ");
  return `This bill has return ${list} against it. Voiding it would put those goods back into stock and credit the customer twice. Edit the bill instead, or record a return for the rest of the goods.`;
}

// Why a bill cannot be edited, or null when it can.
//
// Editing removes and re-creates the bill's payments. A cheque that already
// cleared is money in the bank, and one that bounced is history the register
// must keep — re-creating either would leave a fresh PENDING cheque for money
// that has already been settled one way or the other.
export async function editBlocker(tx: Tx, invoiceId: string): Promise<string | null> {
  const settled = await tx.invoicePayment.findMany({
    where: { invoiceId, cheque: { status: { in: ["CLEARED", "BOUNCED"] } } },
    select: { cheque: { select: { number: true, status: true } } },
  });
  if (settled.length === 0) return null;
  const c = settled[0].cheque!;
  return `Cheque ${c.number} on this bill has already ${c.status === "CLEARED" ? "cleared" : "bounced"}, so its payments can no longer be changed. Void the bill and make a new one, or record a return.`;
}

// Void a bill: stock back, money taken at billing reversed, status VOIDED, and the
// quotation it came from (if any) re-opened so it can be billed again.
//
// The reversal of cash/online money is dated to the BILL's day — a voided bill
// is a wrong entry, so that day's cash book should net to zero rather than leave
// it high and today's short.
export async function voidInvoiceTx(
  tx: Tx,
  invoiceId: string,
  by: { userId: string | null; reason: string }
): Promise<{ ok: true; number: number; customerName: string } | { ok: false; error: string }> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, payments: true, customer: true, quotation: { select: { id: true } } },
  });
  if (!invoice) return { ok: false, error: "Bill not found" };
  if (invoice.status === "VOIDED") return { ok: false, error: "Already voided" };
  const blocked = await voidBlocker(tx, invoiceId);
  if (blocked) return { ok: false, error: blocked };

  // Put the stock back with reversing movements (history stays traceable).
  await writeVoidRestock(tx, invoice.id, invoice.number, invoice.items);
  await reverseInvoiceMoney(tx, invoice.payments, {
    note: `Bill #${invoice.number} voided`,
    chequeAction: "bounce",
    date: invoice.date,
  });
  await tx.invoice.update({
    where: { id: invoiceId },
    data: { status: "VOIDED", voidedAt: new Date(), voidedById: by.userId, voidReason: by.reason },
  });
  if (invoice.quotation) {
    await tx.quotation.update({
      where: { id: invoice.quotation.id },
      data: { status: "OPEN", invoiceId: null, closedAt: null },
    });
  }
  return { ok: true, number: invoice.number, customerName: invoice.customer.name };
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
