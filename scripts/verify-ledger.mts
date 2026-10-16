/**
 * Verification for the customer LEDGER (statement page, customers/[id]/page.tsx).
 *
 *   npm run verify:ledger
 *
 * The statement is built inline in the page, so `buildStatement` below is a
 * line-for-line copy of it (running ledger + per-bill table + header totals).
 * Keep it in sync with the page. Balances and "paid later" come from the REAL
 * shipped src/lib/receivables.ts via a globalThis.prisma proxy onto the
 * transaction (same technique as verify-void-ledger).
 *
 * Runs with TZ=UTC because that is what Vercel's servers use and nothing in the
 * app sets a time zone — the shop itself is in Pakistan (UTC+5).
 *
 * Section A checks invariants that must always hold (expected to pass).
 * The other sections are the ledger bugs; each check states the correct result.
 *
 * Runs inside ONE interactive transaction that is always rolled back.
 */
process.env.TZ = "UTC";

import "dotenv/config";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(new URL(url!).hostname);
process.env.DATABASE_URL = url;

const base = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  }),
});

type Tx = Prisma.TransactionClient;
let current: Tx | null = null;
(globalThis as unknown as { prisma: unknown }).prisma = new Proxy(base, {
  get: (target, prop) => {
    const src = (current ?? target) as unknown as Record<PropertyKey, unknown>;
    const v = src[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(src) : v;
  },
});

const { writeSaleStock, writeInvoicePayments, reverseInvoiceMoney, writeVoidRestock } = await import(
  "../src/lib/billing-effects.js"
);
const { getCustomerBalance, getLaterPaidByInvoice, sumLines } = await import("../src/lib/receivables.js");

let failures = 0;
const failed: string[] = [];
let section = "";
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  PASS  ${label} = ${a}`);
  else {
    failures++;
    failed.push(`${section}: ${label}`);
    console.error(`  FAIL  ${label}\n        expected ${e}\n        got      ${a}`);
  }
}
function heading(t: string) {
  section = t;
  console.log(`\n${t}`);
}

const TAG = `vledger-${Date.now()}`;
class Rollback extends Error {}
const RS = 100;
const rs = (p: number) => p / RS;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`); // a form-picked day, as dateFromInput stores it

// --- copy of customers/[id]/page.tsx ------------------------------------------

type Row = { date: Date; kind: string; debit: number; credit: number };
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

