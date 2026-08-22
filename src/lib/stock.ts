import { prisma } from "@/lib/prisma";
import { num } from "@/lib/sql";
import type { SaleUnit } from "@/generated/prisma/enums";

// Current stock (in pieces) is the sum of all movement deltas — never a mutable
// counter, so the count can always be reconciled against its history.
export async function getStockMap(productIds?: string[]): Promise<Map<string, number>> {
  const grouped = await prisma.stockMovement.groupBy({
    by: ["productId"],
    _sum: { piecesDelta: true },
    where: productIds ? { productId: { in: productIds } } : undefined,
  });
  const map = new Map<string, number>();
  for (const g of grouped) map.set(g.productId, g._sum.piecesDelta ?? 0);
  return map;
}

export type LowStockProduct = {
  id: string;
  name: string;
  size: string | null;
  variant: string | null;
  minStockLevel: number;
  qty: number;
};

// Products at or below their minimum, computed in Postgres. The dashboard used to
// load every active product plus every stock movement and filter in JS to show six.
export async function getLowStock(): Promise<LowStockProduct[]> {
  const rows = await prisma.$queryRaw<
    (Omit<LowStockProduct, "qty"> & { qty: number | string })[]
  >`
    SELECT p."id", p."name", p."size", p."variant", p."minStockLevel",
           COALESCE(SUM(m."piecesDelta"), 0) AS "qty"
    FROM "Product" p
    LEFT JOIN "StockMovement" m ON m."productId" = p."id"
    WHERE p."active" = true
    GROUP BY p."id", p."name", p."size", p."variant", p."minStockLevel"
    HAVING COALESCE(SUM(m."piecesDelta"), 0) <= p."minStockLevel"
    ORDER BY (COALESCE(SUM(m."piecesDelta"), 0) - p."minStockLevel") ASC, p."name" ASC
  `;
  return rows.map((r) => ({ ...r, qty: num(r.qty) }));
}

export async function getCurrentStock(productId: string): Promise<number> {
  const res = await prisma.stockMovement.aggregate({
    _sum: { piecesDelta: true },
    where: { productId },
  });
  return res._sum.piecesDelta ?? 0;
}

// Convert a quantity in a chosen unit to pieces using the product's conversions.
export function piecesFor(
  unit: SaleUnit,
  quantity: number,
  product: { piecesPerBox: number; piecesPerCarton: number }
): number {
  switch (unit) {
    case "BOX":
      return quantity * (product.piecesPerBox || 1);
    case "CARTON":
      return quantity * (product.piecesPerCarton || 1);
    default:
      return quantity;
  }
}
