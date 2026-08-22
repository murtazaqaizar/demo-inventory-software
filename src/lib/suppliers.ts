import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// Payable balance to a supplier = charges (purchases on credit) − payments made.
export async function getSupplierBalances(): Promise<Map<string, number>> {
  const grouped = await prisma.supplierLedgerEntry.groupBy({
    by: ["supplierId", "direction"],
    _sum: { amountPaisa: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) {
    const cur = map.get(g.supplierId) ?? 0;
    const amt = g._sum.amountPaisa ?? 0;
    map.set(g.supplierId, cur + (g.direction === "CHARGE" ? amt : -amt));
  }
  return map;
}

// One supplier's payable, without grouping the whole ledger table the way
// getSupplierBalances does — for pages that only care about a single supplier.
// Takes an optional client so it can be run inside a transaction (the verify
// script does exactly that to check it against the ledger).
export async function getSupplierBalance(
  supplierId: string,
  client: Prisma.TransactionClient = prisma
): Promise<number> {
  const grouped = await client.supplierLedgerEntry.groupBy({
    by: ["direction"],
    _sum: { amountPaisa: true },
    where: { supplierId },
  });
  return grouped.reduce((total, g) => {
    const amt = g._sum.amountPaisa ?? 0;
    return total + (g.direction === "CHARGE" ? amt : -amt);
  }, 0);
}

// Deciding whether a supplier can be deleted outright or must be hidden. A
// supplier with purchases or ledger entries is referenced by payables and by
// landed-cost history, so deleting it would orphan that — hide it instead.
// Same rule as Product and Customer.
export async function supplierHasHistory(
  tx: Prisma.TransactionClient,
  supplierId: string
): Promise<boolean> {
  const [purchases, entries] = await Promise.all([
    tx.purchase.count({ where: { supplierId } }),
    tx.supplierLedgerEntry.count({ where: { supplierId } }),
  ]);
  return purchases + entries > 0;
}