async function buildStatement(tx: Tx, id: string, from?: string, to?: string) {
  const customer = await tx.customer.findUniqueOrThrow({ where: { id } });
  const [invoices, payments, creditNotes] = await Promise.all([
    tx.invoice.findMany({ where: { customerId: id, status: "ACTIVE" }, include: { items: true, payments: true }, orderBy: { date: "asc" } }),
    tx.payment.findMany({ where: { customerId: id }, orderBy: { date: "asc" } }),
    tx.creditNote.findMany({ where: { customerId: id, refundMethod: "CREDIT_TO_ACCOUNT" }, include: { items: true }, orderBy: { date: "asc" } }),
  ]);
  const allRows: Row[] = [
    ...invoices.map((inv) => ({ date: inv.date, kind: `Bill #${inv.number}`, debit: sumLines(inv.items), credit: inv.payments.reduce((s, p) => s + p.amountPaisa, 0) })),
    ...payments.map((p) => ({ date: p.date, kind: `Payment (${p.method})`, debit: 0, credit: p.amountPaisa })),
    ...creditNotes.map((cn) => ({ date: cn.date, kind: `Return #${cn.number}`, debit: 0, credit: sumLines(cn.items) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? endOfDay(new Date(to)) : null;
  let opening = customer.openingBalancePaisa;
  const inPeriod: Row[] = [];
  for (const r of allRows) {
    if (fromDate && r.date < fromDate) {
      opening += r.debit - r.credit;
      continue;
    }
    if (toDate && r.date > toDate) continue;
    inPeriod.push(r);
  }
  let running = opening;
  const rows = inPeriod.map((r) => {
    running += r.debit - r.credit;
    return { ...r, balance: running, shownDate: r.date.toLocaleDateString("en-PK") };
  });

  const laterPaid = await getLaterPaidByInvoice([customer.id]);
  const bills = invoices
    .map((inv) => {
      const total = sumLines(inv.items);
      const atBilling = inv.payments.reduce((s, p) => s + p.amountPaisa, 0);
      const paid = atBilling + (laterPaid.get(inv.id) ?? 0);
      return { id: inv.id, number: inv.number, date: inv.date, total, atBilling, paid, owing: total - paid };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const totalBilled = bills.reduce((s, b) => s + b.total, 0);
  const paidAtBilling = bills.reduce((s, b) => s + b.atBilling, 0);
  const lumpTotal = payments.reduce((s, p) => s + p.amountPaisa, 0);
  const returnsTotal = creditNotes.reduce((s, cn) => s + sumLines(cn.items), 0);
  const outstanding = customer.openingBalancePaisa + totalBilled - (paidAtBilling + lumpTotal) - returnsTotal;

  return { opening, rows, closing: running, bills, outstanding };
}

// --- mirrors of the server actions (see verify-void-ledger.mts) ----------------

type Pay = { method: "CASH" | "ONLINE" | "CHEQUE"; amountPaisa: number; chequeNumber?: string; chequeBank?: string };

async function makeBill(tx: Tx, customer: { id: string; name: string }, productId: string, rateRs: number, pays: Pay[], date?: Date, qty = 1) {
  const lines = [{ productId, colorId: null, description: null, unit: "pcs", qtyMilli: qty * 1000, ratePaisa: rateRs * RS, unitCostPaisa: 100 * RS, isSample: false }];
  const inv = await tx.invoice.create({ data: { customerId: customer.id, method: pays[0]?.method ?? "UDHAAR", ...(date ? { date } : {}), items: { create: lines } } });
  await writeSaleStock(tx, inv.id, lines);
  await writeInvoicePayments(tx, { invoiceId: inv.id, invoiceNumber: inv.number, customerName: customer.name, note: `Bill #${inv.number}`, date }, pays);
  return inv;
}
async function voidBill(tx: Tx, invoiceId: string) {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { items: true, payments: true } });
  await writeVoidRestock(tx, invoice.id, invoice.number, invoice.items);
  await reverseInvoiceMoney(tx, invoice.payments, { note: `Bill #${invoice.number} voided`, chequeAction: "bounce" });
  await tx.invoice.update({ where: { id: invoiceId }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: "Wrong entry" } });
}
// recordCustomerPayment has no date field (always now); `date` here only places
// the fixture on a known day.
const pay = (tx: Tx, customerId: string, amountRs: number, date?: Date) =>
  tx.payment.create({ data: { customerId, amountPaisa: amountRs * RS, method: "CASH", note: "Payment received", ...(date ? { date } : {}) } });
async function returnToAccount(tx: Tx, customerId: string, invoiceId: string | null, productId: string, rateRs: number, date?: Date) {
  const note = await tx.creditNote.create({
    data: { customerId, invoiceId, refundMethod: "CREDIT_TO_ACCOUNT", ...(date ? { date } : {}), items: { create: [{ productId, unit: "pcs", qtyMilli: 1000, ratePaisa: rateRs * RS, unitCostPaisa: 100 * RS }] } },
  });
  await tx.stockMovement.create({ data: { productId, type: "RETURN_IN", qtyMilli: 1000, unitCostPaisa: 100 * RS, creditNoteId: note.id } });
  return note;
}

try {
  await base.$transaction(
    async (tx) => {
      current = tx;
      for (const kind of ["CASH", "BANK"] as const) {
        if (!(await tx.moneyAccount.findFirst({ where: { kind } }))) await tx.moneyAccount.create({ data: { kind, name: kind } });
      }
      const product = await tx.product.create({ data: { code: `${TAG}-p`, name: `${TAG} fitting` } });
      await tx.stockMovement.create({ data: { productId: product.id, type: "ADJUST", qtyMilli: 100_000, unitCostPaisa: 100 * RS } });
      const newCustomer = (suffix: string, openingRs = 0) =>
        tx.customer.create({ data: { name: `${TAG} ${suffix}`, openingBalancePaisa: openingRs * RS } });
      const balance = async (id: string) => rs(await getCustomerBalance(id));
      const owingSum = (s: Awaited<ReturnType<typeof buildStatement>>) => rs(s.bills.reduce((t, b) => t + b.owing, 0));

      // =====================================================================
      heading("A. Invariants on an ordinary account (should all pass)");
      {
        const c = await newCustomer("ordinary", 5_000);
        await makeBill(tx, c, product.id, 20_000, [{ method: "CASH", amountPaisa: 5_000 * RS }], day("2026-01-05"));
        await pay(tx, c.id, 8_000, new Date("2026-01-10T09:00:00Z"));
        const b1 = await tx.invoice.findFirstOrThrow({ where: { customerId: c.id } });
        await returnToAccount(tx, c.id, b1.id, product.id, 2_000, new Date("2026-01-12T09:00:00Z"));
        await makeBill(tx, c, product.id, 10_000, [], day("2026-01-20"));
        const all = await buildStatement(tx, c.id);
        check("closing balance of the running ledger = customer balance", rs(all.closing), await balance(c.id));
        check("header 'outstanding' = customer balance", rs(all.outstanding), await balance(c.id));
        check("bills table: Σ owing = outstanding (opening was settled first)", owingSum(all), rs(all.outstanding));
        check("ledger rows in date order", all.rows.map((r) => r.kind.split(" #")[0].split(" (")[0]), ["Bill", "Payment", "Return", "Bill"]);
        const mid = await buildStatement(tx, c.id, "2026-01-10", "2026-01-12");
        check("period opening carries everything before 'from'", rs(mid.opening), 5_000 + 20_000 - 5_000);
        check("period shows only the payment and the return", mid.rows.length, 2);
        const atEnd = rs(all.rows.find((r) => r.kind.startsWith("Return"))!.balance);
        check("period closing = full-ledger balance on the 'to' day", rs(mid.closing), atEnd);
        const later = await buildStatement(tx, c.id, "2027-01-01");
        check("a period after all activity opens at the full balance, no rows", [rs(later.opening), later.rows.length], [await balance(c.id), 0]);
        const sameDay = await newCustomer("same-day");
        await makeBill(tx, sameDay, product.id, 7_000, [], day("2026-02-01"));
        await pay(tx, sameDay.id, 7_000, new Date("2026-02-01T10:00:00Z"));
        const sd = await buildStatement(tx, sameDay.id);
        check("same-day bill (back-dated) comes before its payment; never a negative step", sd.rows.map((r) => rs(r.balance)), [7_000, 0]);
      }

      // =====================================================================
      heading("B. Voided bill — the ledger has no trace of it");
      {
        const c = await newCustomer("voided");
        const a = await makeBill(tx, c, product.id, 50_000, [{ method: "CASH", amountPaisa: 30_000 * RS }], day("2026-03-01"));
        await pay(tx, c.id, 20_000, new Date("2026-03-02T09:00:00Z"));
        await voidBill(tx, a.id);
        const s = await buildStatement(tx, c.id);
        check("voided bill is still listed in the ledger (zero-effect line)", s.rows.some((r) => r.kind.includes(`#${a.number}`)), true);
        check("the 20,000 paid against it shows as an advance in the header", rs(s.outstanding), -20_000);
        check("every payment row has a bill it can be traced to (no orphan credit)", s.rows.filter((r) => r.kind.startsWith("Bill")).length >= 1, true);
        await makeBill(tx, c, product.id, 50_000, [{ method: "CASH", amountPaisa: 30_000 * RS }], day("2026-03-05"));
        const s2 = await buildStatement(tx, c.id);
        const b2 = s2.bills[0];
        check("the new bill's 'paid later' can be traced on the ledger: a payment AFTER the bill exists",
          s2.rows.some((r) => r.kind.startsWith("Payment") && r.date >= b2.date) || rs(b2.paid - b2.atBilling) === 0, true);
      }

      // =====================================================================
      heading("C. Customer with an advance (negative opening)");
      {
        const c = await newCustomer("advance", -10_000);
        await makeBill(tx, c, product.id, 10_000, [], day("2026-04-01"));
        const s = await buildStatement(tx, c.id);
        check("header outstanding is 0", rs(s.outstanding), 0);
        check("bills table agrees with the header (Σ owing = outstanding)", owingSum(s), rs(s.outstanding));
      }

      // =====================================================================
      heading("D. Bounced cheque on a bill");
      {
        const c = await newCustomer("bounced");
        const b = await makeBill(tx, c, product.id, 40_000, [{ method: "CHEQUE", amountPaisa: 40_000 * RS, chequeNumber: "444", chequeBank: "ABL" }], day("2026-05-01"));
        const ip = await tx.invoicePayment.findFirstOrThrow({ where: { invoiceId: b.id } });
        await tx.cheque.update({ where: { id: ip.chequeId! }, data: { status: "BOUNCED" } }); // setChequeStatus
        const s = await buildStatement(tx, c.id);
        check("ledger closing shows the 40,000 owed again", rs(s.closing), 40_000);
        check("the bill is shown as owing, not paid", rs(s.bills[0].owing), 40_000);
      }

      // =====================================================================
      heading("E. Return against a voided bill");
      {
        const c = await newCustomer("return-on-voided");
        const b = await makeBill(tx, c, product.id, 10_000, [], day("2026-06-01"));
        await voidBill(tx, b.id);
        await returnToAccount(tx, c.id, b.id, product.id, 10_000, new Date("2026-06-02T09:00:00Z"));
        const s = await buildStatement(tx, c.id);
        check("ledger does not credit a return on a voided bill", rs(s.closing), 0);
      }

      // =====================================================================
      heading("F. Voiding after a return: ledger keeps the return's credit");
      {
        const c = await newCustomer("void-after-return");
        const b = await makeBill(tx, c, product.id, 25_000, [], day("2026-07-01"), 2);
        await returnToAccount(tx, c.id, b.id, product.id, 25_000, new Date("2026-07-02T09:00:00Z"));
        await voidBill(tx, b.id);
        const s = await buildStatement(tx, c.id);
        check("after the void the ledger closes at 0, not −25,000", rs(s.closing), 0);
      }

      // =====================================================================
      heading("G. Late-night bill in Pakistan (server runs in UTC)");
      {
        const c = await newCustomer("late-night");
        // Made "today" at 01:30 PKT on 16 Oct = 15 Oct 20:30 UTC (dateFromInput keeps clock time for today).
        await makeBill(tx, c, product.id, 5_000, [], new Date("2026-10-15T20:30:00.000Z"));
        const s = await buildStatement(tx, c.id, "2026-10-16", "2026-10-16");
        check("statement filtered to 16 Oct includes the bill made on 16 Oct (PKT)", s.rows.length, 1);
        const all = await buildStatement(tx, c.id);
        check("ledger prints the Pakistani date, 16/10/2026", all.rows[0].shownDate, "16/10/2026");
      }

      current = null;
      throw new Rollback();
    },
    { timeout: 180_000, maxWait: 20_000 }
  );
} catch (e) {
  if (!(e instanceof Rollback)) {
    console.error("\nERROR", e);
    process.exit(2);
  }
} finally {
  current = null;
}

const left = await base.customer.count({ where: { name: { startsWith: TAG } } });
console.log(`\n  ${left === 0 ? "PASS" : "FAIL"}  no fixture data left behind = ${left}`);
await base.$disconnect();

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED — each one is a ledger bug:`);
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nAll checks passed.");
