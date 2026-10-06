import { prisma } from "@/lib/prisma";
import { num } from "@/lib/sql";

export type SalesTotals = { today: number; month: number; lastMonth: number };

// The three dashboard sales figures in one query. Previously this pulled every
// invoice line for all three periods into Node just to add them up.
export async function getSalesTotals(periods: {
  startToday: Date;
  startMonth: Date;
  startLastMonth: Date;
  endLastMonth: Date;
}): Promise<SalesTotals> {
  const { startToday, startMonth, startLastMonth, endLastMonth } = periods;
  const rows = await prisma.$queryRaw<
    { today: number | string; month: number | string; lastMonth: number | string }[]
  >`
    SELECT
      COALESCE(SUM(CASE WHEN x."date" >= ${startToday} THEN x."amt" ELSE 0 END), 0) AS "today",
      COALESCE(SUM(CASE WHEN x."date" >= ${startMonth} THEN x."amt" ELSE 0 END), 0) AS "month",
      COALESCE(SUM(CASE WHEN x."date" >= ${startLastMonth} AND x."date" <= ${endLastMonth}
                        THEN x."amt" ELSE 0 END), 0) AS "lastMonth"
    FROM (
      SELECT i."date" AS "date",
             CASE WHEN it."isSample" THEN 0 ELSE ROUND(it."qtyMilli"::numeric * it."ratePaisa" / 1000) END AS "amt"
      FROM "Invoice" i
      JOIN "InvoiceItem" it ON it."invoiceId" = i."id"
      WHERE i."status" = 'ACTIVE' AND i."date" >= ${startLastMonth}
    ) x
  `;
  const r = rows[0];
  return { today: num(r?.today), month: num(r?.month), lastMonth: num(r?.lastMonth) };
}

export type IncomeStatement = {
  salesPaisa: number;
  cogsPaisa: number;
  grossPaisa: number;
  expensesPaisa: number;
  samplesCostPaisa: number;
  netPaisa: number;
};

// One row per product, plus a single "Custom items" row (productId null) for
// free-text bill lines. qtyMilli is in `unit` (short label); on the custom row units may mix,
// so it is null there.
export type ProductProfit = {
  productId: string | null;
  code: string;
  name: string;
  unit: string; // short label, e.g. "m"
  qtyMilli: number | null;
  revenuePaisa: number;
  cogsPaisa: number;
  profitPaisa: number;
};

