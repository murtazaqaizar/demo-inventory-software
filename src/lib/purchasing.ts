// Purchasing domain logic (spec features 7-10).
//
// `allocateLandedCost` is pure. The apply/reverse pair below is the single place
// that knows what a purchase writes to the rest of the system — line items,
// stock-in movements and the supplier payable — so create, edit and delete all
// stay in step. Both take a transaction client, which also lets the verify
// script exercise the real shipped code inside a rolled-back transaction.

import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export type PurchaseLineInput = {
  productId: string;
  pieces: number;
  supplierUnitCostPaisa: number;
};

export type AllocatedLine = PurchaseLineInput & {
  lineValuePaisa: number;
  landedUnitCostPaisa: number;
};

export function allocateLandedCost(
  lines: PurchaseLineInput[],
  extrasPaisa: number
): { lines: AllocatedLine[]; totalValuePaisa: number } {
  const withValue = lines.map((l) => ({
    ...l,
    lineValuePaisa: l.supplierUnitCostPaisa * l.pieces,
  }));
  const totalValuePaisa = withValue.reduce((s, l) => s + l.lineValuePaisa, 0);

  const allocated = withValue.map((l) => {
    const share =
      totalValuePaisa > 0
        ? Math.round((extrasPaisa * l.lineValuePaisa) / totalValuePaisa)
        : Math.round(extrasPaisa / withValue.length);
    const landedUnitCostPaisa =
      l.supplierUnitCostPaisa + (l.pieces > 0 ? Math.round(share / l.pieces) : 0);
    return { ...l, landedUnitCostPaisa };
  });

  return { lines: allocated, totalValuePaisa };
}

// ---------------------------------------------------------------------------
// Effects of a purchase on stock, cost and payables
// ---------------------------------------------------------------------------

// Latest-cost method (feature 9): value stock at the most recent cost. After an
// edit or delete the "most recent" purchase may have changed, so re-derive it
// from whatever PURCHASE_IN movements remain. If none remain the product's cost
// came from somewhere else (opening stock, manual edit) — leave it alone, which
// is why this is an UPDATE ... FROM and not a blanket write.
//
// One statement for every product involved, deliberately. Doing this per product
// meant two round-trips each, and against hosted Postgres a five-line purchase
// blew the 5s interactive-transaction limit (P2028).
export async function recomputeLatestCosts(tx: Tx, productIds: string[]) {
  if (productIds.length === 0) return;
  await tx.$executeRaw`
    UPDATE "Product" p
    SET "latestCostPaisa" = m."unitCostPaisa"
    FROM (
      SELECT DISTINCT ON ("productId") "productId", "unitCostPaisa"
      FROM "StockMovement"
      WHERE "type" = 'PURCHASE_IN' AND "productId" = ANY(${productIds})
      ORDER BY "productId", "createdAt" DESC, "id" DESC
    ) m
    WHERE p."id" = m."productId"
  `;
}

// Undo a purchase's line items, stock-in and payable. Leaves the Purchase row.
export async function reversePurchaseEffects(
  tx: Tx,
  purchase: { id: string; supplierId: string | null }
) {
  await tx.stockMovement.deleteMany({ where: { purchaseId: purchase.id } });

  // Charges raised by this purchase. Rows created before the purchaseId column
  // existed are matched on the note they were written with.
  await tx.supplierLedgerEntry.deleteMany({
    where: {
      OR: [
        { purchaseId: purchase.id },
        ...(purchase.supplierId
          ? [
              {
                purchaseId: null,
                supplierId: purchase.supplierId,
                direction: "CHARGE" as const,
                note: `Purchase ${purchase.id.slice(-6)}`,
              },
            ]
          : []),
      ],
    },
  });

  await tx.purchaseItem.deleteMany({ where: { purchaseId: purchase.id } });
}

// Write the line items, stock-in and payable for a Purchase row that exists.
export async function applyPurchaseEffects(
  tx: Tx,
  purchase: { id: string; number: number; supplierId: string | null; onCredit: boolean },
  computed: AllocatedLine[],
  totalValuePaisa: number
) {
  await tx.purchaseItem.createMany({
    data: computed.map((c) => ({
      purchaseId: purchase.id,
      productId: c.productId,
      pieces: c.pieces,
      supplierUnitCostPaisa: c.supplierUnitCostPaisa,
      landedUnitCostPaisa: c.landedUnitCostPaisa,
    })),
  });

  // Stock in (feature 7) at the true landed cost. One insert for every line —
  // a create per line is what pushed this transaction past its time limit.
  await tx.stockMovement.createMany({
    data: computed.map((c) => ({
      productId: c.productId,
      type: "PURCHASE_IN" as const,
      piecesDelta: c.pieces,
      unitCostPaisa: c.landedUnitCostPaisa,
      reason: "Purchase received",
      purchaseId: purchase.id,
    })),
  });

  // Credit purchase posts to the supplier's payable (feature 10) — supplier price only.
  if (purchase.onCredit && purchase.supplierId) {
    await tx.supplierLedgerEntry.create({
      data: {
        supplierId: purchase.supplierId,
        direction: "CHARGE",
        amountPaisa: totalValuePaisa,
        note: `Purchase #${purchase.number}`,
        purchaseId: purchase.id,
      },
    });
  }
}

// Net stock change per product when a purchase's lines change: the old pieces
// come back out, the new pieces go in. A product on both sides nets out, which
// is why this is a map keyed by product and not a per-line diff. Pure, so the
// sign convention can be tested directly — it feeds `findShortProducts`, whose
// answer decides whether an edit or delete is allowed at all.
//
// Deleting a purchase is the same calculation with no new lines.
export function stockDelta(
  oldItems: { productId: string; pieces: number }[],
  newLines: { productId: string; pieces: number }[] = []
): Map<string, number> {
  const delta = new Map<string, number>();
  for (const it of oldItems) delta.set(it.productId, (delta.get(it.productId) ?? 0) - it.pieces);
  for (const l of newLines) delta.set(l.productId, (delta.get(l.productId) ?? 0) + l.pieces);
  return delta;
}

// Removing or shrinking a received line takes stock back out. If those pieces
// have already been sold the count would go negative, so the caller refuses and
// names the products — the owner should void the bills (or adjust stock) first.
export async function findShortProducts(
  tx: Tx,
  deltaByProduct: Map<string, number>
): Promise<string[]> {
  const ids = [...deltaByProduct.keys()];
  if (ids.length === 0) return [];

  const [grouped, products] = await Promise.all([
    tx.stockMovement.groupBy({
      by: ["productId"],
      _sum: { piecesDelta: true },
      where: { productId: { in: ids } },
    }),
    tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ]);

  const stock = new Map(grouped.map((g) => [g.productId, g._sum.piecesDelta ?? 0]));
  const names = new Map(products.map((p) => [p.id, p.name]));

  const short: string[] = [];
  for (const [productId, delta] of deltaByProduct) {
    if ((stock.get(productId) ?? 0) + delta < 0) short.push(names.get(productId) ?? productId);
  }
  return short;
}
