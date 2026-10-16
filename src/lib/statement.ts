// A customer's statement (ledger): the running list of bills, payments and
// returns, the per-bill table, and the header totals. Built here rather than in
// the page so scripts/verify-ledger.mts checks the code that actually ships.

import { prisma } from "@/lib/prisma";
import { getLaterPaidByInvoice, isBounced, sumLines, sumPaid, PAYMENTS_WITH_CHEQUE } from "@/lib/receivables";
import { dayEnd, dayStart } from "@/lib/dates";

export type StatementRow = {
  date: Date;
  kind: string; // "Bill #12", "Payment (CASH)", "Return #3"
  note: string | null; // why a row carries no money: voided, cheque bounced
  debit: number;
  credit: number;
  balance: number;
  voided: boolean;
  billId: string | null;
  paymentId: string | null;
};

// `showVoided`: the user's choice on the statement page. Off (the default) keeps
// the statement to real charges, the way a customer expects to read it; on lists
// voided bills as zero lines, so a payment made for a bill that was later voided
// can be traced. Totals are the same either way.
export async function buildStatement(
  customerId: string,
  range: { from?: string; to?: string; showVoided?: boolean } = {}
) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return null;

  const [invoices, voided, payments, creditNotes] = await Promise.all([
    // Every active bill is a charge; money taken at billing time shows as a credit.
    prisma.invoice.findMany({
      where: { customerId, status: "ACTIVE" },
      include: { items: true, payments: PAYMENTS_WITH_CHEQUE },
      orderBy: { date: "asc" },
    }),
    // Voided bills: always counted (for the "N hidden" note), listed only when asked.
    prisma.invoice.findMany({
      where: { customerId, status: "VOIDED" },
      select: { id: true, number: true, date: true, voidReason: true },
      orderBy: { date: "asc" },
    }),
    prisma.payment.findMany({ where: { customerId }, include: { cheque: { select: { status: true, number: true } } }, orderBy: { date: "asc" } }),
    prisma.creditNote.findMany({
      where: { customerId, refundMethod: "CREDIT_TO_ACCOUNT" },
      include: { items: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const bounceNote = (ps: { amountPaisa: number; cheque?: { status: string; number: string } | null }[]) => {
    const b = ps.filter(isBounced);
    return b.length ? `Cheque ${b.map((p) => p.cheque!.number).join(", ")} bounced — not paid` : null;
  };

  const allRows: Omit<StatementRow, "balance">[] = [
    ...invoices.map((inv) => ({
      date: inv.date,
      kind: `Bill #${inv.number}`,
      note: bounceNote(inv.payments),
      debit: sumLines(inv.items),
      credit: sumPaid(inv.payments),
      voided: false,
      billId: inv.id,
      paymentId: null,
    })),
    ...(range.showVoided ? voided : []).map((inv) => ({
      date: inv.date,
      kind: `Bill #${inv.number}`,
      note: `VOIDED${inv.voidReason ? ` — ${inv.voidReason}` : ""}`,
      debit: 0,
      credit: 0,
      voided: true,
      billId: inv.id,
      paymentId: null,
    })),
    ...payments.map((p) => ({
      date: p.date,
      kind: `Payment (${p.method})`,
      note: bounceNote([p]) ?? p.note ?? null,
      debit: 0,
      credit: isBounced(p) ? 0 : p.amountPaisa,
      voided: false,
      billId: null,
      paymentId: p.id,
    })),
    ...creditNotes.map((cn) => ({
      date: cn.date,
      kind: `Return #${cn.number}`,
      note: null,
      debit: 0,
      credit: sumLines(cn.items),
      voided: false,
      billId: null,
      paymentId: null,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // The filter's days are the shop's local days (see lib/timezone).
  const fromDate = range.from ? dayStart(range.from) : null;
  const toDate = range.to ? dayEnd(range.to) : null;

  // Opening balance for the chosen period = starting balance + everything before `from`.
  let opening = customer.openingBalancePaisa;
  const inPeriod: typeof allRows = [];
  for (const r of allRows) {
    if (fromDate && r.date < fromDate) {
      opening += r.debit - r.credit;
      continue;
    }
    if (toDate && r.date > toDate) continue;
    inPeriod.push(r);
  }
  let running = opening;
  const rows: StatementRow[] = inPeriod.map((r) => {
    running += r.debit - r.credit;
    return { ...r, balance: running };
  });

  // Per-bill breakdown (client request): every bill with what's paid and what's still owing.
  // "Paid" includes account payments, applied oldest bill first.
  const laterPaid = await getLaterPaidByInvoice([customer.id]);
  const bills = invoices
    .map((inv) => {
      const total = sumLines(inv.items);
      const atBilling = sumPaid(inv.payments);
      const paid = atBilling + (laterPaid.get(inv.id) ?? 0);
      return { id: inv.id, number: inv.number, date: inv.date, total, atBilling, paid, owing: total - paid };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalBilled = bills.reduce((s, b) => s + b.total, 0);
  const paidAtBilling = bills.reduce((s, b) => s + b.atBilling, 0);
  const lumpTotal = sumPaid(payments);
  const returnsTotal = creditNotes.reduce((s, cn) => s + sumLines(cn.items), 0);
  const totalReceived = paidAtBilling + lumpTotal;
  const outstanding = customer.openingBalancePaisa + totalBilled - totalReceived - returnsTotal;

  return {
    customer,
    opening,
    rows,
    closing: running,
    bills,
    fromDate,
    toDate,
    voidedCount: voided.length,
    totals: { totalBilled, paidAtBilling, lumpTotal, returnsTotal, totalReceived, outstanding },
  };
}
