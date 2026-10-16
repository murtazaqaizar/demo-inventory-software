/**
 * Generated (randomised) verification: 100 seeded cases of mixed bills, payments,
 * cheques, voids, returns, edits and reversals, each checked against an
 * independent model kept by this script.
 *
 *   npm run verify:generated                 # 100 cases, default seed
 *   CASES=300 SEED=42 npm run verify:generated
 *
 * The app side is the REAL shipped code (billing-effects, customer-payments,
 * returns guard, statement, receivables, stock, money accounts, reports) through
 * a globalThis.prisma proxy onto the transaction. Server actions that are not in
 * src/lib (create/edit bill, record a return, set cheque status) are mirrored
 * step by step, as in verify-void-ledger.
 *
 * The model never reads the app's answers: it keeps its own list of bills,
 * payments, cheques and returns and derives what the balance, stock, cash and
 * bank must be. A FAIL prints the seed and case number so it can be replayed.
 *
 * Every case runs in its own interactive transaction that is always rolled back.
 * Note: Postgres sequences (bill/return numbers) are not rolled back, so a run
 * advances those counters on the database it points at. Run it against a test
 * database, never a client's live one.
 */
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

const { writeSaleStock, writeInvoicePayments, reverseInvoiceMoney, voidInvoiceTx, editBlocker } = await import(
  "../src/lib/billing-effects.js"
);
const { getCustomerBalance, getAging, getTotalReceivable } = await import("../src/lib/receivables.js");
const { recordCustomerPaymentTx, reverseCustomerPaymentTx } = await import("../src/lib/customer-payments.js");
const { returnBillError } = await import("../src/lib/returns.js");
const { buildStatement } = await import("../src/lib/statement.js");
const { getAccountBalances } = await import("../src/lib/money-accounts.js");
const { getCurrentStock } = await import("../src/lib/stock.js");
const { getIncomeStatement } = await import("../src/lib/reports.js");

// --- seeded random -----------------------------------------------------------
const SEED = Number(process.env.SEED ?? 20261016);
const CASES = Number(process.env.CASES ?? 100);
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(SEED);
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number) => rnd() < p;

// --- reporting -----------------------------------------------------------------
let failures = 0;
let checks = 0;
const failedCases = new Set<number>();
let caseNo = 0;
let opLog: string[] = [];
function check(label: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) return;
  failures++;
  failedCases.add(caseNo);
  console.error(`  FAIL  case ${caseNo}: ${label}\n        expected ${e}\n        got      ${a}\n        ops: ${opLog.join(" → ")}`);
}

const TAG = `vgen-${Date.now()}`;
class Rollback extends Error {}
const RS = 100;
const rs = (p: number) => p / RS;
const RATE_COST = 100 * RS;

// --- the independent model ----------------------------------------------------
type Method = "CASH" | "ONLINE" | "CHEQUE";
type ChequeState = "PENDING" | "CLEARED" | "BOUNCED";
type MPay = { method: Method; amount: number; chequeId: string | null };
type MBill = { id: string; customerId: string; qty: number; total: number; voided: boolean; date: Date; pays: MPay[]; returnedQty: number };
type MLump = { id: string; customerId: string; method: Method; amount: number; chequeId: string | null };
type MReturn = { customerId: string; qty: number; amount: number; refund: "CREDIT_TO_ACCOUNT" | "CASH_REFUND" };

type Model = {
  customers: { id: string; name: string; opening: number }[];
  bills: MBill[];
  lumps: MLump[];
  returns: MReturn[];
  cheques: Map<string, ChequeState>;
};
const counted = (m: Model, p: { amount: number; chequeId: string | null }) =>
  p.chequeId && m.cheques.get(p.chequeId) === "BOUNCED" ? 0 : p.amount;
function expectedBalance(m: Model, customerId: string) {
  const c = m.customers.find((x) => x.id === customerId)!;
  let b = c.opening;
  for (const bill of m.bills.filter((x) => x.customerId === customerId && !x.voided)) {
    b += bill.total;
    for (const p of bill.pays) b -= counted(m, p);
  }
  for (const l of m.lumps.filter((x) => x.customerId === customerId)) b -= counted(m, l);
  for (const r of m.returns.filter((x) => x.customerId === customerId && x.refund === "CREDIT_TO_ACCOUNT")) b -= r.amount;
  return b;
}
function expectedMoney(m: Model) {
  let cash = 0;
  let bank = 0;
  const add = (p: { method: Method; amount: number; chequeId: string | null }) => {
    if (p.method === "CASH") cash += p.amount;
    else if (p.method === "ONLINE") bank += p.amount;
    else if (p.chequeId && m.cheques.get(p.chequeId) === "CLEARED") bank += p.amount;
  };
  for (const bill of m.bills.filter((x) => !x.voided)) bill.pays.forEach(add);
  m.lumps.forEach(add);
  for (const r of m.returns.filter((x) => x.refund === "CASH_REFUND")) cash -= r.amount;
  return { cash, bank };
}