// Income statement for a period (spec feature 27): Sales − COGS = Gross;
// − Expenses − free-sample cost = Net. Latest-cost method (feature 9) is baked
// into each invoice line's captured unitCostPaisa. Owner drawings are excluded.
export async function getIncomeStatement(from: Date, to: Date): Promise<{
  statement: IncomeStatement;
  perProduct: ProductProfit[];
}> {
  // All three sides are grouped by product in Postgres, so what comes back is one
  // row per product rather than every line item in the period.
  type AggRow = {
    productId: string | null;
    code: string | null;
    name: string | null;
    unit: string;
    qty: number | string;
    revenue: number | string;
    cogs: number | string;
  };

  const [soldRows, returnRows, sampleAgg, expenseAgg] = await Promise.all([
    // Voided bills never count as sales (improvement 2). Sample lines carry no
    // revenue and are handled separately below.
    prisma.$queryRaw<AggRow[]>`
      SELECT it."productId", p."code", p."name", COALESCE(un."short", 'pcs') AS "unit",
             SUM(it."qtyMilli")                          AS "qty",
             SUM(ROUND(it."qtyMilli"::numeric * it."ratePaisa" / 1000))       AS "revenue",
             SUM(ROUND(it."qtyMilli"::numeric * it."unitCostPaisa" / 1000))     AS "cogs"
      FROM "InvoiceItem" it
      JOIN "Invoice" i ON i."id" = it."invoiceId"
      LEFT JOIN "Product" p ON p."id" = it."productId"
      LEFT JOIN "Category" c ON c."id" = p."categoryId"
      LEFT JOIN "Unit" un ON un."id" = c."unitId"
      WHERE i."status" = 'ACTIVE'
        AND i."date" >= ${from} AND i."date" <= ${to}
        AND it."isSample" = false
      GROUP BY it."productId", p."code", p."name", un."short"
    `,
    // Returns reduce sales and COGS in the period they happen (improvement 3).
    prisma.$queryRaw<AggRow[]>`
      SELECT ci."productId", p."code", p."name", COALESCE(un."short", 'pcs') AS "unit",
             SUM(ci."qtyMilli")                          AS "qty",
             SUM(ROUND(ci."qtyMilli"::numeric * ci."ratePaisa" / 1000))       AS "revenue",
             SUM(ROUND(ci."qtyMilli"::numeric * ci."unitCostPaisa" / 1000))     AS "cogs"
      FROM "CreditNoteItem" ci
      JOIN "CreditNote" n ON n."id" = ci."creditNoteId"
      LEFT JOIN "Product" p ON p."id" = ci."productId"
      LEFT JOIN "Category" c ON c."id" = p."categoryId"
      LEFT JOIN "Unit" un ON un."id" = c."unitId"
      WHERE n."date" >= ${from} AND n."date" <= ${to}
      GROUP BY ci."productId", p."code", p."name", un."short"
    `,
    // Free samples: no revenue, their cost is booked as marketing (DECISIONS §5).
    prisma.$queryRaw<{ cost: number | string }[]>`
      SELECT COALESCE(SUM(ROUND(it."qtyMilli"::numeric * it."unitCostPaisa" / 1000)), 0) AS "cost"
      FROM "InvoiceItem" it
      JOIN "Invoice" i ON i."id" = it."invoiceId"
      WHERE i."status" = 'ACTIVE'
        AND i."date" >= ${from} AND i."date" <= ${to}
        AND it."isSample" = true
    `,
    prisma.expense.aggregate({ _sum: { amountPaisa: true }, where: { date: { gte: from, lte: to } } }),
  ]);

  let salesPaisa = 0;
  let cogsPaisa = 0;
  const samplesCostPaisa = num(sampleAgg[0]?.cost);
  const perProductMap = new Map<string, ProductProfit>();

  const CUSTOM = "custom";
  const keyOf = (r: AggRow) => r.productId ?? CUSTOM;
  const entryFor = (r: AggRow): ProductProfit =>
    perProductMap.get(keyOf(r)) ??
    {
      productId: r.productId,
      code: r.code ?? "—",
      name: r.name ?? "Custom items (not from stock)",
      unit: r.unit,
      qtyMilli: r.productId ? 0 : null,
      revenuePaisa: 0,
      cogsPaisa: 0,
      profitPaisa: 0,
    };

  for (const r of soldRows) {
    const revenue = num(r.revenue);
    const cost = num(r.cogs);
    salesPaisa += revenue;
    cogsPaisa += cost;

    const cur = entryFor(r);
    if (cur.qtyMilli !== null) cur.qtyMilli += num(r.qty);
    cur.revenuePaisa += revenue;
    cur.cogsPaisa += cost;
    cur.profitPaisa = cur.revenuePaisa - cur.cogsPaisa;
    perProductMap.set(keyOf(r), cur);
  }

  // Subtract returns: revenue comes back off sales, and the goods come back into stock
  // so their cost comes off COGS.
  for (const r of returnRows) {
    const revenue = num(r.revenue);
    const cost = num(r.cogs);
    salesPaisa -= revenue;
    cogsPaisa -= cost;

    const cur = entryFor(r);
    if (cur.qtyMilli !== null) cur.qtyMilli -= num(r.qty);
    cur.revenuePaisa -= revenue;
    cur.cogsPaisa -= cost;
    cur.profitPaisa = cur.revenuePaisa - cur.cogsPaisa;
    perProductMap.set(keyOf(r), cur);
  }

  const expensesPaisa = expenseAgg._sum.amountPaisa ?? 0;
  const grossPaisa = salesPaisa - cogsPaisa;
  const netPaisa = grossPaisa - expensesPaisa - samplesCostPaisa;

  const perProduct = [...perProductMap.values()].sort((a, b) => b.profitPaisa - a.profitPaisa);

  return {
    statement: { salesPaisa, cogsPaisa, grossPaisa, expensesPaisa, samplesCostPaisa, netPaisa },
    perProduct,
  };
}

// Resolve a period from query params: ?year=YYYY (whole year) or ?month=YYYY-MM.
// Defaults to the current month.
export function resolvePeriod(params: { month?: string; year?: string }): {
  from: Date;
  to: Date;
  label: string;
  mode: "month" | "year";
} {
  if (params.year && /^\d{4}$/.test(params.year)) {
    const y = Number(params.year);
    return {
      from: new Date(y, 0, 1, 0, 0, 0, 0),
      to: new Date(y, 11, 31, 23, 59, 59, 999),
      label: String(y),
      mode: "year",
    };
  }
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
    const [yy, mm] = params.month.split("-").map(Number);
    y = yy;
    m = mm - 1;
  }
  const from = new Date(y, m, 1, 0, 0, 0, 0);
  const to = new Date(y, m + 1, 0, 23, 59, 59, 999);
  return {
    from,
    to,
    label: from.toLocaleDateString("en-PK", { month: "long", year: "numeric" }),
    mode: "month",
  };
}
