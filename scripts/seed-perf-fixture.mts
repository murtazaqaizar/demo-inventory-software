/**
 * Seeds a LOCAL scratch database with receivables edge cases, so
 * `verify-receivables` has something meaningful to compare.
 *
 *   npm run fixture:seed
 *
 * Reads TEST_DATABASE_URL (never DATABASE_URL) and hard-refuses to run against
 * anything that isn't localhost — this must never touch Supabase.
 *
 * Wipes and rebuilds the receivables tables in the target DB each run.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error("TEST_DATABASE_URL is not set. Point it at your LOCAL postgres, e.g.");
  console.error('  TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/inventory_test"');
  process.exit(1);
}
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`REFUSING TO RUN: TEST_DATABASE_URL points at "${host}", not localhost.`);
  console.error("This script deletes data. It is only ever allowed to touch a local scratch DB.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

// Deterministic pseudo-random so runs are reproducible.
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

async function main() {
  console.log(`Seeding fixture into ${host}...`);

  // Order matters — children first.
  await prisma.creditNoteItem.deleteMany();
  await prisma.creditNote.deleteMany();
  await prisma.invoicePayment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.customerProductPrice.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.expense.deleteMany();

  const products = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      prisma.product.create({
        data: {
          code: `P${String(i + 1).padStart(4, "0")}`,
          name: `Product ${i + 1}`,
          // Spread thresholds so some products land at/below minimum and some don't.
          minStockMilli: int(0, 60) * 1000,
          latestCostPaisa: int(5_000, 40_000),
        },
      })
    )
  );

  // Customers spanning every shape the ledger has to handle.
  const shapes = [
    { name: "Zero everything", opening: 0, invoices: 0, lump: 0 },
    { name: "Opening balance only", opening: 250_000, invoices: 0, lump: 0 },
    { name: "Opening fully cleared by lump sum", opening: 150_000, invoices: 0, lump: 150_000 },
    { name: "Opening over-cleared (in credit)", opening: 100_000, invoices: 0, lump: 400_000 },
    { name: "Bills, never paid", opening: 0, invoices: 8, lump: 0 },
    { name: "Bills, partly paid at billing", opening: 0, invoices: 6, lump: 0, splitPay: true },
    { name: "Bills + lump sum eating oldest first", opening: 0, invoices: 10, lump: 900_000 },
    { name: "Opening + bills + lump + returns", opening: 300_000, invoices: 9, lump: 500_000, returns: 2 },
    { name: "Overpaid on every count", opening: 50_000, invoices: 4, lump: 5_000_000, returns: 1 },
    { name: "All bills voided", opening: 0, invoices: 5, voidAll: true },
    { name: "Samples only (zero-rated lines)", opening: 0, invoices: 3, samplesOnly: true },
    { name: "Cash refund returns (must NOT credit account)", opening: 0, invoices: 4, cashRefunds: 2 },
    { name: "Bill paid exactly in full at billing", opening: 0, invoices: 5, payInFull: true },
    { name: "Ancient bills (90+ day bucket)", opening: 0, invoices: 4, ageFrom: 120, ageTo: 400 },
    { name: "Bills straddling every aging bucket", opening: 0, invoices: 8, ageFrom: 1, ageTo: 200 },
  ];

  for (const [i, s] of shapes.entries()) {
    const customer = await prisma.customer.create({
      data: {
        name: `${String(i + 1).padStart(2, "0")} ${s.name}`,
        phone: `0300${String(1000000 + i)}`,
        openingBalancePaisa: s.opening,
        creditLimitPaisa: i % 3 === 0 ? 1_000_000 : 0,
        isCashCustomer: false,
      },
    });

    const madeInvoices: { id: string }[] = [];
    for (let n = 0; n < (s.invoices ?? 0); n++) {
      const lines = Array.from({ length: int(1, 4) }, () => {
        const p = pick(products);
        const quantity = int(1, 20);
        const rate = int(8_000, 60_000);
        return {
          productId: p.id,
          unit: "PIECE" as const,
          qtyMilli: quantity * 1000,
          ratePaisa: rate,
          unitCostPaisa: p.latestCostPaisa,
          // Sample lines are zero-rated — they must not appear as a charge.
          isSample: s.samplesOnly ? true : rnd() < 0.15,
        };
      });

      const total = lines.reduce((t, l) => t + (l.isSample ? 0 : (l.ratePaisa * l.qtyMilli) / 1000), 0);
      const paidNow = s.payInFull
        ? total
        : s.splitPay && total > 0
          ? Math.floor(total * (rnd() * 0.8))
          : 0;

      const inv = await prisma.invoice.create({
        data: {
          customerId: customer.id,
          date: daysAgo(int(s.ageFrom ?? 0, s.ageTo ?? 95)),
          method: paidNow > 0 ? "CASH" : "UDHAAR",
          status: s.voidAll ? "VOIDED" : "ACTIVE",
          voidReason: s.voidAll ? "fixture: voided bill must be excluded" : null,
          voidedAt: s.voidAll ? new Date() : null,
          items: { create: lines },
          ...(paidNow > 0
            ? { payments: { create: [{ method: "CASH" as const, amountPaisa: paidNow }] } }
            : {}),
        },
      });
      madeInvoices.push(inv);
    }

    if (s.lump) {
      // Split the lump sum across a few dates so FIFO allocation has work to do.
      const parts = int(1, 3);
      for (let k = 0; k < parts; k++) {
        await prisma.payment.create({
          data: {
            customerId: customer.id,
            amountPaisa: Math.floor(s.lump / parts),
            method: pick(["CASH", "ONLINE", "CHEQUE"] as const),
            date: daysAgo(int(0, 60)),
          },
        });
      }
    }

    for (let r = 0; r < (s.returns ?? 0) + (s.cashRefunds ?? 0); r++) {
      const isCash = r >= (s.returns ?? 0);
      const p = pick(products);
      const quantity = int(1, 5);
      await prisma.creditNote.create({
        data: {
          customerId: customer.id,
          invoiceId: madeInvoices[0]?.id ?? null,
          date: daysAgo(int(0, 50)),
          refundMethod: isCash ? "CASH_REFUND" : "CREDIT_TO_ACCOUNT",
          reason: isCash ? "fixture: cash refund" : "fixture: credited to account",
          items: {
            create: [
              {
                productId: p.id,
                unit: "PIECE",
                qtyMilli: quantity * 1000,
                ratePaisa: int(8_000, 60_000),
                unitCostPaisa: p.latestCostPaisa,
              },
            ],
          },
        },
      });
    }
  }

  // The walk-in cash customer must be excluded from aging but included in ledgers.
  const cash = await prisma.customer.create({
    data: { name: "Cash Sale", isCashCustomer: true, openingBalancePaisa: 0 },
  });
  for (let n = 0; n < 5; n++) {
    const p = pick(products);
    await prisma.invoice.create({
      data: {
        customerId: cash.id,
        date: daysAgo(int(0, 40)),
        method: "CASH",
        status: "ACTIVE",
        items: {
          create: [
            { productId: p.id, unit: "PIECE", qtyMilli: 3_000, ratePaisa: 25_000, unitCostPaisa: p.latestCostPaisa },
          ],
        },
      },
    });
  }

  // Bulk volume so the timing comparison means something.
  const bulk = await prisma.customer.create({
    data: { name: "ZZ Bulk history", openingBalancePaisa: 0 },
  });
  const bulkCount = Number(process.env.FIXTURE_BULK ?? 400);
  for (let n = 0; n < bulkCount; n++) {
    const p = pick(products);
    const quantity = int(1, 10);
    const rate = int(8_000, 60_000);
    const total = rate * quantity;
    await prisma.invoice.create({
      data: {
        customerId: bulk.id,
        date: daysAgo(int(0, 700)),
        method: "UDHAAR",
        status: "ACTIVE",
        items: { create: [{ productId: p.id, unit: "PIECE", qtyMilli: quantity * 1000, ratePaisa: rate, unitCostPaisa: p.latestCostPaisa }] },
        ...(rnd() < 0.5
          ? { payments: { create: [{ method: "CASH" as const, amountPaisa: Math.floor(total * rnd()) }] } }
          : {}),
      },
    });
  }

  // Stock movements so low-stock has real deltas to sum — including one product
  // driven negative and one with no movements at all (qty 0 via LEFT JOIN).
  for (const [i, p] of products.entries()) {
    if (i === products.length - 1) continue; // leave the last one with no movements
    const moves = int(2, 6);
    for (let m = 0; m < moves; m++) {
      const isIn = rnd() < 0.55;
      await prisma.stockMovement.create({
        data: {
          productId: p.id,
          type: isIn ? "PURCHASE_IN" : "SALE_OUT",
          qtyMilli: (isIn ? int(10, 120) : -int(10, 90)) * 1000,
          reason: "fixture",
        },
      });
    }
  }

  // Expenses land in the income statement.
  for (const cat of ["electricity", "labour", "transport", "salaries", "water"]) {
    await prisma.expense.create({
      data: { category: cat, amountPaisa: int(20_000, 900_000), date: daysAgo(int(0, 120)), note: "fixture" },
    });
  }

  const counts = {
    customers: await prisma.customer.count(),
    invoices: await prisma.invoice.count(),
    activeInvoices: await prisma.invoice.count({ where: { status: "ACTIVE" } }),
    invoiceItems: await prisma.invoiceItem.count(),
    invoicePayments: await prisma.invoicePayment.count(),
    payments: await prisma.payment.count(),
    creditNotes: await prisma.creditNote.count(),
  };
  console.table(counts);
  console.log("Fixture ready. Now run: npm run verify:receivables");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