// --- mirrors of the server actions ---------------------------------------------
let chequeSeq = 0;
function randomPayments(total: number): { method: Method; amountPaisa: number; chequeNumber?: string; chequeBank?: string }[] {
  const mode = pick(["none", "full", "part", "split"]);
  if (mode === "none" || total === 0) return [];
  const paid = mode === "full" ? total : int(1, Math.max(1, total - 1));
  const methods: Method[] = ["CASH", "ONLINE", "CHEQUE"];
  const one = (amount: number) => {
    const method = pick(methods);
    return { method, amountPaisa: amount, ...(method === "CHEQUE" ? { chequeNumber: `G${caseNo}-${++chequeSeq}`, chequeBank: "TEST" } : {}) };
  };
  if (mode === "split" && paid >= 2) {
    const first = int(1, paid - 1);
    return [one(first), one(paid - first)];
  }
  return [one(paid)];
}

// billing/actions.ts createInvoice (after its validation).
async function opBill(tx: Tx, m: Model, productId: string) {
  const c = pick(m.customers);
  const qty = int(1, 5);
  const rateRs = int(1, 500) * 100;
  const total = qty * rateRs * RS;
  const pays = randomPayments(total);
  const date = chance(0.3) ? new Date(Date.UTC(2026, int(0, 8), int(1, 28))) : undefined; // a form-picked past day
  const lines = [{ productId, colorId: null, description: null, unit: "pcs", qtyMilli: qty * 1000, ratePaisa: rateRs * RS, unitCostPaisa: RATE_COST, isSample: false }];
  const received = pays.reduce((s, p) => s + p.amountPaisa, 0);
  const inv = await tx.invoice.create({
    data: { customerId: c.id, method: received === 0 ? "UDHAAR" : pays[0].method, ...(date ? { date } : {}), items: { create: lines } },
  });
  await writeSaleStock(tx, inv.id, lines);
  await writeInvoicePayments(tx, { invoiceId: inv.id, invoiceNumber: inv.number, customerName: c.name, note: `Invoice #${inv.number}`, date }, pays);
  const rows = await tx.invoicePayment.findMany({ where: { invoiceId: inv.id }, orderBy: { createdAt: "asc" } });
  const mp: MPay[] = rows.map((r) => ({ method: r.method as Method, amount: r.amountPaisa, chequeId: r.chequeId }));
  for (const p of mp) if (p.chequeId) m.cheques.set(p.chequeId, "PENDING");
  m.bills.push({ id: inv.id, customerId: c.id, qty, total, voided: false, date: inv.date, pays: mp, returnedQty: 0 });
  opLog.push(`bill(${rs(total)},paid ${rs(received)}${date ? ",backdated" : ""})`);
}

async function opLump(tx: Tx, m: Model) {
  const c = pick(m.customers);
  const method: Method = pick(["CASH", "ONLINE", "CHEQUE"]);
  const amount = int(1, 2000) * 100 * RS;
  const p = await recordCustomerPaymentTx(tx, { customerId: c.id, customerName: c.name, amountPaisa: amount, method, chequeNumber: method === "CHEQUE" ? `G${caseNo}-${++chequeSeq}` : undefined });
  if (p.chequeId) m.cheques.set(p.chequeId, "PENDING");
  m.lumps.push({ id: p.id, customerId: c.id, method, amount, chequeId: p.chequeId });
  opLog.push(`pay(${method},${rs(amount)})`);
}

async function opReverse(tx: Tx, m: Model) {
  if (m.lumps.length === 0) return opLump(tx, m);
  const l = pick(m.lumps);
  const res = await reverseCustomerPaymentTx(tx, l.id);
  check("reversal goes through", res.ok, true);
  m.lumps = m.lumps.filter((x) => x !== l);
  if (l.chequeId && m.cheques.get(l.chequeId) === "PENDING") m.cheques.delete(l.chequeId);
  // A CLEARED cheque is refunded: drop it from the model's money (the lump is gone).
  opLog.push(`reverse(${l.method},${rs(l.amount)})`);
}

