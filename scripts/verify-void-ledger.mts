/**
 * Verification for voids, later payments, returns and cheques — the paths where
 * a bill, the customer's ledger, the cash book and stock can drift apart.
 *
 *   npm run verify:void-ledger
 *
 * Every check states the CORRECT business result, so a FAIL is a bug.
 *
 * Everything runs the REAL shipped code: voiding (voidInvoiceTx), the edit and
 * return guards, customer payments and their reversal, the statement, balances,
 * "paid later", aging, cash, stock and income. Those modules import a
 * module-level `prisma`, so before importing them this script puts a proxy on
 * globalThis.prisma that forwards to the current interactive transaction — the
 * shipped code then sees the fixture.
 *
 * Only setChequeStatus is still mirrored (it lives in a "use server" file and
 * has no logic beyond the two writes copied below).
 *
 * Runs inside ONE interactive transaction that is always rolled back.
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
const { getCustomerBalance, getLaterPaidByInvoice, getAging, getTotalReceivable, sumPaid, PAYMENTS_WITH_CHEQUE } = await import(
  "../src/lib/receivables.js"
);
const { recordCustomerPaymentTx, reverseCustomerPaymentTx, overpaymentWarning } = await import("../src/lib/customer-payments.js");
const { returnBillError } = await import("../src/lib/returns.js");
const { buildStatement } = await import("../src/lib/statement.js");
const { getAccountBalances } = await import("../src/lib/money-accounts.js");
const { getCurrentStock } = await import("../src/lib/stock.js");
const { getIncomeStatement } = await import("../src/lib/reports.js");

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
function info(label: string, value: unknown) {
  console.log(`  INFO  ${label} = ${JSON.stringify(value)}`);
}
function heading(t: string) {
  section = t;
  console.log(`\n${t}`);
}

const TAG = `vvoid-${Date.now()}`;
class Rollback extends Error {}
const RS = 100; // paisa per rupee

type Pay = { method: "CASH" | "ONLINE" | "CHEQUE"; amountPaisa: number; chequeNumber?: string; chequeBank?: string };
type Customer = { id: string; name: string };

// --- fixture helpers -----------------------------------------------------------

// billing/actions.ts createInvoice: invoice + items, stock out, money in.
async function makeBill(tx: Tx, customer: Customer, productId: string, qty: number, rateRs: number, pays: Pay[], date?: Date) {
  const total = qty * rateRs * RS;
  const received = pays.reduce((s, p) => s + p.amountPaisa, 0);
  const lines = [{ productId, colorId: null, description: null, unit: "pcs", qtyMilli: qty * 1000, ratePaisa: rateRs * RS, unitCostPaisa: 1000 * RS, isSample: false }];
  const inv = await tx.invoice.create({
    data: {
      customerId: customer.id,
      method: total - received > 0 && received === 0 ? "UDHAAR" : pays[0]?.method ?? "UDHAAR",
      ...(date ? { date } : {}),
      items: { create: lines },
    },
  });
  await writeSaleStock(tx, inv.id, lines);
  await writeInvoicePayments(tx, { invoiceId: inv.id, invoiceNumber: inv.number, customerName: customer.name, note: `Bill #${inv.number}`, date }, pays);
  return inv;
}

const voidBill = (tx: Tx, invoiceId: string) => voidInvoiceTx(tx, invoiceId, { userId: null, reason: "test" });

const receivePayment = (tx: Tx, c: Customer, amountPaisa: number, method: "CASH" | "ONLINE" | "CHEQUE" = "CASH") =>
  recordCustomerPaymentTx(tx, { customerId: c.id, customerName: c.name, amountPaisa, method, chequeNumber: method === "CHEQUE" ? "555" : undefined });

// returns/actions.ts createReturn, CREDIT_TO_ACCOUNT: the bill guard, then credit
// note + RETURN_IN stock. Returns the guard's error when it refuses.
async function returnToAccount(tx: Tx, customerId: string, invoiceId: string, productId: string, qty: number, rateRs: number) {
  const error = await returnBillError(tx, customerId, invoiceId);
  if (error) return { error };
  const note = await tx.creditNote.create({
    data: {
      customerId,
      invoiceId,
      refundMethod: "CREDIT_TO_ACCOUNT",
      items: { create: [{ productId, unit: "pcs", qtyMilli: qty * 1000, ratePaisa: rateRs * RS, unitCostPaisa: 1000 * RS }] },
    },
  });
  await tx.stockMovement.create({
    data: { productId, type: "RETURN_IN", qtyMilli: qty * 1000, unitCostPaisa: 1000 * RS, reason: `Return — credit note #${note.number}`, creditNoteId: note.id },
  });
  return { error: null };
}

// cheques/actions.ts setChequeStatus.
async function setCheque(tx: Tx, chequeId: string, status: "CLEARED" | "BOUNCED") {
  const cheque = await tx.cheque.findUniqueOrThrow({ where: { id: chequeId } });
  await tx.cheque.update({ where: { id: chequeId }, data: { status, clearedAt: status === "CLEARED" ? new Date() : null } });
  if (status === "CLEARED") {
    const bank = await tx.moneyAccount.findFirst({ where: { kind: "BANK" } });
    if (bank) await tx.moneyMovement.create({ data: { accountId: bank.id, type: "CHEQUE_CLEAR", amountPaisa: cheque.amountPaisa, note: `Cheque ${cheque.number} (RECEIVED) → bank` } });
  }
}

// --- read helpers (shipped functions) ----------------------------------------

const rs = (paisa: number) => paisa / RS;
const balance = async (customerId: string) => rs(await getCustomerBalance(customerId));
async function billOwing(tx: Tx, invoiceId: string) {
  // Same sum the billing list (billing/page.tsx) and print page use.
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { items: true, payments: PAYMENTS_WITH_CHEQUE } });
  const total = inv.items.reduce((s, it) => s + Math.round((it.qtyMilli * it.ratePaisa) / 1000), 0);
  const later = (await getLaterPaidByInvoice([inv.customerId])).get(inv.id) ?? 0;
  const paid = sumPaid(inv.payments) + later;
  return { owing: rs(inv.status === "VOIDED" ? 0 : total - paid), paidLater: rs(later) };
}
async function cashBank() {
  const b = await getAccountBalances();
  const of = (k: string) => b.filter((a) => a.kind === k).reduce((s, a) => s + a.balancePaisa, 0);
  return { cash: rs(of("CASH")), bank: rs(of("BANK")) };
}
const stock = async (productId: string) => (await getCurrentStock(productId)) / 1000;

try {
  await base.$transaction(
    async (tx) => {
      current = tx;

      // --- fixture -----------------------------------------------------------
      for (const kind of ["CASH", "BANK"] as const) {
        if (!(await tx.moneyAccount.findFirst({ where: { kind } }))) await tx.moneyAccount.create({ data: { kind, name: kind } });
      }
      const product = await tx.product.create({ data: { code: `${TAG}-p`, name: `${TAG} fitting` } });
      await tx.stockMovement.create({ data: { productId: product.id, type: "ADJUST", qtyMilli: 100_000, unitCostPaisa: 1000 * RS, reason: TAG } });
      const newCustomer = (suffix: string, openingRs = 0) =>
        tx.customer.create({ data: { name: `${TAG} ${suffix}`, openingBalancePaisa: openingRs * RS } });

      // =====================================================================
      heading("1. The reported case: bill 50,000, 20,000 on credit, paid later, then voided");
      {
        const c = await newCustomer("reported");
        const a = await makeBill(tx, c, product.id, 1, 50_000, [{ method: "CASH", amountPaisa: 30_000 * RS }]);
        check("bill A owes 20,000 after billing", (await billOwing(tx, a.id)).owing, 20_000);
        await receivePayment(tx, c, 20_000 * RS);
        check("lump sum of 20,000 settles bill A", await billOwing(tx, a.id), { owing: 0, paidLater: 20_000 });
        check("voiding A goes through", (await voidBill(tx, a.id)).ok, true);
        check("the 20,000 stays as an advance held for the customer", await balance(c.id), -20_000);
        const b = await makeBill(tx, c, product.id, 1, 50_000, [{ method: "CASH", amountPaisa: 30_000 * RS }]);
        const bOwing = await billOwing(tx, b.id);
        info("new bill B — owing / settled from the advance", bOwing);
        check("the advance is consistent: balance after B equals B's owing", await balance(c.id), bOwing.owing);
        const st = (await buildStatement(c.id, { showVoided: true }))!;
        check("with 'Show voided bills', the statement lists bill A as a zero line", st.rows.some((r) => r.voided && r.kind === `Bill #${a.number}`), true);
        check("by default the statement notes it as hidden", (await buildStatement(c.id))!.voidedCount, 1);
      }

      // =====================================================================
      heading("1b. Reversing a payment entered by mistake");
      {
        const c = await newCustomer("reverse");
        const m0 = await cashBank();
        const bill = await makeBill(tx, c, product.id, 1, 30_000, []);
        const p = await receivePayment(tx, c, 30_000 * RS);
        check("payment settles the bill", (await billOwing(tx, bill.id)).owing, 0);
        check("reversal goes through", (await reverseCustomerPaymentTx(tx, p.id)).ok, true);
        check("the customer owes the 30,000 again", await balance(c.id), 30_000);
        check("the bill shows 30,000 owing again", (await billOwing(tx, bill.id)).owing, 30_000);
        check("cash book nets to zero (in, then back out)", (await cashBank()).cash - m0.cash, 0);
        check("the payment row is gone", await tx.payment.count({ where: { customerId: c.id } }), 0);
      }

      // =====================================================================
      heading("1c. Paying more than the customer owes is flagged");
      {
        check("no warning when paying exactly what is owed", overpaymentWarning("X", 10_000 * RS, 10_000 * RS), null);
        check("warning when it would leave an advance", overpaymentWarning("X", 10_000 * RS, 15_000 * RS) !== null, true);
        check("warning when the customer owes nothing", overpaymentWarning("X", 0, 1 * RS) !== null, true);
      }

      // =====================================================================
      heading("2. Voiding a bill that already has a return credited to the account");
      {
        const c = await newCustomer("void-after-return");
        const bill = await makeBill(tx, c, product.id, 2, 25_000, []); // all on credit
        await returnToAccount(tx, c.id, bill.id, product.id, 1, 25_000);
        check("after the return the customer owes 25,000", await balance(c.id), 25_000);
        const s0 = await stock(product.id);
        const fromMonth = new Date(Date.now() - 86_400_000), to = new Date(Date.now() + 86_400_000);
        const sales0 = (await getIncomeStatement(fromMonth, to)).statement.salesPaisa;
        const res = await voidBill(tx, bill.id);
        check("the void is refused while the bill has a return", res.ok, false);
        check("nothing changed: the customer still owes 25,000", await balance(c.id), 25_000);
        check("nothing changed: stock not put back a second time", await stock(product.id), s0);
        const sales1 = (await getIncomeStatement(fromMonth, to)).statement.salesPaisa;
        check("nothing changed: sales unchanged", rs(sales0 - sales1), 0);
      }

      // =====================================================================
      heading("3. A return against a bill that is already voided");
      {
        const c = await newCustomer("return-after-void");
        const bill = await makeBill(tx, c, product.id, 1, 10_000, []);
        await voidBill(tx, bill.id);
        const s0 = await stock(product.id);
        const res = await returnToAccount(tx, c.id, bill.id, product.id, 1, 10_000);
        check("the return is refused", res.error !== null, true);
        check("customer is not credited for goods on a voided bill", await balance(c.id), 0);
        check("stock does not come back twice", await stock(product.id), s0);
        const other = await newCustomer("someone-else");
        const live = await makeBill(tx, c, product.id, 1, 10_000, []);
        check("a return cannot be booked against another customer's bill", (await returnBillError(tx, other.id, live.id)) !== null, true);
      }

      // =====================================================================
      heading("4. A cheque taken on a bill bounces");
      {
        const c = await newCustomer("bounced-cheque");
        const bill = await makeBill(tx, c, product.id, 1, 40_000, [{ method: "CHEQUE", amountPaisa: 40_000 * RS, chequeNumber: "111", chequeBank: "HBL" }]);
        const chq = await tx.invoicePayment.findFirstOrThrow({ where: { invoiceId: bill.id } });
        await setCheque(tx, chq.chequeId!, "BOUNCED");
        check("customer owes the bounced 40,000 again", await balance(c.id), 40_000);
        check("the bill shows 40,000 owing again", (await billOwing(tx, bill.id)).owing, 40_000);
        const aging = (await getAging()).find((r) => r.customerId === c.id);
        check("aging lists the 40,000", rs(aging?.total ?? 0), 40_000);
      }

      // =====================================================================
      heading("5. Voiding a bill whose cheque has ALREADY cleared");
      {
        const c = await newCustomer("void-cleared-cheque");
        const m0 = await cashBank();
        const bill = await makeBill(tx, c, product.id, 1, 30_000, [{ method: "CHEQUE", amountPaisa: 30_000 * RS, chequeNumber: "222", chequeBank: "MCB" }]);
        const chq = await tx.invoicePayment.findFirstOrThrow({ where: { invoiceId: bill.id } });
        await setCheque(tx, chq.chequeId!, "CLEARED");
        check("cleared cheque puts 30,000 in the bank", (await cashBank()).bank - m0.bank, 30_000);
        await voidBill(tx, bill.id);
        const cheque = await tx.cheque.findUniqueOrThrow({ where: { id: chq.chequeId! } });
        check("register keeps the cheque as CLEARED (it really was paid)", cheque.status, "CLEARED");
        const bankKept = (await cashBank()).bank - m0.bank;
        const advance = -(await balance(c.id));
        check("money kept in bank is matched by the customer's advance", bankKept, advance);
      }

      // =====================================================================
      heading("6. Editing a bill whose cheque has ALREADY cleared");
      {
        const c = await newCustomer("edit-cleared-cheque");
        const m0 = await cashBank();
        const pay: Pay = { method: "CHEQUE", amountPaisa: 20_000 * RS, chequeNumber: "333", chequeBank: "UBL" };
        const bill = await makeBill(tx, c, product.id, 1, 20_000, [pay]);
        const chq = await tx.invoicePayment.findFirstOrThrow({ where: { invoiceId: bill.id } });
        await setCheque(tx, chq.chequeId!, "CLEARED");
        // billing/actions.ts editInvoice: guard first; only then reverse + rewrite.
        const blocked = await editBlocker(tx, bill.id);
        check("the edit is refused", blocked !== null, true);
        if (!blocked) {
          const old = await tx.invoicePayment.findMany({ where: { invoiceId: bill.id } });
          await reverseInvoiceMoney(tx, old, { note: "edited", chequeAction: "delete", date: bill.date });
          await tx.invoicePayment.deleteMany({ where: { invoiceId: bill.id } });
          await writeInvoicePayments(tx, { invoiceId: bill.id, invoiceNumber: bill.number, customerName: c.name, note: "edited" }, [pay]);
        }
        const pending = await tx.cheque.count({ where: { partyName: c.name, status: "PENDING" } });
        check("no new PENDING cheque for money that already cleared", pending, 0);
        check("bank still shows the 20,000 exactly once", (await cashBank()).bank - m0.bank, 20_000);
        const fresh = await makeBill(tx, c, product.id, 1, 5_000, [{ method: "CHEQUE", amountPaisa: 5_000 * RS, chequeNumber: "334" }]);
        check("a bill whose cheque is still PENDING can be edited", await editBlocker(tx, fresh.id), null);
      }

      // =====================================================================
      heading("7. Voiding a back-dated bill: cash book for that day");
      {
        const c = await newCustomer("backdated-void");
        const day = new Date("2019-03-07T00:00:00.000Z");
        const bill = await makeBill(tx, c, product.id, 1, 10_000, [{ method: "CASH", amountPaisa: 10_000 * RS }], day);
        await voidBill(tx, bill.id);
        const rev = await tx.moneyMovement.findFirstOrThrow({ where: { type: "VOID_REVERSAL", note: `Bill #${bill.number} voided` } });
        check("void reversal is dated the bill's day (so that day nets to zero)", rev.date.toISOString(), day.toISOString());
      }

      // =====================================================================
      heading("8. Customer with an advance (negative opening balance)");
      {
        const c = await newCustomer("advance", -10_000);
        const bill = await makeBill(tx, c, product.id, 1, 10_000, []);
        check("balance is 0 (advance used up)", await balance(c.id), 0);
        check("so the bill shows nothing owing", (await billOwing(tx, bill.id)).owing, 0);
        const aging = (await getAging()).find((r) => r.customerId === c.id);
        check("aging agrees: not listed as owing", aging?.total ?? 0, 0);
      }

      // =====================================================================
      heading("9. Receivables total vs customers who are in advance");
      {
        const t0 = rs(await getTotalReceivable());
        const owes = await newCustomer("owes");
        await makeBill(tx, owes, product.id, 1, 10_000, []);
        const ahead = await newCustomer("in-advance");
        await receivePayment(tx, ahead, 10_000 * RS);
        check("'Who owes me' grows by the 10,000 owed; an advance does not cancel it", rs(await getTotalReceivable()) - t0, 10_000);
      }

      // =====================================================================
      heading("10. Lump-sum payment by cheque");
      {
        const c = await newCustomer("cheque-lump-sum");
        await makeBill(tx, c, product.id, 1, 15_000, []);
        const p = await receivePayment(tx, c, 15_000 * RS, "CHEQUE");
        check("a cheque payment is entered in the cheque register (so it can clear or bounce)", p.chequeId !== null, true);
        check("while pending it counts as paid", await balance(c.id), 0);
        await setCheque(tx, p.chequeId!, "BOUNCED");
        check("when it bounces the customer owes the 15,000 again", await balance(c.id), 15_000);
      }

      // =====================================================================
      heading("11. Voiding a bill made from a quotation");
      {
        const c = await newCustomer("quotation");
        const bill = await makeBill(tx, c, product.id, 1, 8_000, []);
        const q = await tx.quotation.create({ data: { customerId: c.id, status: "ACCEPTED", invoiceId: bill.id, closedAt: new Date() } });
        await voidBill(tx, bill.id);
        const after = await tx.quotation.findUniqueOrThrow({ where: { id: q.id } });
        check("the quotation is open again, so it can be billed again", [after.status, after.invoiceId], ["OPEN", null]);
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
  console.error(`\n${failures} check(s) FAILED — each one is a bug:`);
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nAll checks passed.");
