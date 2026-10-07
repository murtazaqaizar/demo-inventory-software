import { prisma } from "@/lib/prisma";
import { num } from "@/lib/sql";
import { stockKey } from "@/lib/variants";

// Current stock (in thousandths of the product unit — see src/lib/qty.ts) is the sum of all movement deltas — never a mutable
// counter, so the count can always be reconciled against its history.
export async function getStockMap(productIds?: string[]): Promise<Map<string, number>> {
  const grouped = await prisma.stockMovement.groupBy({
    by: ["productId"],
    _sum: { qtyMilli: true },
    where: productIds ? { productId: { in: productIds } } : undefined,
  });
  const map = new Map<string, number>();
  for (const g of grouped) map.set(g.productId, g._sum.qtyMilli ?? 0);
  return map;
}

// Per-color stock, keyed by stockKey(productId, colorId). Products without colors
// land under the "" color, so the key also works for them.
export async function getColorStockMap(productIds?: string[]): Promise<Map<string, number>> {
  const grouped = await prisma.stockMovement.groupBy({
    by: ["productId", "colorId"],
    _sum: { qtyMilli: true },
    where: productIds ? { productId: { in: productIds } } : undefined,
  });
  const map = new Map<string, number>();
  for (const g of grouped) map.set(stockKey(g.productId, g.colorId), g._sum.qtyMilli ?? 0);
  return map;
}

export type LowStockProduct = {
  id: string;
  name: string;
  size: string | null;
  variant: string | null;
  minStockMilli: number;
  unit: string; // short label, e.g. "m"
  qty: number; // thousandths
};

// Products at or below their minimum, computed in Postgres. The dashboard used to
// load every active product plus every stock movement and filter in JS to show six.
export async function getLowStock(): Promise<LowStockProduct[]> {
  const rows = await prisma.$queryRaw<
    (Omit<LowStockProduct, "qty"> & { qty: number | string })[]
  >`
    SELECT p."id", p."name", p."size", p."variant", p."minStockMilli",
           COALESCE(un."short", 'pcs') AS "unit",
           COALESCE(SUM(m."qtyMilli"), 0) AS "qty"
    FROM "Product" p
    LEFT JOIN "Category" c ON c."id" = p."categoryId"
    LEFT JOIN "Unit" un ON un."id" = c."unitId"
    LEFT JOIN "StockMovement" m ON m."productId" = p."id"
    WHERE p."active" = true
    GROUP BY p."id", p."name", p."size", p."variant", p."minStockMilli", un."short"
    HAVING COALESCE(SUM(m."qtyMilli"), 0) <= p."minStockMilli"
    ORDER BY (COALESCE(SUM(m."qtyMilli"), 0) - p."minStockMilli") ASC, p."name" ASC
  `;
  return rows.map((r) => ({ ...r, qty: num(r.qty) }));
}

export async function getCurrentStock(productId: string): Promise<number> {
  const res = await prisma.stockMovement.aggregate({
    _sum: { qtyMilli: true },
    where: { productId },
  });
  return res._sum.qtyMilli ?? 0;
}