async function opVoid(tx: Tx, m: Model) {
  const active = m.bills.filter((b) => !b.voided);
  if (active.length === 0) return;
  const b = pick(active);
  const res = await voidInvoiceTx(tx, b.id, { userId: null, reason: "generated" });
  const shouldRefuse = b.returnedQty > 0;
  check("void refused exactly when the bill has a return", !res.ok, shouldRefuse);
  if (res.ok) {
    b.voided = true;
    for (const p of b.pays) if (p.chequeId && m.cheques.get(p.chequeId) === "PENDING") m.cheques.set(p.chequeId, "BOUNCED");
  }
  opLog.push(`void(${rs(b.total)}${res.ok ? "" : ",refused"})`);
}

// returns/actions.ts createReturn: guard, credit note, RETURN_IN, cash refund.
async function opReturn(tx: Tx, m: Model, productId: string) {
  if (m.bills.length === 0) return;
  const b = pick(m.bills);
  const left = b.qty - b.returnedQty;
  if (left <= 0) return;
  const qty = int(1, left);
  const ratePaisa = b.total / b.qty;
  const amount = qty * ratePaisa;
  const refund = chance(0.7) ? ("CREDIT_TO_ACCOUNT" as const) : ("CASH_REFUND" as const);
  const error = await returnBillError(tx, b.customerId, b.id);
  check("return refused exactly when the bill is voided", error !== null, b.voided);
  if (!error) {
    const note = await tx.creditNote.create({
      data: { customerId: b.customerId, invoiceId: b.id, refundMethod: refund, items: { create: [{ productId, unit: "pcs", qtyMilli: qty * 1000, ratePaisa, unitCostPaisa: RATE_COST }] } },
    });
    await tx.stockMovement.create({ data: { productId, type: "RETURN_IN", qtyMilli: qty * 1000, unitCostPaisa: RATE_COST, creditNoteId: note.id } });
    if (refund === "CASH_REFUND") {
      const cash = await tx.moneyAccount.findFirst({ where: { kind: "CASH" } });
      await tx.moneyMovement.create({ data: { accountId: cash!.id, type: "REFUND", amountPaisa: -amount, note: `Refund on credit note #${note.number}` } });
    }
    b.returnedQty += qty;
    m.returns.push({ customerId: b.customerId, qty, amount, refund });
  }
  opLog.push(`return(${qty}${refund === "CASH_REFUND" ? ",cash" : ""}${error ? ",refused" : ""})`);
}

// cheques/actions.ts setChequeStatus.
async function opCheque(tx: Tx, m: Model) {
  const pending = [...m.cheques].filter(([, s]) => s === "PENDING").map(([id]) => id);
  if (pending.length === 0) return;
  const id = pick(pending);
  const status: ChequeState = chance(0.6) ? "CLEARED" : "BOUNCED";
  const cheque = await tx.cheque.findUniqueOrThrow({ where: { id } });
  await tx.cheque.update({ where: { id }, data: { status, clearedAt: status === "CLEARED" ? new Date() : null } });
  if (status === "CLEARED") {
    const bank = await tx.moneyAccount.findFirst({ where: { kind: "BANK" } });
    await tx.moneyMovement.create({ data: { accountId: bank!.id, type: "CHEQUE_CLEAR", amountPaisa: cheque.amountPaisa, note: `Cheque ${cheque.number} (RECEIVED) → bank` } });
  }
  m.cheques.set(id, status);
  opLog.push(`cheque ${status.toLowerCase()}`);
}

