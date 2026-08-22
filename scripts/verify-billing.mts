/**
 * Verification for the billing effects — the writes a bill makes beyond its own
 * row (stock, last-price memory, cheques, money, payment rows).
 *
 *   npm run verify:billing
 *
 * These helpers were extracted from billing/actions.ts and rewritten to batch
 * their writes, because the per-line version cost one round-trip per line and
 * that is what blew Prisma's 5s transaction limit on purchases (P2028). This
 * script proves the rewrite behaves identically AND that the cost is flat.
 *
 * Runs the REAL shipped functions from src/lib/billing-effects.ts against the
 * real database inside ONE interactive transaction that is always rolled back.
 *
 * NOT covered: the actions' auth/validation and the UI. Actions live in
 * "use server" files a script cannot import.
 */
import "dotenv/config";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(new URL(url!).hostname);
process.env.DATABASE_URL = url;

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  }),
  log: [{ emit: "event", level: "query" }],
});

let queryCount = 0;
prisma.$on("query", () => {
  queryCount++;
});

const {
  writeSaleStock,
  writeLastPrices,
  writeInvoicePayments,
  reverseInvoiceMoney,
  writeVoidRestock,
} = await import("../src/lib/billing-effects.js");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  PASS  ${label} = ${a}`);
  else {
    failures++;
    console.error(`  FAIL  ${label}\n        expected ${e}\n        got      ${a}`);
  }
}

const TAG = `vbill-${Date.now()}`;
class Rollback extends Error {}
type Tx = Prisma.TransactionClient;

const line = (productId: string, over: Partial<Record<string, unknown>> = {}) => ({
  productId,
  unit: "PIECE" as const,
  quantity: 1,
  pieces: 10,
  ratePaisa: 15_000,
  unitCostPaisa: 10_000,
  isSample: false,
  ...over,
});

async function movementsFor(tx: Tx, invoiceId: string) {
  return tx.stockMovement.findMany({ where: { invoiceId }, orderBy: { createdAt: "asc" } });
}

try {
  await prisma.$transaction(
    async (tx) => {
      // --- fixture ---------------------------------------------------------
      const customer = await tx.customer.create({ data: { name: `${TAG} customer` } });
      const p1 = await tx.product.create({ data: { code: `${TAG}-1`, name: `${TAG} one` } });
      const p2 = await tx.product.create({ data: { code: `${TAG}-2`, name: `${TAG} two` } });
      const invoice = await tx.invoice.create({ data: { customerId: customer.id } });

      // Money accounts are seeded per install; make sure both exist for the run.
      for (const kind of ["CASH", "BANK"] as const) {
        const found = await tx.moneyAccount.findFirst({ where: { kind } });
        if (!found) await tx.moneyAccount.create({ data: { kind, name: kind } });
      }

      // --- 1. stock out ----------------------------------------------------
      console.log("\n1. Stock leaving on a bill");
      await writeSaleStock(tx, invoice.id, [
        line(p1.id),
        line(p2.id, { pieces: 4, isSample: true, ratePaisa: 0 }),
      ]);
      const moves = await movementsFor(tx, invoice.id);
      check("one movement per line", moves.length, 2);
      check(
        "sale leaves stock, negative",
        moves.filter((m) => m.type === "SALE_OUT").map((m) => m.piecesDelta),
        [-10]
      );
      check(
        "a free sample is SAMPLE_OUT but still carries its cost",
        moves.filter((m) => m.type === "SAMPLE_OUT").map((m) => [m.piecesDelta, m.unitCostPaisa]),
        [[-4, 10_000]]
      );

      // --- 2. last-price memory --------------------------------------------
      console.log("\n2. Last-price memory");
      await writeLastPrices(tx, customer.id, [
        line(p1.id, { ratePaisa: 15_000 }),
        line(p2.id, { isSample: true, ratePaisa: 0 }), // free — must not be remembered
      ]);
      const prices1 = await tx.customerProductPrice.findMany({ where: { customerId: customer.id } });
      check("only the priced line is remembered", prices1.length, 1);
      check("at the rate it was sold", prices1[0]?.lastRatePaisa, 15_000);

      // Selling again at a new rate must overwrite, not duplicate — the unique
      // key is (customer, product), so a stale row would break the next bill.
      await writeLastPrices(tx, customer.id, [line(p1.id, { ratePaisa: 17_500 })]);
      const prices2 = await tx.customerProductPrice.findMany({ where: { customerId: customer.id } });
      check("re-selling overwrites rather than duplicating", prices2.length, 1);
      check("and remembers the newer rate", prices2[0]?.lastRatePaisa, 17_500);

      // The same product twice on one bill: the last line entered wins.
      await writeLastPrices(tx, customer.id, [
        line(p1.id, { ratePaisa: 20_000 }),
        line(p1.id, { ratePaisa: 21_000 }),
      ]);
      check(
        "same product twice on a bill — last line wins",
        (await tx.customerProductPrice.findFirstOrThrow({
          where: { customerId: customer.id, productId: p1.id },
        })).lastRatePaisa,
        21_000
      );

      // --- 3. payments ------------------------------------------------------
      console.log("\n3. Payments taken at billing time");
      const cashAcc = await tx.moneyAccount.findFirstOrThrow({ where: { kind: "CASH" } });
      const cashBefore = await tx.moneyMovement.count({ where: { accountId: cashAcc.id } });

      await writeInvoicePayments(
        tx,
        {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          customerName: customer.name,
          note: `Invoice #${invoice.number}`,
        },
        [
          { method: "CASH", amountPaisa: 50_000 },
          { method: "CHEQUE", amountPaisa: 30_000, chequeNumber: "CHQ-1", chequeBank: "HBL" },
        ]
      );

      const payments = await tx.invoicePayment.findMany({ where: { invoiceId: invoice.id } });
      check("a payment row per payment", payments.length, 2);
      check(
        "cash moved the cash account",
        (await tx.moneyMovement.count({ where: { accountId: cashAcc.id } })) - cashBefore,
        1
      );

      const chequePayment = payments.find((p) => p.method === "CHEQUE");
      check("the cheque payment is linked to a cheque", Boolean(chequePayment?.chequeId), true);
      const cheque = await tx.cheque.findUniqueOrThrow({ where: { id: chequePayment!.chequeId! } });
      check("cheque is pending and received, not banked yet", [cheque.status, cheque.direction], [
        "PENDING",
        "RECEIVED",
      ]);
      check("cheque carries its own amount", cheque.amountPaisa, 30_000);
      check(
        "the cash payment is not linked to any cheque",
        payments.find((p) => p.method === "CASH")?.chequeId,
        null
      );

      // --- 4. reversing an edit ---------------------------------------------
      // Editing a bill: the cheque it created was never real, so it goes away.
      console.log("\n4. Reversing money when a bill is edited");
      await reverseInvoiceMoney(tx, payments, { note: "edited", chequeAction: "delete" });
      check(
        "the cheque is gone",
        await tx.cheque.count({ where: { id: chequePayment!.chequeId! } }),
        0
      );
      check(
        "cash was reversed by a negative movement",
        (await tx.moneyMovement.findFirstOrThrow({
          where: { accountId: cashAcc.id, type: "VOID_REVERSAL" },
          orderBy: { date: "desc" },
        })).amountPaisa,
        -50_000
      );

      // --- 5. voiding --------------------------------------------------------
      // Voiding is different: the cheque really existed, so it is bounced, not
      // deleted, and the stock comes back with positive movements.
      console.log("\n5. Voiding a bill");
      const inv2 = await tx.invoice.create({ data: { customerId: customer.id } });
      await writeInvoicePayments(
        tx,
        { invoiceId: inv2.id, invoiceNumber: inv2.number, customerName: customer.name, note: "n" },
        [{ method: "CHEQUE", amountPaisa: 12_000, chequeNumber: "CHQ-2", chequeBank: "MCB" }]
      );
      const pay2 = await tx.invoicePayment.findMany({ where: { invoiceId: inv2.id } });
      await reverseInvoiceMoney(tx, pay2, { note: "voided", chequeAction: "bounce" });
      check(
        "the cheque is bounced, not deleted",
        (await tx.cheque.findUniqueOrThrow({ where: { id: pay2[0]!.chequeId! } })).status,
        "BOUNCED"
      );

      await writeVoidRestock(tx, inv2.id, inv2.number, [
        { productId: p1.id, pieces: 10, unitCostPaisa: 10_000 },
      ]);
      check(
        "voided stock comes back in, positive",
        (await movementsFor(tx, inv2.id)).map((m) => m.piecesDelta),
        [10]
      );

      // --- 7. cost is flat, not per line ------------------------------------
      async function billCost(lineCount: number, paymentCount: number) {
        const inv = await tx.invoice.create({ data: { customerId: customer.id } });
        const prods = await Promise.all(
          Array.from({ length: lineCount }, (_, i) =>
            tx.product.create({
              data: { code: `${TAG}-B${lineCount}-${i}`, name: `${TAG} bulk ${lineCount}-${i}` },
            })
          )
        );
        const lines = prods.map((p) => line(p.id));
        const pays = Array.from({ length: paymentCount }, () => ({
          method: "CASH" as const,
          amountPaisa: 1_000,
        }));

        const before = queryCount;
        await writeSaleStock(tx, inv.id, lines);
        await writeLastPrices(tx, customer.id, lines);
        await writeInvoicePayments(
          tx,
          { invoiceId: inv.id, invoiceNumber: inv.number, customerName: customer.name, note: "n" },
          pays
        );
        return queryCount - before;
      }

      // --- 6. a backdated bill lands whole on its own day --------------------
      // A bill written up days after the goods went out must put its CASH on the
      // sale's date, not on the day it was typed in — otherwise the cash book
      // and the income statement disagree for both months. (Stock needs nothing:
      // a movement has no date, and the cost side is read off the invoice line.)
      console.log("\n6. Backdating a bill");
      const backDay = new Date("2019-03-07T00:00:00.000Z");
      const inv3 = await tx.invoice.create({ data: { customerId: customer.id, date: backDay } });
      await writeSaleStock(tx, inv3.id, [line(p1.id)]);
      await writeInvoicePayments(
        tx,
        {
          invoiceId: inv3.id,
          invoiceNumber: inv3.number,
          customerName: customer.name,
          note: `${TAG} backdated`,
          date: backDay,
        },
        [
          { method: "CASH", amountPaisa: 5_000 },
          { method: "CHEQUE", amountPaisa: 2_000, chequeNumber: "CHQ-3", chequeBank: "UBL" },
        ]
      );
      check(
        "the sale's stock still leaves the shelf",
        (await movementsFor(tx, inv3.id)).map((m) => m.piecesDelta),
        [-10]
      );
      check(
        "the cash receipt is dated the same day",
        (await tx.moneyMovement.findFirstOrThrow({
          where: { note: `${TAG} backdated`, type: "SALE_RECEIPT" },
        })).date.toISOString(),
        backDay.toISOString()
      );
      const backPays = await tx.invoicePayment.findMany({ where: { invoiceId: inv3.id } });
      check(
        "a cheque with no date of its own falls back to the bill's date",
        (await tx.cheque.findUniqueOrThrow({
          where: { id: backPays.find((p) => p.method === "CHEQUE")!.chequeId! },
        })).chequeDate.toISOString(),
        backDay.toISOString()
      );

      // Editing reverses in the ORIGINAL day so that day's cash book still nets
      // to zero; leaving the reversal on today would short one day and inflate
      // the other.
      await reverseInvoiceMoney(tx, backPays, {
        note: `${TAG} backdated edit`,
        chequeAction: "delete",
        date: backDay,
      });
      check(
        "the reversal is dated the day the money was taken",
        (await tx.moneyMovement.findFirstOrThrow({ where: { note: `${TAG} backdated edit` } })).date.toISOString(),
        backDay.toISOString()
      );
      const cashOnBackDay = await tx.moneyMovement.aggregate({
        where: { date: backDay, note: { in: [`${TAG} backdated`, `${TAG} backdated edit`] } },
        _sum: { amountPaisa: true },
      });
      check("so the day nets to zero after the edit", cashOnBackDay._sum.amountPaisa, 0);

      // Leaving the date alone must behave exactly as it did before the field
      // existed — no date passed means the column's now() default, so today's
      // bills keep their clock time and still sort in the order they were
      // entered (the billing list orders on `date` alone).
      const beforeNow = Date.now();
      const inv4 = await tx.invoice.create({ data: { customerId: customer.id } });
      await writeInvoicePayments(
        tx,
        {
          invoiceId: inv4.id,
          invoiceNumber: inv4.number,
          customerName: customer.name,
          note: `${TAG} undated`,
        },
        [{ method: "CASH", amountPaisa: 1_000 }]
      );
      const nowMove = await tx.moneyMovement.findFirstOrThrow({ where: { note: `${TAG} undated` } });
      check(
        "no date given — the cash entry is stamped now, keeping its clock time",
        Math.abs(nowMove.date.getTime() - beforeNow) < 120_000,
        true
      );

      console.log("\n7. Work per bill is flat, not per-line");
      const small = await billCost(2, 1);
      const large = await billCost(10, 4);
      console.log(`        (2 lines/1 payment: ${small} · 10 lines/4 payments: ${large})`);
      check("a 10-line bill costs the same as a 2-line one", large, small);
      check("and that cost is a small constant", small <= 8, true);

      throw new Rollback();
    },
    { maxWait: 15_000, timeout: 90_000 }
  );
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

const leftover = await prisma.customer.count({ where: { name: { startsWith: "vbill-" } } });
check("\nno fixture data left behind", leftover, 0);

await prisma.$disconnect();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
