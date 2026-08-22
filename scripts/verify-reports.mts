/**
 * READ-ONLY verification for the dashboard + reports rewrites:
 *   - getLowStock       (was: load all products + all stock movements, filter in JS)
 *   - getSalesTotals    (was: three findMany over invoice lines, summed in JS)
 *   - getIncomeStatement (was: every invoice/credit-note line in the period, in JS)
 *
 *   npm run verify:reports
 *
 * Runs the OLD logic against a copy, the NEW logic via the real shipped modules,
 * and exits non-zero on any difference. Performs no writes.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(new URL(url!).hostname);
process.env.DATABASE_URL = url;

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  }),
});

const { getLowStock } = await import("../src/lib/stock.js");
const { getSalesTotals, getIncomeStatement } = await import("../src/lib/reports.js");

let failures = 0;
const eq = (label: string, a: unknown, b: unknown) => {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja !== jb) {
    failures++;
    console.error(`MISMATCH ${label}\n  old=${ja}\n  new=${jb}`);
  }
};

// --- OLD: low stock ---------------------------------------------------------

async function oldLowStock() {
  const products = await prisma.product.findMany({ where: { active: true } });
  const grouped = await prisma.stockMovement.groupBy({
    by: ["productId"],
    _sum: { piecesDelta: true },
    where: { productId: { in: products.map((p) => p.id) } },
  });
  const stock = new Map(grouped.map((g) => [g.productId, g._sum.piecesDelta ?? 0]));
  return products
    .map((p) => ({ ...p, qty: stock.get(p.id) ?? 0 }))
    .filter((p) => p.qty <= p.minStockLevel)
    .sort((a, b) => a.qty - a.minStockLevel - (b.qty - b.minStockLevel))
    .map((p) => ({ id: p.id, qty: p.qty, minStockLevel: p.minStockLevel }));
}

// --- OLD: sales totals ------------------------------------------------------

const sumLines = (items: { ratePaisa: number; quantity: number; isSample: boolean }[]) =>
  items.reduce((s, it) => s + (it.isSample ? 0 : it.ratePaisa * it.quantity), 0);

async function oldSalesTotals(p: {
  startToday: Date;
  startMonth: Date;
  startLastMonth: Date;
  endLastMonth: Date;
}) {
  const sel = { items: { select: { ratePaisa: true, quantity: true, isSample: true } } };
  const [today, month, lastMonth] = await Promise.all([
    prisma.invoice.findMany({ where: { status: "ACTIVE", date: { gte: p.startToday } }, select: sel }),
    prisma.invoice.findMany({ where: { status: "ACTIVE", date: { gte: p.startMonth } }, select: sel }),
    prisma.invoice.findMany({
      where: { status: "ACTIVE", date: { gte: p.startLastMonth, lte: p.endLastMonth } },
      select: sel,
    }),
  ]);
  const sum = (rows: { items: { ratePaisa: number; quantity: number; isSample: boolean }[] }[]) =>
    rows.reduce((s, r) => s + sumLines(r.items), 0);
  return { today: sum(today), month: sum(month), lastMonth: sum(lastMonth) };
}

// --- OLD: income statement --------------------------------------------------

async function oldIncomeStatement(from: Date, to: Date) {
  const [items, returnItems, expenseAgg] = await Promise.all([
    prisma.invoiceItem.findMany({
      where: { invoice: { date: { gte: from, lte: to }, status: "ACTIVE" } },
      include: { product: { select: { code: true, name: true } } },
    }),
    prisma.creditNoteItem.findMany({
      where: { creditNote: { date: { gte: from, lte: to } } },
      include: { product: { select: { code: true, name: true } } },
    }),
    prisma.expense.aggregate({ _sum: { amountPaisa: true }, where: { date: { gte: from, lte: to } } }),
  ]);

  let salesPaisa = 0;
  let cogsPaisa = 0;
  let samplesCostPaisa = 0;
  type ProductRow = {
    productId: string;
    code: string;
    name: string;
    qtyPieces: number;
    revenuePaisa: number;
    cogsPaisa: number;
    profitPaisa: number;
  };
  const map = new Map<string, ProductRow>();

  for (const it of items) {
    const lineCost = it.unitCostPaisa * it.pieces;
    if (it.isSample) {
      samplesCostPaisa += lineCost;
      continue;
    }
    const lineRevenue = it.ratePaisa * it.quantity;
    salesPaisa += lineRevenue;
    cogsPaisa += lineCost;
    const cur =
      map.get(it.productId) ??
      { productId: it.productId, code: it.product.code, name: it.product.name, qtyPieces: 0, revenuePaisa: 0, cogsPaisa: 0, profitPaisa: 0 };
    cur.qtyPieces += it.pieces;
    cur.revenuePaisa += lineRevenue;
    cur.cogsPaisa += lineCost;
    cur.profitPaisa = cur.revenuePaisa - cur.cogsPaisa;
    map.set(it.productId, cur);
  }

  for (const r of returnItems) {
    const lineRevenue = r.ratePaisa * r.quantity;
    const lineCost = r.unitCostPaisa * r.pieces;
    salesPaisa -= lineRevenue;
    cogsPaisa -= lineCost;
    const cur =
      map.get(r.productId) ??
      { productId: r.productId, code: r.product.code, name: r.product.name, qtyPieces: 0, revenuePaisa: 0, cogsPaisa: 0, profitPaisa: 0 };
    cur.qtyPieces -= r.pieces;
    cur.revenuePaisa -= lineRevenue;
    cur.cogsPaisa -= lineCost;
    cur.profitPaisa = cur.revenuePaisa - cur.cogsPaisa;
    map.set(r.productId, cur);
  }

  const expensesPaisa = expenseAgg._sum.amountPaisa ?? 0;
  const grossPaisa = salesPaisa - cogsPaisa;
  return {
    statement: {
      salesPaisa,
      cogsPaisa,
      grossPaisa,
      expensesPaisa,
      samplesCostPaisa,
      netPaisa: grossPaisa - expensesPaisa - samplesCostPaisa,
    },
    perProduct: [...map.values()].sort((a, b) => b.profitPaisa - a.profitPaisa),
  };
}

// --- Compare ----------------------------------------------------------------

async function main() {
  // Low stock. Sorted by the same key; ties can order differently between the two
  // (the new query adds a name tiebreak), so compare as a keyed map plus the count.
  const oldLow = await oldLowStock();
  const newLowRaw = await getLowStock();
  const newLow = newLowRaw.map((p) => ({ id: p.id, qty: p.qty, minStockLevel: p.minStockLevel }));
  // Sort the pairs before comparing: JSON.stringify on an object is sensitive to
  // insertion order, so the keyed map alone still failed whenever several
  // products tied (e.g. every one of them at 0 stock / 0 minimum) and the two
  // implementations happened to emit them in a different order.
  const key = (rows: typeof oldLow) =>
    rows.map((r) => `${r.id}=${r.qty}/${r.minStockLevel}`).sort();
  eq("lowStock membership", key(oldLow), key(newLow));
  eq("lowStock count", oldLow.length, newLow.length);
  // Sort order must still put the most-short product first.
  eq(
    "lowStock ordering (by shortfall)",
    oldLow.map((r) => r.qty - r.minStockLevel),
    newLow.map((r) => r.qty - r.minStockLevel)
  );

  // Sales totals, using the dashboard's own period maths.
  const now = new Date();
  const periods = {
    startToday: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    startMonth: new Date(now.getFullYear(), now.getMonth(), 1),
    startLastMonth: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    endLastMonth: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
  };
  eq("salesTotals", await oldSalesTotals(periods), await getSalesTotals(periods));

  // Income statement over several periods, including ones with no data.
  const ranges: [string, Date, Date][] = [
    ["this month", periods.startMonth, now],
    ["last month", periods.startLastMonth, periods.endLastMonth],
    ["this year", new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)],
    ["all time", new Date(2000, 0, 1), new Date(2100, 0, 1)],
    ["empty range", new Date(1990, 0, 1), new Date(1990, 11, 31)],
  ];
  for (const [label, from, to] of ranges) {
    const o = await oldIncomeStatement(from, to);
    const n = await getIncomeStatement(from, to);
    eq(`incomeStatement[${label}] statement`, o.statement, n.statement);
    eq(
      `incomeStatement[${label}] perProduct`,
      o.perProduct.map((p) => [p.productId, p.qtyPieces, p.revenuePaisa, p.cogsPaisa, p.profitPaisa]),
      n.perProduct.map((p) => [p.productId, p.qtyPieces, p.revenuePaisa, p.cogsPaisa, p.profitPaisa])
    );
  }

  console.log(`\nlow-stock products : ${newLow.length}`);
  console.log(`income ranges      : ${ranges.length}`);
  console.log(failures === 0 ? "\n✅ identical — safe to ship" : `\n❌ ${failures} mismatch(es)`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