// billing/actions.ts editInvoice: guard, then reverse old money, rewrite lines and payments.
async function opEdit(tx: Tx, m: Model, productId: string) {
  const active = m.bills.filter((b) => !b.voided);
  if (active.length === 0) return;
  const b = pick(active);
  const blocked = await editBlocker(tx, b.id);
  const settled = b.pays.some((p) => p.chequeId && m.cheques.get(p.chequeId) !== "PENDING");
  check("edit refused exactly when a cheque has cleared or bounced", blocked !== null, settled);
  if (blocked) {
    opLog.push("edit(refused)");
    return;
  }
  const qty = Math.max(b.returnedQty, int(1, 5));
  const rateRs = int(1, 500) * 100;
  const total = qty * rateRs * RS;
  const pays = randomPayments(total);
  const old = await tx.invoicePayment.findMany({ where: { invoiceId: b.id } });
  await reverseInvoiceMoney(tx, old, { note: `Bill edited`, chequeAction: "delete", date: b.date });
  await tx.stockMovement.deleteMany({ where: { invoiceId: b.id } });
  await tx.invoicePayment.deleteMany({ where: { invoiceId: b.id } });
  await tx.invoiceItem.deleteMany({ where: { invoiceId: b.id } });
  const lines = [{ productId, colorId: null, description: null, unit: "pcs", qtyMilli: qty * 1000, ratePaisa: rateRs * RS, unitCostPaisa: RATE_COST, isSample: false }];
  await tx.invoice.update({ where: { id: b.id }, data: { date: b.date, items: { create: lines } } });
  await writeSaleStock(tx, b.id, lines);
  const c = m.customers.find((x) => x.id === b.customerId)!;
  await writeInvoicePayments(tx, { invoiceId: b.id, invoiceNumber: 0, customerName: c.name, note: "edited", date: b.date }, pays);
  for (const p of b.pays) if (p.chequeId) m.cheques.delete(p.chequeId);
  const rows = await tx.invoicePayment.findMany({ where: { invoiceId: b.id } });
  b.pays = rows.map((r) => ({ method: r.method as Method, amount: r.amountPaisa, chequeId: r.chequeId }));
  for (const p of b.pays) if (p.chequeId) m.cheques.set(p.chequeId, "PENDING");
  b.qty = qty;
  b.total = total;
  opLog.push(`edit(${rs(total)})`);
}

// --- invariants ------------------------------------------------------------------
async function verifyCase(tx: Tx, m: Model, productId: string, start: { cash: number; bank: number; stock: number; receivable: number; sales: number }) {
  let receivableDelta = 0;
  for (const c of m.customers) {
    const want = expectedBalance(m, c.id);
    receivableDelta += Math.max(0, want);
    const got = await getCustomerBalance(c.id);
    check(`balance of ${c.name.split(" ").pop()}`, rs(got), rs(want));

    const st = (await buildStatement(c.id))!;
    check("statement closing = balance", rs(st.closing), rs(want));
    check("statement header outstanding = balance", rs(st.totals.outstanding), rs(want));
    check("last running row = closing", st.rows.length ? rs(st.rows.at(-1)!.balance) : rs(st.opening), rs(st.closing));
    const withVoided = (await buildStatement(c.id, { showVoided: true }))!;
    check("showing voided bills changes no totals", rs(withVoided.closing), rs(st.closing));
    check("voided lines carry no money", withVoided.rows.filter((r) => r.voided).every((r) => r.debit === 0 && r.credit === 0), true);
    check("voided count matches the model", withVoided.voidedCount, m.bills.filter((b) => b.customerId === c.id && b.voided).length);

    const owing = st.bills.reduce((s, b) => s + b.owing, 0);
    check("every bill: 0 ≤ owing ≤ total", st.bills.every((b) => b.owing >= 0 && b.owing <= b.total), true);
    if (want <= 0) check("customer owes nothing → every bill settled", owing, 0);
    else {
      check("bills table never shows more owing than the balance", owing <= want, true);
      check("the rest of the balance is unpaid opening", want - owing <= Math.max(0, c.opening), true);
    }
    const aging = (await getAging()).find((r) => r.customerId === c.id);
    check("aging total = what is owed", aging?.total ?? 0, Math.max(0, want));

    // A filtered period must chain onto the full ledger.
    const mid = (await buildStatement(c.id, { from: "2026-05-01" }))!;
    check("period from 1 May closes at the full balance", rs(mid.closing), rs(want));
  }

  check("stock = start − sold on active bills + returned",
    (await getCurrentStock(productId)) / 1000,
    start.stock - m.bills.filter((b) => !b.voided).reduce((s, b) => s + b.qty, 0) + m.returns.reduce((s, r) => s + r.qty, 0));

  const money = await getAccountBalances();
  const of = (k: string) => money.filter((a) => a.kind === k).reduce((s, a) => s + a.balancePaisa, 0);
  const want = expectedMoney(m);
  check("cash = cash taken − cash refunds", rs(of("CASH") - start.cash), rs(want.cash));
  check("bank = online + cleared cheques", rs(of("BANK") - start.bank), rs(want.bank));

  check("'Who owes me' grows by what these customers owe", rs((await getTotalReceivable()) - start.receivable), rs(receivableDelta));

  const sales = (await getIncomeStatement(new Date("2000-01-01"), new Date("2100-01-01"))).statement.salesPaisa;
  check("sales = active bills − returns",
    rs(sales - start.sales),
    rs(m.bills.filter((b) => !b.voided).reduce((s, b) => s + b.total, 0) - m.returns.reduce((s, r) => s + r.amount, 0)));

  const ids = m.bills.map((b) => b.id);
  check("no PENDING cheque left on a voided bill",
    await tx.invoicePayment.count({ where: { invoiceId: { in: ids }, invoice: { status: "VOIDED" }, cheque: { status: "PENDING" } } }), 0);
  check("no return linked to a voided bill unless it came first",
    m.bills.filter((b) => b.voided && b.returnedQty > 0).length, 0);
}

