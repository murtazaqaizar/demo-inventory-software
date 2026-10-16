/**
 * Verification for the customer LEDGER (statement page, customers/[id]/page.tsx).
 *
 *   npm run verify:ledger
 *
 * Runs the REAL statement builder (src/lib/statement.ts) the page renders, with
 * balances from src/lib/receivables.ts, through a globalThis.prisma proxy onto
 * the transaction (same technique as verify-void-ledger).
 *
 * Time zone: the process starts in UTC, like Vercel's servers, and then applies
 * the app's zone exactly as src/instrumentation.ts does at server start.
 *
 * Section A checks invariants that must always hold. The other sections are the
 * ledger bugs that were fixed; each check states the correct result.
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

const { applyAppTimeZone } = await import("../src/lib/timezone.js");
applyAppTimeZone(); // what src/instrumentation.ts does when the server starts

const { writeSaleStock, writeInvoicePayments, voidInvoiceTx } = await import("../src/lib/billing-effects.js");
const { getCustomerBalance } = await import("../src/lib/receivables.js");
const { returnBillError } = await import("../src/lib/returns.js");
const { buildStatement } = await import("../src/lib/statement.js");

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

type Statement = NonNullable<Awaited<ReturnType<typeof buildStatement>>>;
const statement = async (id: string, from?: string, to?: string) => (await buildStatement(id, { from, to })) as Statement;
const owingSum = (s: Statement) => rs(s.bills.reduce((t, b) => t + b.owing, 0));

// --- fixture helpers -------------------------------------------------------------

type Pay = { method: "CASH" | "ONLINE" | "CHEQUE"; amountPaisa: number; chequeNumber?: string; chequeBank?: string };

async function makeBill(tx: Tx, customer: { id: string; name: string }, productId: string, rateRs: number, pays: Pay[], date?: Date, qty = 1) {
  const lines = [{ productId, colorId: null, description: null, unit: "pcs", qtyMilli: qty * 1000, ratePaisa: rateRs * RS, unitCostPaisa: 100 * RS, isSample: false }];
  const inv = await tx.invoice.create({ data: { customerId: customer.id, method: pays[0]?.method ?? "UDHAAR", ...(date ? { date } : {}), items: { create: lines } } });
  await writeSaleStock(tx, inv.id, lines);
  await writeInvoicePayments(tx, { invoiceId: inv.id, invoiceNumber: inv.number, customerName: customer.name, note: `Bill #${inv.number}`, date }, pays);
  return inv;
}
const voidBill = (tx: Tx, invoiceId: string) => voidInvoiceTx(tx, invoiceId, { userId: null, reason: "Wrong entry" });
// `date` places the fixture on a known day.
const pay = (tx: Tx, customerId: string, amountRs: number, date?: Date) =>
  tx.payment.create({ data: { customerId, amountPaisa: amountRs * RS, method: "CASH", note: "Payment received", ...(date ? { date } : {}) } });
async function returnToAccount(tx: Tx, customerId: string, invoiceId: string, productId: string, rateRs: number, date?: Date) {
  const error = await returnBillError(tx, customerId, invoiceId);
  if (error) return { error };
  const note = await tx.creditNote.create({
    data: { customerId, invoiceId, refundMethod: "CREDIT_TO_ACCOUNT", ...(date ? { date } : {}), items: { create: [{ productId, unit: "pcs", qtyMilli: 1000, ratePaisa: rateRs * RS, unitCostPaisa: 100 * RS }] } },
  });
  await tx.stockMovement.create({ data: { productId, type: "RETURN_IN", qtyMilli: 1000, unitCostPaisa: 100 * RS, creditNoteId: note.id } });
  return { error: null };
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

      // =====================================================================
      heading("A. Invariants on an ordinary account");
      {
        const c = await newCustomer("ordinary", 5_000);
        await makeBill(tx, c, product.id, 20_000, [{ method: "CASH", amountPaisa: 5_000 * RS }], day("2026-01-05"));
        await pay(tx, c.id, 8_000, new Date("2026-01-10T09:00:00Z"));
        const b1 = await tx.invoice.findFirstOrThrow({ where: { customerId: c.id } });
        await returnToAccount(tx, c.id, b1.id, product.id, 2_000, new Date("2026-01-12T09:00:00Z"));
        await makeBill(tx, c, product.id, 10_000, [], day("2026-01-20"));
        const all = await statement(c.id);
        check("closing balance of the running ledger = customer balance", rs(all.closing), await balance(c.id));
        check("header 'outstanding' = customer balance", rs(all.totals.outstanding), await balance(c.id));
        check("bills table: Σ owing = outstanding (opening was settled first)", owingSum(all), rs(all.totals.outstanding));
        check("ledger rows in date order", all.rows.map((r) => r.kind.split(" #")[0].split(" (")[0]), ["Bill", "Payment", "Return", "Bill"]);
        const mid = await statement(c.id, "2026-01-10", "2026-01-12");
        check("period opening carries everything before 'from'", rs(mid.opening), 5_000 + 20_000 - 5_000);
        check("period shows only the payment and the return", mid.rows.length, 2);
        const atEnd = rs(all.rows.find((r) => r.kind.startsWith("Return"))!.balance);
        check("period closing = full-ledger balance on the 'to' day", rs(mid.closing), atEnd);
        const later = await statement(c.id, "2027-01-01");
        check("a period after all activity opens at the full balance, no rows", [rs(later.opening), later.rows.length], [await balance(c.id), 0]);
        const sameDay = await newCustomer("same-day");
        await makeBill(tx, sameDay, product.id, 7_000, [], day("2026-02-01"));
        await pay(tx, sameDay.id, 7_000, new Date("2026-02-01T10:00:00Z"));
        const sd = await statement(sameDay.id);
        check("same-day bill (back-dated) comes before its payment; never a negative step", sd.rows.map((r) => rs(r.balance)), [7_000, 0]);
      }

      // =====================================================================
      heading("B. Voided bill stays traceable on the ledger");
      {
        const c = await newCustomer("voided");
        const a = await makeBill(tx, c, product.id, 50_000, [{ method: "CASH", amountPaisa: 30_000 * RS }], day("2026-03-01"));
        await pay(tx, c.id, 20_000, new Date("2026-03-02T09:00:00Z"));
        await voidBill(tx, a.id);
        const s = await statement(c.id);
        const voidedRow = s.rows.findIndex((r) => r.voided && r.kind === `Bill #${a.number}`);
        check("voided bill is still listed in the ledger (zero-effect line)", voidedRow >= 0, true);
        check("...marked VOIDED with its reason", s.rows[voidedRow]?.note, "VOIDED — Wrong entry");
        check("...and moves no money", [s.rows[voidedRow]?.debit, s.rows[voidedRow]?.credit], [0, 0]);
        check("the 20,000 paid against it shows as an advance in the header", rs(s.totals.outstanding), -20_000);
        await makeBill(tx, c, product.id, 50_000, [{ method: "CASH", amountPaisa: 30_000 * RS }], day("2026-03-05"));
        const s2 = await statement(c.id);
        const vi = s2.rows.findIndex((r) => r.voided);
        const pi = s2.rows.findIndex((r) => r.kind.startsWith("Payment"));
        check("the advance that settled the new bill is traceable: voided bill, then its payment", vi >= 0 && vi < pi, true);
        check("new bill shows settled, ledger closes at 0", [rs(s2.bills[0].owing), rs(s2.closing)], [0, 0]);
      }

      // =====================================================================
      heading("C. Customer with an advance (negative opening)");
      {
        const c = await newCustomer("advance", -10_000);
        await makeBill(tx, c, product.id, 10_000, [], day("2026-04-01"));
        const s = await statement(c.id);
        check("header outstanding is 0", rs(s.totals.outstanding), 0);
        check("bills table agrees with the header (Σ owing = outstanding)", owingSum(s), rs(s.totals.outstanding));
      }

      // =====================================================================
      heading("D. Bounced cheque on a bill");
      {
        const c = await newCustomer("bounced");
        const b = await makeBill(tx, c, product.id, 40_000, [{ method: "CHEQUE", amountPaisa: 40_000 * RS, chequeNumber: "444", chequeBank: "ABL" }], day("2026-05-01"));
        const ip = await tx.invoicePayment.findFirstOrThrow({ where: { invoiceId: b.id } });
        await tx.cheque.update({ where: { id: ip.chequeId! }, data: { status: "BOUNCED" } }); // setChequeStatus
        const s = await statement(c.id);
        check("ledger closing shows the 40,000 owed again", rs(s.closing), 40_000);
        check("the bill is shown as owing, not paid", rs(s.bills[0].owing), 40_000);
        check("the bill's row says the cheque bounced", s.rows[0].note, "Cheque 444 bounced — not paid");
      }

      // =====================================================================
      heading("E. Return against a voided bill");
      {
        const c = await newCustomer("return-on-voided");
        const b = await makeBill(tx, c, product.id, 10_000, [], day("2026-06-01"));
        await voidBill(tx, b.id);
        const res = await returnToAccount(tx, c.id, b.id, product.id, 10_000, new Date("2026-06-02T09:00:00Z"));
        check("the return is refused", res.error !== null, true);
        check("ledger does not credit a return on a voided bill", rs((await statement(c.id)).closing), 0);
      }

      // =====================================================================
      heading("F. Voiding after a return");
      {
        const c = await newCustomer("void-after-return");
        const b = await makeBill(tx, c, product.id, 25_000, [], day("2026-07-01"), 2);
        await returnToAccount(tx, c.id, b.id, product.id, 25_000, new Date("2026-07-02T09:00:00Z"));
        const res = await voidBill(tx, b.id);
        check("the void is refused while the bill has a return", res.ok, false);
        check("ledger still shows the 25,000 owed — no fake advance", rs((await statement(c.id)).closing), 25_000);
      }

      // =====================================================================
      heading("G. Late-night bill in Pakistan (server starts in UTC)");
      {
        const c = await newCustomer("late-night");
        // Made "today" at 01:30 PKT on 16 Oct = 15 Oct 20:30 UTC (dateFromInput keeps clock time for today).
        await makeBill(tx, c, product.id, 5_000, [], new Date("2026-10-15T20:30:00.000Z"));
        const s = await statement(c.id, "2026-10-16", "2026-10-16");
        check("statement filtered to 16 Oct includes the bill made on 16 Oct (PKT)", s.rows.length, 1);
        const all = await statement(c.id);
        check("ledger prints the Pakistani date, 16/10/2026", all.rows[0].date.toLocaleDateString("en-PK"), "16/10/2026");
        const s15 = await statement(c.id, "2026-10-15", "2026-10-15");
        check("...and it is not on 15 Oct", s15.rows.length, 0);
        // A back-dated bill (form day stored at UTC midnight = 05:00 PKT) stays on its day.
        const d = await newCustomer("backdated-day");
        await makeBill(tx, d, product.id, 5_000, [], day("2026-10-10"));
        check("a back-dated bill still shows on the day picked", (await statement(d.id)).rows[0].date.toLocaleDateString("en-PK"), "10/10/2026");
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
