/**
 * READ-ONLY verification: the old in-Node receivables logic vs the new SQL one.
 *
 * Run after `prisma migrate deploy` (or before — indexes only change speed):
 *   npm run verify:receivables
 *
 * Exits non-zero if any customer's balance or aging bucket differs by even 1 paisa.
 * Performs no writes of any kind.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

// Prefer a local scratch DB when one is configured, so this can be run against a
// seeded fixture without touching the real database.
const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(new URL(url!).hostname);

// The shipped src/lib/prisma.ts reads DATABASE_URL. Point it at the same database
// this script is checking, so the NEW side below runs the real application code
// rather than a copy of it.
process.env.DATABASE_URL = url;

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  }),
});

const sumLines = (items: { ratePaisa: number; quantity: number; isSample?: boolean }[]) =>
  items.reduce((s, it) => s + (it.isSample ? 0 : it.ratePaisa * it.quantity), 0);

// --- OLD implementation, copied verbatim from git history --------------------

async function oldLedgers() {
  const [customers, invoices, payments, creditNotes] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, openingBalancePaisa: true } }),
    prisma.invoice.findMany({
      where: { status: "ACTIVE" },
      select: {
        customerId: true,
        items: { select: { ratePaisa: true, quantity: true, isSample: true } },
        payments: { select: { amountPaisa: true } },
      },
    }),
    prisma.payment.groupBy({ by: ["customerId"], _sum: { amountPaisa: true } }),
    prisma.creditNote.findMany({
      where: { refundMethod: "CREDIT_TO_ACCOUNT" },
      select: { customerId: true, items: { select: { ratePaisa: true, quantity: true } } },
    }),
  ]);

  const map = new Map<string, number>();
  const opening = new Map<string, number>();
  for (const c of customers) {
    opening.set(c.id, c.openingBalancePaisa);
    map.set(c.id, c.openingBalancePaisa);
  }
  const bump = (id: string, delta: number) => map.set(id, (map.get(id) ?? 0) + delta);

  for (const inv of invoices) {
    bump(inv.customerId, sumLines(inv.items));
    bump(inv.customerId, -inv.payments.reduce((s, p) => s + p.amountPaisa, 0));
  }
  for (const p of payments) bump(p.customerId, -(p._sum.amountPaisa ?? 0));
  for (const cn of creditNotes) {
    bump(cn.customerId, -cn.items.reduce((s, it) => s + it.ratePaisa * it.quantity, 0));
  }
  return map;
}

type Buckets = { current: number; d30: number; d60: number; d90: number; total: number };
const bucketFor = (d: number): keyof Omit<Buckets, "total"> =>
  d <= 30 ? "current" : d <= 60 ? "d30" : d <= 90 ? "d60" : "d90";

async function oldAging(asOf: Date) {
  const [customers, invoices, payments, creditNotes] = await Promise.all([
    prisma.customer.findMany({
      where: { isCashCustomer: false },
      select: { id: true, name: true, openingBalancePaisa: true },
    }),
    prisma.invoice.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        customerId: true,
        date: true,
        items: { select: { ratePaisa: true, quantity: true, isSample: true } },
        payments: { select: { amountPaisa: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.payment.groupBy({ by: ["customerId"], _sum: { amountPaisa: true } }),
    prisma.creditNote.findMany({
      where: { refundMethod: "CREDIT_TO_ACCOUNT" },
      select: { customerId: true, items: { select: { ratePaisa: true, quantity: true } } },
    }),
  ]);

  const unallocated = new Map<string, number>();
  for (const p of payments) unallocated.set(p.customerId, p._sum.amountPaisa ?? 0);
  for (const cn of creditNotes) {
    const amt = cn.items.reduce((s, it) => s + it.ratePaisa * it.quantity, 0);
    unallocated.set(cn.customerId, (unallocated.get(cn.customerId) ?? 0) + amt);
  }

  const invByCustomer = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const arr = invByCustomer.get(inv.customerId) ?? [];
    arr.push(inv);
    invByCustomer.set(inv.customerId, arr);
  }

  const out = new Map<string, Buckets & { oldestDays: number | null }>();
  for (const c of customers) {
    let credit = unallocated.get(c.id) ?? 0;
    const b: Buckets = { current: 0, d30: 0, d60: 0, d90: 0, total: 0 };
    let oldestDays: number | null = null;

    let opening = c.openingBalancePaisa;
    const useOnOpening = Math.min(credit, opening);
    opening -= useOnOpening;
    credit -= useOnOpening;
    if (opening > 0) {
      b.d90 += opening;
      oldestDays = 999;
    }

    for (const inv of invByCustomer.get(c.id) ?? []) {
      const total = sumLines(inv.items);
      const paidAtBilling = inv.payments.reduce((s, p) => s + p.amountPaisa, 0);
      let outstanding = total - paidAtBilling;
      if (outstanding <= 0) continue;
      const use = Math.min(credit, outstanding);
      outstanding -= use;
      credit -= use;
      if (outstanding <= 0) continue;
      const days = Math.max(0, Math.floor((asOf.getTime() - inv.date.getTime()) / 86_400_000));
      b[bucketFor(days)] += outstanding;
      if (oldestDays === null || days > oldestDays) oldestDays = days;
    }
    b.total = b.current + b.d30 + b.d60 + b.d90;
    if (b.total === 0) continue;
    out.set(c.id, { ...b, oldestDays });
  }
  return out;
}

// --- NEW implementation: the REAL shipped module, not a copy -----------------

const { getCustomerBalances, getAging, getTotalReceivable } = await import(
  "../src/lib/receivables.js"
);

async function newLedgers() {
  return getCustomerBalances();
}

async function newAging(asOf: Date) {
  const rows = await getAging(asOf);
  const out = new Map<string, Buckets & { oldestDays: number | null }>();
  for (const r of rows) {
    out.set(r.customerId, {
      current: r.current,
      d30: r.d30,
      d60: r.d60,
      d90: r.d90,
      total: r.total,
      oldestDays: r.oldestDays,
    });
  }
  return out;
}

// --- Compare -----------------------------------------------------------------

async function main() {
  const asOf = new Date();
  let failures = 0;

  const tOld = Date.now();
  const [oldBal, oldAge] = [await oldLedgers(), await oldAging(asOf)];
  const oldMs = Date.now() - tOld;

  const tNew = Date.now();
  const [newBal, newAge] = [await newLedgers(), await newAging(asOf)];
  const newMs = Date.now() - tNew;

  const names = new Map(
    (await prisma.customer.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name])
  );

  for (const id of new Set([...oldBal.keys(), ...newBal.keys()])) {
    const a = oldBal.get(id) ?? 0;
    const b = newBal.get(id) ?? 0;
    if (a !== b) {
      failures++;
      console.error(`BALANCE MISMATCH  ${names.get(id) ?? id}: old=${a} new=${b} (diff ${b - a})`);
    }
  }

  for (const id of new Set([...oldAge.keys(), ...newAge.keys()])) {
    const a = oldAge.get(id);
    const b = newAge.get(id);
    const j = (x: unknown) => JSON.stringify(x ?? null);
    if (j(a) !== j(b)) {
      failures++;
      console.error(`AGING MISMATCH    ${names.get(id) ?? id}:\n  old=${j(a)}\n  new=${j(b)}`);
    }
  }

  // getTotalReceivable() must equal the old page's sum over active credit customers.
  const activeCredit = await prisma.customer.findMany({
    where: { isCashCustomer: false, active: true },
    select: { id: true },
  });
  const expectedTotal = activeCredit.reduce((s, c) => s + (oldBal.get(c.id) ?? 0), 0);
  const actualTotal = await getTotalReceivable();
  if (expectedTotal !== actualTotal) {
    failures++;
    console.error(
      `TOTAL RECEIVABLE MISMATCH: old=${expectedTotal} new=${actualTotal} (diff ${actualTotal - expectedTotal})`
    );
  }

  // The customers list now asks for balances one page at a time. A scoped lookup
  // must return exactly what the unscoped one did for those same customers.
  const pageIds = activeCredit.slice(0, 30).map((c) => c.id);
  const scoped = await getCustomerBalances(pageIds);
  for (const id of pageIds) {
    const a = oldBal.get(id) ?? 0;
    const b = scoped.get(id) ?? 0;
    if (a !== b) {
      failures++;
      console.error(`SCOPED BALANCE MISMATCH ${names.get(id) ?? id}: old=${a} scoped=${b}`);
    }
  }
  if (scoped.size !== pageIds.length) {
    failures++;
    console.error(`SCOPED LOOKUP returned ${scoped.size} rows, expected ${pageIds.length}`);
  }
  // An empty page must not silently fall back to "every customer".
  if ((await getCustomerBalances([])).size !== 0) {
    failures++;
    console.error("SCOPED LOOKUP with [] returned rows — it must return none");
  }

  console.log(`\ncustomers compared : ${new Set([...oldBal.keys(), ...newBal.keys()]).size}`);
  console.log(`total receivable   : ${actualTotal} (matches old: ${expectedTotal === actualTotal})`);
  console.log(`aging rows         : old ${oldAge.size} / new ${newAge.size}`);
  console.log(`old implementation : ${oldMs} ms`);
  console.log(`new implementation : ${newMs} ms`);
  console.log(failures === 0 ? "\n✅ identical — safe to ship" : `\n❌ ${failures} mismatch(es)`);

  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