// --- run -------------------------------------------------------------------------
console.log(`seed ${SEED}, ${CASES} cases`);
const started = Date.now();
for (caseNo = 1; caseNo <= CASES; caseNo++) {
  opLog = [];
  rnd = mulberry32(SEED * 1000 + caseNo); // each case replayable on its own
  try {
    await base.$transaction(
      async (tx) => {
        current = tx;
        for (const kind of ["CASH", "BANK"] as const) {
          if (!(await tx.moneyAccount.findFirst({ where: { kind } }))) await tx.moneyAccount.create({ data: { kind, name: kind } });
        }
        const product = await tx.product.create({ data: { code: `${TAG}-${caseNo}`, name: `${TAG} item ${caseNo}` } });
        await tx.stockMovement.create({ data: { productId: product.id, type: "ADJUST", qtyMilli: 1_000_000, unitCostPaisa: RATE_COST } });

        const m: Model = { customers: [], bills: [], lumps: [], returns: [], cheques: new Map() };
        for (let i = 0; i < int(1, 2); i++) {
          const opening = pick([0, 0, 500_000, -500_000]);
          const c = await tx.customer.create({ data: { name: `${TAG} c${caseNo}-${i}`, openingBalancePaisa: opening } });
          m.customers.push({ id: c.id, name: c.name, opening });
        }

        const money0 = await getAccountBalances();
        const of0 = (k: string) => money0.filter((a) => a.kind === k).reduce((s, a) => s + a.balancePaisa, 0);
        const start = {
          cash: of0("CASH"),
          bank: of0("BANK"),
          stock: (await getCurrentStock(product.id)) / 1000,
          receivable: (await getTotalReceivable()) - m.customers.reduce((s, c) => s + Math.max(0, c.opening), 0),
          sales: (await getIncomeStatement(new Date("2000-01-01"), new Date("2100-01-01"))).statement.salesPaisa,
        };

        await opBill(tx, m, product.id); // every case starts with a bill
        const ops = int(5, 12);
        for (let i = 0; i < ops; i++) {
          const op = pick(["bill", "bill", "lump", "lump", "reverse", "void", "return", "return", "cheque", "cheque", "edit"]);
          if (op === "bill") await opBill(tx, m, product.id);
          else if (op === "lump") await opLump(tx, m);
          else if (op === "reverse") await opReverse(tx, m);
          else if (op === "void") await opVoid(tx, m);
          else if (op === "return") await opReturn(tx, m, product.id);
          else if (op === "cheque") await opCheque(tx, m);
          else await opEdit(tx, m, product.id);
        }
        await verifyCase(tx, m, product.id, start);
        current = null;
        throw new Rollback();
      },
      { timeout: 120_000, maxWait: 20_000 }
    );
  } catch (e) {
    current = null;
    if (!(e instanceof Rollback)) {
      failures++;
      failedCases.add(caseNo);
      console.error(`  ERROR case ${caseNo}: ${(e as Error).message}\n        ops: ${opLog.join(" → ")}`);
    }
  }
  if (caseNo % 10 === 0) console.log(`  ${caseNo}/${CASES} cases · ${checks} checks · ${failures} failures · ${Math.round((Date.now() - started) / 1000)}s`);
}

const left = await base.customer.count({ where: { name: { startsWith: TAG } } });
console.log(`\n  ${left === 0 ? "PASS" : "FAIL"}  no fixture data left behind = ${left}`);
await base.$disconnect();

if (failures > 0 || left > 0) {
  console.error(`\n${failures} failure(s) in case(s) ${[...failedCases].join(", ")} — replay with SEED=${SEED}`);
  process.exit(1);
}
console.log(`\nAll ${CASES} generated cases passed (${checks} checks).`);
