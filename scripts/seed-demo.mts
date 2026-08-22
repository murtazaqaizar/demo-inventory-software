/**
 * Seeds this instance's database with a small, believable set of INVENTED data,
 * so a demo has something on every page instead of empty tables.
 *
 *   npm run demo:seed
 *
 * Everything here is made up. No real customer, supplier or product from any
 * other instance of this software may ever be copied in — see the guide.
 *
 * Safe to re-run: it clears the business data first and rebuilds it, so the demo
 * can be reset after someone has clicked around in it.
 *
 * Guard: refuses to run against the other client's database, or against any
 * database whose URL is not the one in this project's .env.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

// The other client's Supabase project. This script deletes data; it must never
// be pointed there by a stale shell or a copy-pasted connection string.
const FORBIDDEN_REFS = ["xipmvujbzkptjziqdbyw"];
const host = new URL(url).hostname;
for (const ref of FORBIDDEN_REFS) {
  if (host.includes(ref)) {
    console.error(`REFUSING TO RUN: DATABASE_URL points at ${host}, which is another client's database.`);
    process.exit(1);
  }
}
console.log(`Seeding demo data into ${host} ...`);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } }),
});

// Deterministic, so two runs of the demo look the same.
let s = 7;
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const rupees = (r: number) => Math.round(r * 100); // paisa is the storage unit everywhere
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

async function wipe() {
  // Children before parents.
  await prisma.creditNoteItem.deleteMany();
  await prisma.creditNote.deleteMany();
  await prisma.invoicePayment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.cheque.deleteMany();
  await prisma.customerProductPrice.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.supplierLedgerEntry.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.moneyMovement.deleteMany();
  await prisma.moneyAccount.deleteMany();
  await prisma.product.deleteMany();

  // Bill and purchase numbers are what the shop actually reads. After a reset the
  // demo should open at #1, not carry on from the last run's sequence.
  for (const [table, col] of [["Invoice", "number"], ["Purchase", "number"]] as const) {
    await prisma.$queryRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', '${col}'), 1, false)`
    );
  }
}

async function main() {
  await wipe();

  // --- Who the demo shop is ------------------------------------------------
  await prisma.businessSettings.upsert({
    where: { id: "default" },
    update: {
      name: "Demo Traders",
      tagline: "Hardware · Tools · Industrial Supplies",
      address: "Shop 12, Main Bazaar, Lahore",
      phone: "0300-0000000",
      mode: "NONE",
    },
    create: {
      id: "default",
      name: "Demo Traders",
      tagline: "Hardware · Tools · Industrial Supplies",
      address: "Shop 12, Main Bazaar, Lahore",
      phone: "0300-0000000",
      mode: "NONE",
    },
  });

  // --- Logins --------------------------------------------------------------
  const [ownerPass, staffPass] = await Promise.all([
    bcrypt.hash("demo1234", 10),
    bcrypt.hash("demo1234", 10),
  ]);
  await prisma.user.upsert({
    where: { username: "owner" },
    update: { passwordHash: ownerPass, role: "OWNER", name: "Owner" },
    create: { name: "Owner", username: "owner", passwordHash: ownerPass, role: "OWNER" },
  });
  await prisma.user.upsert({
    where: { username: "staff" },
    update: { passwordHash: staffPass, role: "STAFF", name: "Counter Staff" },
    create: { name: "Counter Staff", username: "staff", passwordHash: staffPass, role: "STAFF" },
  });

  // --- Money accounts ------------------------------------------------------
  const cash = await prisma.moneyAccount.create({ data: { name: "Cash in Hand", kind: "CASH" } });
  const bank = await prisma.moneyAccount.create({ data: { name: "Bank", kind: "BANK" } });

  // Opening float, so the drawer isn't zero on day one. It has to cover the cash
  // purchase, the salaries, the rent and the drawing below, or the demo opens on a
  // negative cash balance and looks broken.
  await prisma.moneyMovement.createMany({
    data: [
      { accountId: cash.id, type: "ADJUST", amountPaisa: rupees(220_000), note: "Opening cash in hand", date: daysAgo(60) },
      { accountId: bank.id, type: "ADJUST", amountPaisa: rupees(250_000), note: "Opening bank balance", date: daysAgo(60) },
    ],
  });

  // --- Products ------------------------------------------------------------
  const productSpecs = [
    { code: "PRD-0001", name: "Cutting Disc", size: "4 inch", variant: "1.0mm", box: 25, carton: 200, min: 50, cost: 45 },
    { code: "PRD-0002", name: "Grinding Disc", size: "4 inch", variant: "6.0mm", box: 10, carton: 100, min: 20, cost: 90 },
    { code: "PRD-0003", name: "Flap Disc", size: "4 inch", variant: "80 grit", box: 10, carton: 100, min: 20, cost: 120 },
    // Reorder level set above the stock on hand, so the low-stock warning has a
    // real example to show. The sell guard below then leaves it alone.
    { code: "PRD-0004", name: "Hacksaw Blade", size: "12 inch", variant: "24 TPI", box: 12, carton: 144, min: 120, cost: 65 },
    { code: "PRD-0005", name: "Drill Bit Set", size: "1-10mm", variant: "HSS, 13 pc", box: 6, carton: 60, min: 10, cost: 850 },
    { code: "PRD-0006", name: "Measuring Tape", size: "5 metre", variant: "Steel", box: 12, carton: 120, min: 24, cost: 320 },
    { code: "PRD-0007", name: "Safety Gloves", size: "Large", variant: "Cotton, pair", box: 20, carton: 200, min: 40, cost: 150 },
    { code: "PRD-0008", name: "Welding Rod", size: "2.5mm", variant: "5 kg pack", box: 4, carton: 40, min: 8, cost: 1_450 },
  ];
  const products = [];
  for (const p of productSpecs) {
    products.push(
      await prisma.product.create({
        data: {
          code: p.code,
          name: p.name,
          size: p.size,
          variant: p.variant,
          piecesPerBox: p.box,
          piecesPerCarton: p.carton,
          minStockLevel: p.min,
          latestCostPaisa: rupees(p.cost),
        },
      })
    );
  }

  // Opening stock count. One product is deliberately left thin so the low-stock
  // warning has something to fire on. `stockLeft` then tracks every piece in and
  // out below, because a demo that shows negative stock reads as a broken app.
  const stockLeft = new Map<string, number>();
  for (const [i, p] of products.entries()) {
    const opening = i === 3 ? 60 : int(400, 900);
    stockLeft.set(p.id, opening);
    await prisma.stockMovement.create({
      data: {
        productId: p.id,
        type: "ADJUST",
        piecesDelta: opening,
        unitCostPaisa: p.latestCostPaisa,
        reason: "Opening stock count",
        createdAt: daysAgo(60),
      },
    });
  }

  // --- Suppliers and two purchases ----------------------------------------
  const supplierA = await prisma.supplier.create({
    data: { name: "Sample Supplier Co.", phone: "0300-1111111", notes: "Local wholesaler" },
  });
  const supplierB = await prisma.supplier.create({
    data: { name: "Demo Imports (Pvt) Ltd", phone: "0300-2222222", notes: "Import consignments" },
  });

  // Cash purchase, local, no landed cost.
  const cashPurchase = await prisma.purchase.create({
    data: { supplierId: supplierA.id, date: daysAgo(21), isImport: false, onCredit: false, notes: "Counter stock top-up" },
  });
  let cashPurchaseTotal = 0;
  for (const p of products.slice(0, 3)) {
    const pieces = 100;
    const unit = p.latestCostPaisa;
    cashPurchaseTotal += pieces * unit;
    await prisma.purchaseItem.create({
      data: { purchaseId: cashPurchase.id, productId: p.id, pieces, supplierUnitCostPaisa: unit, landedUnitCostPaisa: unit },
    });
    await prisma.stockMovement.create({
      data: { productId: p.id, type: "PURCHASE_IN", piecesDelta: pieces, unitCostPaisa: unit, purchaseId: cashPurchase.id, createdAt: daysAgo(21) },
    });
    stockLeft.set(p.id, (stockLeft.get(p.id) ?? 0) + pieces);
  }
  await prisma.moneyMovement.create({
    data: { accountId: cash.id, type: "SUPPLIER_PAYMENT", amountPaisa: -cashPurchaseTotal, note: `Purchase #${cashPurchase.number} — ${supplierA.name}`, date: daysAgo(21) },
  });

  // Credit import purchase with landed cost, so the payable and the by-value
  // allocation both have something to show.
  const freight = rupees(18_000);
  const duty = rupees(26_000);
  const creditPurchase = await prisma.purchase.create({
    data: {
      supplierId: supplierB.id,
      date: daysAgo(12),
      isImport: true,
      onCredit: true,
      freightPaisa: freight,
      dutyPaisa: duty,
      notes: "Import consignment, payment due",
    },
  });
  const importLines = products.slice(4, 7).map((p) => ({ p, pieces: 60, unit: p.latestCostPaisa }));
  const goodsValue = importLines.reduce((t, l) => t + l.pieces * l.unit, 0);
  const extras = freight + duty;
  for (const l of importLines) {
    const lineValue = l.pieces * l.unit;
    // BY VALUE allocation — each line's share of the extras is its share of goods value.
    const share = Math.round((extras * lineValue) / goodsValue);
    const landed = l.unit + Math.round(share / l.pieces);
    await prisma.purchaseItem.create({
      data: { purchaseId: creditPurchase.id, productId: l.p.id, pieces: l.pieces, supplierUnitCostPaisa: l.unit, landedUnitCostPaisa: landed },
    });
    await prisma.stockMovement.create({
      data: { productId: l.p.id, type: "PURCHASE_IN", piecesDelta: l.pieces, unitCostPaisa: landed, purchaseId: creditPurchase.id, createdAt: daysAgo(12) },
    });
    stockLeft.set(l.p.id, (stockLeft.get(l.p.id) ?? 0) + l.pieces);
    // Latest-cost method: the newest landed cost becomes the product's cost.
    await prisma.product.update({ where: { id: l.p.id }, data: { latestCostPaisa: landed } });
    l.p.latestCostPaisa = landed;
  }
  await prisma.supplierLedgerEntry.create({
    data: {
      supplierId: supplierB.id,
      direction: "CHARGE",
      amountPaisa: goodsValue + extras,
      note: `Purchase #${creditPurchase.number}`,
      date: daysAgo(12),
      purchaseId: creditPurchase.id,
    },
  });
  // Part-paid, so the payables page shows a running balance rather than a settled one.
  const partPayment = rupees(100_000);
  await prisma.supplierLedgerEntry.create({
    data: { supplierId: supplierB.id, direction: "PAYMENT", amountPaisa: partPayment, note: "On account", date: daysAgo(5) },
  });
  await prisma.moneyMovement.create({
    data: { accountId: bank.id, type: "SUPPLIER_PAYMENT", amountPaisa: -partPayment, note: `On account — ${supplierB.name}`, date: daysAgo(5) },
  });

  // --- Customers -----------------------------------------------------------
  const cashCustomer = await prisma.customer.create({ data: { name: "Cash Sale", isCashCustomer: true } });
  const customerSpecs = [
    { name: "Demo Hardware Store", phone: "0301-1111111", opening: rupees(35_000), limit: rupees(200_000) },
    { name: "Sample Builders", phone: "0301-2222222", opening: 0, limit: 0 },
    { name: "Test Engineering Works", phone: "0301-3333333", opening: rupees(12_500), limit: rupees(100_000) },
    { name: "Example Motors", phone: "0301-4444444", opening: 0, limit: 0 },
  ];
  const customers = [];
  for (const c of customerSpecs) {
    customers.push(
      await prisma.customer.create({
        data: { name: c.name, phone: c.phone, openingBalancePaisa: c.opening, creditLimitPaisa: c.limit },
      })
    );
  }

  // --- Bills ---------------------------------------------------------------
  // A spread of shapes: paid in full, part-paid, pure udhaar, a walk-in cash
  // sale, and one with a free sample line.
  const billShapes: { customer: { id: string }; days: number; pay: "FULL" | "PART" | "NONE"; method: "CASH" | "ONLINE" | "UDHAAR"; lines: number; sample?: boolean }[] = [
    { customer: customers[0], days: 18, pay: "FULL" as const, method: "CASH" as const, lines: 2 },
    { customer: customers[1], days: 15, pay: "NONE" as const, method: "UDHAAR" as const, lines: 3 },
    { customer: cashCustomer, days: 12, pay: "FULL" as const, method: "CASH" as const, lines: 1 },
    { customer: customers[2], days: 9, pay: "PART" as const, method: "CASH" as const, lines: 2 },
    { customer: customers[0], days: 7, pay: "FULL" as const, method: "ONLINE" as const, lines: 2 },
    { customer: customers[3], days: 5, pay: "NONE" as const, method: "UDHAAR" as const, lines: 2, sample: true },
    { customer: customers[1], days: 3, pay: "FULL" as const, method: "CASH" as const, lines: 3 },
    { customer: cashCustomer, days: 1, pay: "FULL" as const, method: "CASH" as const, lines: 2 },
  ];

  // A month of counter trade on top of the hand-picked shapes above. Without this
  // the income statement shows a loss — one month of salaries and rent against
  // eight bills — which is a property of the demo, not of the software.
  const payShapes = ["FULL", "FULL", "FULL", "PART", "NONE"] as const;
  const methods = ["CASH", "CASH", "CASH", "ONLINE"] as const;
  const everyone = [...customers, cashCustomer];
  for (let i = 0; i < 22; i++) {
    const pay = payShapes[int(0, payShapes.length - 1)];
    billShapes.push({
      customer: everyone[int(0, everyone.length - 1)],
      days: int(2, 27),
      pay,
      method: pay === "NONE" ? "UDHAAR" : methods[int(0, methods.length - 1)],
      lines: int(1, 3),
    });
  }
  billShapes.sort((a, b) => b.days - a.days);

  for (const b of billShapes) {
    const date = daysAgo(b.days);
    const chosen = [];
    for (let i = 0; i < b.lines; i++) {
      const p = products[int(0, products.length - 1)];
      if (chosen.some((c) => c.p.id === p.id)) continue;
      const available = stockLeft.get(p.id) ?? 0;
      // Leave the thin product thin: never sell it down past its minimum level.
      const sellable = Math.min(30, available - p.minStockLevel);
      if (sellable < 4) continue;
      const pieces = int(4, sellable);
      // Sell at a margin over the latest cost.
      const rate = Math.round((p.latestCostPaisa * (120 + int(5, 45))) / 100);
      chosen.push({ p, pieces, rate });
    }
    if (chosen.length === 0) continue;

    const invoice = await prisma.invoice.create({
      data: { customerId: b.customer.id, date, method: b.method, status: "ACTIVE", notes: null },
    });

    let total = 0;
    for (const [i, l] of chosen.entries()) {
      const isSample = Boolean(b.sample) && i === chosen.length - 1;
      await prisma.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          productId: l.p.id,
          unit: "PIECE",
          quantity: l.pieces,
          pieces: l.pieces,
          ratePaisa: isSample ? 0 : l.rate,
          unitCostPaisa: l.p.latestCostPaisa,
          isSample,
        },
      });
      await prisma.stockMovement.create({
        data: {
          productId: l.p.id,
          type: isSample ? "SAMPLE_OUT" : "SALE_OUT",
          piecesDelta: -l.pieces,
          unitCostPaisa: l.p.latestCostPaisa,
          invoiceId: invoice.id,
          createdAt: date,
        },
      });
      await prisma.customerProductPrice.upsert({
        where: { customerId_productId: { customerId: b.customer.id, productId: l.p.id } },
        update: { lastRatePaisa: isSample ? 0 : l.rate, lastUnit: "PIECE" },
        create: { customerId: b.customer.id, productId: l.p.id, lastRatePaisa: isSample ? 0 : l.rate, lastUnit: "PIECE" },
      });
      stockLeft.set(l.p.id, (stockLeft.get(l.p.id) ?? 0) - l.pieces);
      if (!isSample) total += l.rate * l.pieces;
    }

    const received = b.pay === "FULL" ? total : b.pay === "PART" ? Math.round(total / 2) : 0;
    if (received > 0) {
      await prisma.invoicePayment.create({
        data: { invoiceId: invoice.id, method: b.method === "UDHAAR" ? "CASH" : b.method, amountPaisa: received },
      });
      await prisma.moneyMovement.create({
        data: {
          accountId: b.method === "ONLINE" ? bank.id : cash.id,
          type: "SALE_RECEIPT",
          amountPaisa: received,
          note: `Bill #${invoice.number}`,
          date,
        },
      });
    }
  }

  // A lump-sum payment against an old balance (feature 21).
  const lump = rupees(20_000);
  await prisma.payment.create({
    data: { customerId: customers[0].id, amountPaisa: lump, method: "CASH", note: "On account", date: daysAgo(4) },
  });
  await prisma.moneyMovement.create({
    data: { accountId: cash.id, type: "CUSTOMER_PAYMENT", amountPaisa: lump, note: `On account — ${customers[0].name}`, date: daysAgo(4) },
  });

  // --- Expenses ------------------------------------------------------------
  // Each expense is two writes: the Expense row, and the money leaving the cash
  // account. Balances are the running sum of movements, never a stored number.
  const expenses = [
    { category: "Electricity", amount: rupees(8_400), note: "Monthly bill", days: 20 },
    { category: "Salaries", amount: rupees(60_000), note: "Staff salary", days: 15 },
    { category: "Transport", amount: rupees(3_200), note: "Delivery charges", days: 8 },
    { category: "Storage / Rent", amount: rupees(35_000), note: "Shop rent", days: 6 },
  ];
  for (const e of expenses) {
    await prisma.expense.create({
      data: { category: e.category, amountPaisa: e.amount, note: e.note, date: daysAgo(e.days) },
    });
    await prisma.moneyMovement.create({
      data: { accountId: cash.id, type: "EXPENSE", amountPaisa: -e.amount, note: `${e.category} — ${e.note}`, date: daysAgo(e.days) },
    });
  }

  // Owner drawing — excluded from the income statement, included in the cash book.
  await prisma.moneyMovement.create({
    data: { accountId: cash.id, type: "DRAWING", amountPaisa: -rupees(25_000), note: "Owner drawing", date: daysAgo(10) },
  });

  // --- Report ---------------------------------------------------------------
  const counts = {
    products: await prisma.product.count(),
    customers: await prisma.customer.count(),
    suppliers: await prisma.supplier.count(),
    purchases: await prisma.purchase.count(),
    invoices: await prisma.invoice.count(),
    expenses: await prisma.expense.count(),
    movements: await prisma.moneyMovement.count(),
  };
  const cashBalance = await prisma.moneyMovement.aggregate({ _sum: { amountPaisa: true }, where: { accountId: cash.id } });
  const bankBalance = await prisma.moneyMovement.aggregate({ _sum: { amountPaisa: true }, where: { accountId: bank.id } });
  console.log("Demo data seeded:", counts);
  console.log(`Cash in hand: Rs ${((cashBalance._sum.amountPaisa ?? 0) / 100).toLocaleString()}`);
  console.log(`Bank:         Rs ${((bankBalance._sum.amountPaisa ?? 0) / 100).toLocaleString()}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
